import type { SidebarRoom } from "@ember/protocol";
import type { AgentRoom } from "@ember/protocol/agents";

// The rooms a chat bot is kept to, as the Chat bots page names them and the bot form picks them. They were
// the AI agents' pages' before Spark removed those (OSphera/spark#4).

/** How many rooms a row names before it says how many more there are. */
const ROOMS_NAMED = 3;

/** Rooms by name, as a row on the Chat bots page names them: the first three, then how many more there are. */
export function roomNames(rooms: Array<{ name: string }>): string {
  const names = rooms.map(({ name }) => name);
  return names.length > ROOMS_NAMED ? `${names.slice(0, ROOMS_NAMED).join(", ")} and ${names.length - ROOMS_NAMED} more` : names.join(", ");
}

/**
 * A radio button or a checkbox in a list of them, on a row 44px tall, whose box sits far enough into its
 * label, for fingers, for a fingertip on it to land on the label, as the bot form's Rooms has them.
 */
export const CHOICE = "flex min-h-11 cursor-pointer items-center gap-2.5 has-disabled:cursor-default touch:-ms-3.5 touch:ps-3.5";

/**
 * The open rooms a chat bot can be kept to, by name: those in the sidebar's `rooms`, once it has them, and
 * those it's kept to already, `kept`, which the administrator may not be in, such as one made while they
 * were banned.
 */
export function roomsToPick(rooms: readonly SidebarRoom[] | null, kept: readonly AgentRoom[]): AgentRoom[] {
  const open = rooms?.flatMap((room) => (room.kind === "open" ? [{ id: room.id, name: room.name }] : [])) ?? [];
  // The sidebar's last, as its names follow renames.
  const byId = new Map([...kept, ...open].map((room) => [room.id, room]));
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
