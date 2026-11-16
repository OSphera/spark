import type { Me, NewWorkspace, RoomId } from "@ember/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { EXPORT_FORMAT, EXPORT_PAGE_SIZE } from "../src/room-export";
import { api, connect, cookieOf, createRoom, direct, freshDeploy, freshRoom, post, settle, shown, signIn, upload, workspaceSql, type Session, type Socket } from "./support";

// A member's download of a room's messages as JSON Lines.

const ada = { name: "Ada Lovelace", emailAddress: "ada@example.com", password: "analytical engine" };
const grace = { name: "Grace Hopper", emailAddress: "grace@example.com", password: "compiler design" };

/** Sets Ember up with Ada as its administrator, signed in. */
async function setUp(): Promise<Session> {
  const response = await api("/api/first_run", { method: "POST", body: JSON.stringify(ada) });
  expect(response.status).toBe(201);
  return { user: shown(((await response.json()) as NewWorkspace).user), cookie: cookieOf(response) };
}

/** Grace joins with the join link, as a member, signed in. */
async function joinAsGrace(): Promise<Session> {
  const [{ join_code: joinCode }] = (await workspaceSql("SELECT join_code FROM accounts")) as [{ join_code: string }];
  const response = await api(`/api/join/${joinCode}`, { method: "POST", body: JSON.stringify(grace) });
  expect(response.status, await response.clone().text()).toBe(201);
  return { user: shown(((await response.json()) as { user: Me }).user), cookie: cookieOf(response) };
}

const download = (session: Session | null, roomId: RoomId) => api(`/api/rooms/${roomId}/export`, { headers: session ? { Cookie: session.cookie } : {} });

/** A download's text: read as bytes, since workerd warns of `text()` on a body it doesn't know to be text. */
const textOf = async (response: Response) => new TextDecoder().decode(await response.arrayBuffer());

/** The lines of an export, parsed, after checking that each is one line of JSON. */
async function linesOf(response: Response): Promise<Array<Record<string, any>>> {
  const text = await textOf(response);
  expect(text.endsWith("\n")).toBe(true);
  return text.split("\n").slice(0, -1).map((line) => JSON.parse(line) as Record<string, any>);
}

/** Replies in `parentId`'s thread as `client`, only there, and waits for the room to confirm it. */
async function reply(client: Socket, parentId: string, body: string) {
  const clientMessageId = crypto.randomUUID();
  client.send({ type: "message.create", clientMessageId, body, parentId, alsoSend: false });
  for (;;) {
    const { message } = await client.next("message.created");
    if (message.clientMessageId === clientMessageId) return message;
  }
}

beforeEach(freshDeploy);

describe("Download a room's messages", () => {
  it("answers a file of JSON Lines, named for the room and the day, that browsers don't keep", async () => {
    const administrator = await setUp();
    const room = (await createRoom("Design Team!", { as: administrator })).id;
    const response = await download(administrator, room);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/x-ndjson");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const today = new Date().toISOString().slice(0, 10);
    expect(response.headers.get("Content-Disposition")).toMatch(new RegExp(`^attachment; filename="ember-design-team-(\\d{4}-\\d{2}-\\d{2})\\.jsonl"; filename\\*=UTF-8''ember-design-team-\\d{4}-\\d{2}-\\d{2}\\.jsonl$`));
    expect(response.headers.get("Content-Disposition")).toContain(today);
  });

  it("starts with a line describing the room and the export, then has a line for each message, oldest first", async () => {
    const administrator = await setUp();
    const room = (await createRoom("Design", { closedTo: [administrator.user.id], as: administrator })).id;
    const client = await connect(room, administrator);
    const first = await post(client, "<p>Hello <strong>there</strong></p>");
    const second = await post(client, "Second");
    const before = Date.now();
    const [header, ...messages] = await linesOf(await download(administrator, room));

    expect(header).toEqual({
      type: "room",
      format: EXPORT_FORMAT,
      exported_at: expect.any(String),
      ember_version: expect.any(String),
      room: { id: room, kind: "closed", name: "Design" },
    });
    expect(Math.abs(Date.parse(header!.exported_at) - before)).toBeLessThan(60_000);
    expect(messages).toEqual([
      {
        type: "message",
        id: first.id,
        created_at: first.createdAt,
        edited_at: null,
        author: shown(administrator.user),
        text: "Hello there",
        html: first.body,
        boosts: [],
      },
      expect.objectContaining({ id: second.id, text: "Second" }),
    ]);
    expect(messages[0]!.html).toContain("<strong>there</strong>");
  });

  it("includes thread replies with the message they reply under, leaves out deleted messages, and keeps their thread's", async () => {
    const administrator = await setUp();
    const room = (await createRoom("Threads", { as: administrator })).id;
    const client = await connect(room, administrator);
    const parent = await post(client, "Parent");
    const gone = await post(client, "Gone");
    const kept = await post(client, "Kept for its thread");
    const answer = await reply(client, parent.id, "Only in the thread");
    await reply(client, kept.id, "Under a deleted message");
    client.send({ type: "message.delete", messageId: gone.id });
    await client.next("message.deleted");
    client.send({ type: "message.delete", messageId: kept.id });
    await client.next("message.updated");
    await settle(client);

    const [, ...messages] = await linesOf(await download(administrator, room));
    expect(messages.map((message) => message.text)).toEqual(["Parent", "Only in the thread", "Under a deleted message"]);
    expect(messages[0]).not.toHaveProperty("in_reply_to");
    expect(messages[1]).toMatchObject({ id: answer.id, in_reply_to: parent.id });
    expect(messages[2]).toMatchObject({ in_reply_to: kept.id });
  });

  it("lists who boosted a message with what, and a file message's file", async () => {
    const administrator = await setUp();
    const gracie = await joinAsGrace();
    const room = await freshRoom("Boosts");
    const [adaClient, graceClient] = [await connect(room, administrator), await connect(room, gracie)];
    const message = await post(adaClient, "Nice");
    graceClient.send({ type: "boost.create", messageId: message.id, content: "🔥" });
    const { boost } = await adaClient.next("boost.created");
    const file = await upload(administrator, room, "notes.txt", new TextEncoder().encode("hello"), "text/plain");

    const [, first, second] = await linesOf(await download(gracie, room));
    expect(first!.boosts).toEqual([{ id: boost.id, content: "🔥", by: shown(gracie.user), created_at: boost.createdAt }]);
    expect(second).toMatchObject({
      id: file.id,
      text: "notes.txt",
      attachment: { name: "notes.txt", content_type: "text/plain", byte_size: 5, url: expect.stringMatching(/^https:\/\/ember\.test\/.+/) },
    });
  });

  it("pages through a room longer than a page, in order", async () => {
    const administrator = await setUp();
    const room = (await createRoom("Long", { as: administrator })).id;
    const client = await connect(room, administrator);
    const total = EXPORT_PAGE_SIZE * 2 + 5;
    const ids: string[] = [];
    for (let i = 0; i < total; i++) ids.push((await post(client, `Message ${i}`)).id);

    const [, ...messages] = await linesOf(await download(administrator, room));
    expect(messages.map((message) => message.id)).toEqual(ids);
  });

  it("downloads a DM, which has no name, listing its members", async () => {
    const administrator = await setUp();
    const gracie = await joinAsGrace();
    const dm = await direct(administrator, gracie);
    const client = await connect(dm.id, gracie);
    await post(client, "Psst");

    const response = await download(gracie, dm.id);
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment; filename="ember-direct-messages-/);
    const [header, message] = await linesOf(response);
    expect(header!.room).toEqual({ id: dm.id, kind: "direct", name: null, members: [shown(administrator.user), shown(gracie.user)].sort((a, b) => (a.id < b.id ? -1 : 1)) });
    expect(message).toMatchObject({ text: "Psst", author: shown(gracie.user) });
  });

  it("is for the room's members only, answering someone outside it as it answers a room that isn't there, an administrator too", async () => {
    const administrator = await setUp();
    const gracie = await joinAsGrace();
    const secret = (await createRoom("Secret", { closedTo: [gracie.user.id], as: gracie })).id;
    expect(await workspaceSql("SELECT user_id FROM memberships WHERE room_id = ?", secret)).toEqual([{ user_id: gracie.user.id }]);
    const dm = await direct(gracie, await signIn("Linus"));

    const missing = await download(administrator, "no-such-room");
    expect(missing.status).toBe(404);
    const missingBody = await missing.text();
    for (const room of [secret, dm.id]) {
      const refused = await download(administrator, room);
      expect(refused.status).toBe(404);
      expect(await refused.text()).toBe(missingBody);
    }
    expect((await download(gracie, secret)).status).toBe(200);
  });

  it("refuses a guest, who is in the room, and someone without a session", async () => {
    const guest = await signIn("Visitor");
    const room = await freshRoom("Open");
    const refused = await download(guest, room);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: "Guests can't download a room's messages" });
    expect((await download(null, room)).status).toBe(401);
  });

  it("lets each person download six an hour, and no one else's count", async () => {
    const administrator = await setUp();
    const gracie = await joinAsGrace();
    const room = await freshRoom("Limited");
    for (let i = 0; i < 6; i++) expect((await textOf(await download(administrator, room))).length).toBeGreaterThan(0);
    const limited = await download(administrator, room);
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "Too many downloads. Try again in an hour." });
    expect((await download(gracie, room)).status).toBe(200);
  });

  it("doesn't count a refused request against the limit", async () => {
    const administrator = await setUp();
    const gracie = await joinAsGrace();
    const secret = (await createRoom("Secret", { closedTo: [gracie.user.id], as: gracie })).id;
    for (let i = 0; i < 8; i++) expect((await download(administrator, secret)).status).toBe(404);
    expect((await download(administrator, await freshRoom("Open"))).status).toBe(200);
  });
});
