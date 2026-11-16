import type { Message, RoomId, RoomKind, User } from "@ember/protocol";
import { credentialsOf } from "./auth";
import { originFor } from "./custom-domain";
import type { Env } from "./env";
import { contentDisposition } from "./files/filename";
import { versionOf } from "./version";
import { workspace } from "./workspace";

// A member's download of a room's messages, DMs included, as JSON Lines: a line describing the room and
// the export, then a line for each message, oldest first. It reads the room a page at a time and writes
// each page as it has it, so a long room is never in memory whole.

/** Changes when a line's keys change meaning, so whatever reads a file can tell which it has. */
export const EXPORT_FORMAT = 1;

/** How many messages the room reads at once. */
export const EXPORT_PAGE_SIZE = 100;

/** A room as its export describes it: a DM has no name, and lists its members instead. */
export interface ExportedRoom {
  id: RoomId;
  kind: RoomKind;
  name: string | null;
  members?: User[];
}

const problem = (status: number, message: string) => Response.json({ error: message }, { status });

const person = ({ id, name }: User) => ({ id, name });

/** The first line: the room, and when and by what the export was made. */
export function headerLine(room: ExportedRoom, exportedAt: string, version: string): string {
  return line({
    type: "room",
    format: EXPORT_FORMAT,
    exported_at: exportedAt,
    ember_version: version,
    room: { id: room.id, kind: room.kind, name: room.name, ...(room.members && { members: room.members.map(person) }) },
  });
}

/**
 * A message's line: its text as plain text and as the markup the room keeps, its author under the name
 * it was written with, the message it replies to if it's a reply, the AI app that sent it if one did,
 * its boosts and its file's address on
 * `origin`, which opens the file for whoever has it, as the room's links do.
 */
export function messageLine(message: Message, origin: string): string {
  const { attachment } = message;
  return line({
    type: "message",
    id: message.id,
    created_at: message.createdAt,
    edited_at: message.editedAt,
    author: person(message.creator),
    text: message.plainText,
    html: message.body,
    ...(message.parentId !== undefined && { in_reply_to: message.parentId }),
    ...(message.sentVia !== undefined && { sent_via: message.sentVia }),
    boosts: message.boosts.map((boost) => ({ id: boost.id, content: boost.content, by: person(boost.booster), created_at: boost.createdAt })),
    ...(attachment && { attachment: { name: attachment.name, content_type: attachment.contentType, byte_size: attachment.byteSize, url: `${origin}${attachment.downloadUrl}` } }),
  });
}

const line = (value: unknown) => `${JSON.stringify(value)}\n`;

/** The file's name: the room's name or "direct-messages", in letters, digits and hyphens, and the day. */
export function exportFileName(room: ExportedRoom, exportedAt: string): string {
  const name = room.kind === "direct" ? "direct-messages" : (room.name ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return `ember-${name || "room"}-${exportedAt.slice(0, 10)}.jsonl`;
}

/**
 * The room's messages as JSON Lines, a page at a time as the response is read, with deleted messages
 * left out. A message kept only for its thread's replies has nothing to export, so it is one of them.
 */
function exported(env: Env, room: ExportedRoom, exportedAt: string, origin: string, version: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const stub = env.CHAT_ROOM.getByName(room.id);
  let after = "";
  let started = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!started) {
        started = true;
        controller.enqueue(encoder.encode(headerLine(room, exportedAt, version)));
        return;
      }
      const { messages, last } = await stub.exportPage(room.id, after, EXPORT_PAGE_SIZE);
      const lines = messages.filter((message) => !message.deleted).map((message) => messageLine(message, origin)).join("");
      if (lines !== "") controller.enqueue(encoder.encode(lines));
      if (last || messages.length === 0) controller.close();
      else after = messages.at(-1)!.id;
    },
  });
}

/**
 * `GET /api/rooms/<room id>/export`: the room's messages as a download, for someone in the room: 401
 * without a session, 403 for a guest, 404 unless they're in the room, as every room's address answers,
 * and 429 once they've asked for too many in an hour.
 */
export async function exportRoom(request: Request, env: Env, roomId: RoomId): Promise<Response> {
  const credentials = await credentialsOf(request, env);
  const room = credentials && (await workspace(env).beginRoomExport(credentials, roomId));
  if (!room) return problem(401, "Not signed in");
  if (room === "forbidden") return problem(403, "Guests can't download a room's messages");
  if (room === "not found") return problem(404, "Room not found or inaccessible");
  if (room === "limited") return problem(429, "Too many downloads. Try again in an hour.");

  const exportedAt = new Date().toISOString();
  const origin = originFor(request, (await workspace(env).account())?.customDomain ?? null);
  return new Response(exported(env, room, exportedAt, origin, versionOf(env)), {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Content-Disposition": contentDisposition("attachment", exportFileName(room, exportedAt)),
      "Cache-Control": "no-store",
    },
  });
}
