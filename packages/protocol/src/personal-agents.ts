import { isReservedName, MAX_USER_NAME_LENGTH, NAME_RESERVED, type DirectoryUser, type RoomId, type RoomKind } from "./index.ts";

// Personal agents: agents members make for themselves on their profile, through `/api/users/me/agents`.
// Each is a bot that someone answers for, shown wherever its name is as theirs ("Pete's agent"), which
// reaches Ember through the bot API with its key (docs/bot-api.md). They're unlike the AI agents
// administrators make beside @ember (agents.ts), which answer with a model and belong to nobody.

/** The most personal agents an administrator can let each person have. */
export const MAX_PERSONAL_AGENTS = 10;

/** What a personal agent is called beside its name, after the person whose it is: "Pete's agent". */
export const ownersAgent = (ownerName: string) => `${ownerName}'s agent`;

/** A room a personal agent is in, by name, which its person's profile lists. */
export interface PersonalAgentRoom {
  id: RoomId;
  name: string;
}

/** A personal agent as its person's profile and workspace settings list it. */
export interface PersonalAgent extends DirectoryUser {
  ownerId: DirectoryUser["id"];
  /** The rooms it's in but its DMs, by name. */
  rooms: PersonalAgentRoom[];
  /** When its key last opened the bot API, to within a few minutes, or null if it never has. */
  usedAt: string | null;
  /** Whether its person gave it a picture, which Remove picture takes away: otherwise it has the one chat bots start with. */
  avatar: boolean;
}

/** What `GET /api/users/me/agents` answers: how many agents you may have, and yours, by name. */
export interface YourAgents {
  /** How many you may have at once, which an administrator sets: 0 while nobody may make one. */
  limit: number;
  agents: PersonalAgent[];
}

/**
 * What making a personal agent and giving it a new key answer: the agent, and its key, `<id>-<token>`,
 * which Ember keeps only a digest of, so this is the only time anyone is shown it. Changing its name or
 * rooms answers the agent without one.
 */
export interface PersonalAgentAnswer {
  agent: PersonalAgent;
  key?: string;
}

/** What `GET /api/account/personal_agents` answers administrators: the limit, and everyone's active agents, by name. */
export interface EveryonesAgents {
  limit: number;
  agents: PersonalAgent[];
}

/** What `PATCH /api/account/personal_agents` sets: how many agents each person may have. */
export interface PersonalAgentLimit {
  limit: number;
}

/**
 * What `POST /api/users/me/agents` takes: the agent's name, and your current password, which making one
 * takes while you have one, as changing your email address does. Giving one a new key, `PUT
 * /api/users/me/agents/<id>/key`, takes just the password.
 */
export interface NewPersonalAgent {
  name: string;
  currentPassword?: string;
}

/** A room a bot is in, as `GET /bot/rooms` lists it: a DM has no name. */
export interface BotRoomListed {
  id: RoomId;
  name: string | null;
  kind: RoomKind;
}

/** Why someone can't make or manage personal agents: guests can't, nor anyone while the limit is 0. */
export const PERSONAL_AGENTS_OFF = "Personal agents are off. An administrator can turn them on in workspace settings.";
export const GUESTS_HAVE_NO_AGENTS = "Guests can't have agents of their own";
/** Why someone can't make another. */
export const personalAgentsFull = (limit: number) => `You can have at most ${limit} agent${limit === 1 ? "" : "s"}. Delete one first.`;
/** Why a personal agent can't go in a room: its person has to be in it, and it can't be a DM. */
export const AGENT_NOT_WITH_OWNER = "An agent can only be in rooms its person is in.";
/** Why a DM can't have someone's agent in it unless that person starts it. */
export const AGENT_DIRECT_REFUSED = "Only its person can message someone's agent directly.";
/** What administrators' personal agents pages tell anyone else. */
export const PERSONAL_AGENTS_FORBIDDEN = "Only administrators can see everyone's agents";
/** Why making an agent, or giving one a new key, is refused without your current password, while you have one. */
export const AGENT_PASSWORD_NEEDED = "Enter your current password to make an agent or give one a new key.";
/** Why a limit isn't taken. */
export const LIMIT_REFUSED = `The limit must be a whole number from 0 to ${MAX_PERSONAL_AGENTS}`;

/** Parses an untrusted name for a personal agent, as a bot's is: more than spaces, no longer than a person's, and not @ember's. */
export function parsePersonalAgentName(data: unknown): { name: string } | string {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return "Expected a JSON object";
  const { name } = data as Record<string, unknown>;
  if (typeof name !== "string") return "Name must be text";
  if (!name.trim()) return "Name can't be blank";
  if (name.length > MAX_USER_NAME_LENGTH) return `Name can't be longer than ${MAX_USER_NAME_LENGTH} characters`;
  return isReservedName(name) ? NAME_RESERVED : { name };
}

/** Parses an untrusted new personal agent: its name, as `parsePersonalAgentName` takes it, and the current password, if any. */
export function parseNewPersonalAgent(data: unknown): NewPersonalAgent | string {
  const named = parsePersonalAgentName(data);
  if (typeof named === "string") return named;
  const password = currentPasswordOf(data);
  return typeof password === "string" || password === undefined ? { ...named, ...(password && { currentPassword: password }) } : password.error;
}

/** The current password an untrusted body brings, undefined for none, or why it's refused. */
export function currentPasswordOf(data: unknown): string | undefined | { error: string } {
  const given = typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>).currentPassword : undefined;
  if (given === undefined || given === null) return undefined;
  return typeof given === "string" ? given : { error: "Current password must be text" };
}

/** Parses an untrusted limit: a whole number from 0 to `MAX_PERSONAL_AGENTS`. */
export function parsePersonalAgentLimit(data: unknown): PersonalAgentLimit | string {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return "Expected a JSON object";
  const { limit } = data as Record<string, unknown>;
  return typeof limit === "number" && Number.isInteger(limit) && limit >= 0 && limit <= MAX_PERSONAL_AGENTS ? { limit } : LIMIT_REFUSED;
}
