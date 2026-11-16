import type { CloseCode, RoomId, User, UserId } from "@ember/protocol";
import type { BotRoomListed, PersonalAgentRoom } from "@ember/protocol/personal-agents";
import { statement, type Db } from "../db";
import type { StoredPicture } from "../files/pictures";
import { ACTIVE, BOT, DEACTIVATED, DIRECTORY_COLUMNS, directoryEntry, LEAVE_SHARED_ROOMS, type DirectoryEntry, type DirectoryRow } from "../workspace-store";

// Personal agents as the Workspace keeps them (migrations/0064_personal_agents.sql): bot users whose
// owner_id names the person whose they are, each with the digest of its key's token. What turns them off
// with their person, and keeps them to the rooms their person is in, is in the batches that remove, ban
// or move that person (workspace-store.ts), so that it's one transaction with them.

/** A personal agent as its person's profile lists it, with the rooms it's in but its DMs, and when its key was last used. */
export interface StoredPersonalAgent extends DirectoryEntry {
  ownerId: UserId;
  rooms: PersonalAgentRoom[];
  usedAt: string | null;
  /** Whether its person gave it a picture. */
  avatar: boolean;
}

/** A personal agent found by its id, as changing it finds it, whoever's it is. */
export interface FoundPersonalAgent {
  id: UserId;
  name: string;
  ownerId: UserId;
}

/** A personal agent among people a room's members or a DM's are picked from, with whether it's in the room. */
export interface PickedAgent {
  id: UserId;
  ownerId: UserId;
  active: boolean;
  member: boolean;
}

interface AgentRow extends DirectoryRow {
  owner_id: UserId;
  bot_key_used_at: string | null;
  avatar_key: string | null;
}

const AGENT_COLUMNS = `${DIRECTORY_COLUMNS}, users.bot_key_used_at, users.avatar_key`;

/** The active personal agents of ?1, by name. */
const OWNERS_AGENTS = `SELECT ${AGENT_COLUMNS} FROM users WHERE owner_id = ?1 AND status = ${ACTIVE} ORDER BY lower(name), id`;

/** Every active personal agent, by name, as administrators see them. */
const EVERYONES_AGENTS = `SELECT ${AGENT_COLUMNS} FROM users WHERE owner_id IS NOT NULL AND status = ${ACTIVE} ORDER BY lower(name), id`;

/** The rooms but DMs the active personal agents of ?1 are in, by name. */
const OWNERS_AGENTS_ROOMS = `SELECT memberships.user_id, rooms.id, rooms.name
  FROM users JOIN memberships ON memberships.user_id = users.id JOIN rooms ON rooms.id = memberships.room_id
  WHERE users.owner_id = ?1 AND users.status = ${ACTIVE} AND rooms.kind <> 'direct' ORDER BY lower(rooms.name), rooms.id`;

/** The same, of every active personal agent. */
const EVERYONES_AGENTS_ROOMS = `SELECT memberships.user_id, rooms.id, rooms.name
  FROM users JOIN memberships ON memberships.user_id = users.id JOIN rooms ON rooms.id = memberships.room_id
  WHERE users.owner_id IS NOT NULL AND users.status = ${ACTIVE} AND rooms.kind <> 'direct' ORDER BY lower(rooms.name), rooms.id`;

/** The active personal agent ?1, whoever's it is. */
const ACTIVE_AGENT = `SELECT id, name, owner_id FROM users WHERE id = ?1 AND owner_id IS NOT NULL AND status = ${ACTIVE}`;

/**
 * Adds personal agent ?1, called ?2, of ?3, with the digest ?4 of its key's token, at ?5: a bot, never more,
 * whatever anyone asks. Only while ?3 is an active person, neither a guest nor a bot, with fewer active
 * agents than the account lets each person have, so that two requests at once can't make one too many:
 * each is one statement, which both backends run one at a time. Answers its id once it's added.
 */
const INSERT_AGENT = `INSERT INTO users (id, name, role, owner_id, bot_key_digest, created_at, updated_at)
  SELECT ?1, ?2, ${BOT}, owners.id, ?4, ?5, ?5 FROM users AS owners
  WHERE owners.id = ?3 AND owners.status = ${ACTIVE} AND owners.guest = 0 AND owners.role <> ${BOT}
    AND (SELECT count(*) FROM users AS theirs WHERE theirs.owner_id = ?3 AND theirs.status = ${ACTIVE})
      < coalesce((SELECT personal_agents FROM accounts LIMIT 1), 0)
  RETURNING id`;

/** Renames ?3, an active agent of ?4's, at ?2, unless that's its name already. */
const RENAME_AGENT = `UPDATE users SET name = ?1, updated_at = ?2 WHERE id = ?3 AND owner_id = ?4 AND status = ${ACTIVE} AND name <> ?1`;

/** Gives ?2, an active agent of ?3's, the digest ?1 of a new key's token, forgetting the old one's. Answers it, if it did. */
const REKEY_AGENT = `UPDATE users SET bot_key_digest = ?1 WHERE id = ?2 AND owner_id = ?3 AND status = ${ACTIVE} RETURNING id`;

/** The picture of the active personal agent ?1 of ?2's, and when it last changed. */
const AGENT_PICTURE = `SELECT updated_at, avatar_key FROM users WHERE id = ?1 AND owner_id = ?2 AND status = ${ACTIVE}`;

/**
 * Gives ?3, an active agent of ?4's, the picture ?1 with the variant ?2 (or none, for nulls), at ?5. Only its
 * person, in the statement that writes, as for renaming it. Answers it, if it did.
 */
const CHANGE_AGENT_PICTURE = `UPDATE users SET avatar_key = ?1, avatar_variant = ?2, updated_at = ?5
  WHERE id = ?3 AND owner_id = ?4 AND status = ${ACTIVE} RETURNING id`;

/** Takes the reservation of picture ?1, now that an agent has it, so R2 keeps it. Without that, the change didn't happen, and R2 deletes it. */
const KEEP_AGENT_PICTURE = `DELETE FROM pending_picture_deletions WHERE object_key = ?1 AND EXISTS (SELECT 1 FROM users WHERE avatar_key = ?1)`;

/** Queues R2 deleting picture ?1 at ?2, unless somebody has it still, which it checks after the change. */
const QUEUE_UNUSED_PICTURE = `INSERT INTO pending_picture_deletions (object_key, due_at)
  SELECT ?1, ?2 WHERE NOT EXISTS (SELECT 1 FROM users WHERE avatar_key = ?1)`;

/** Queues revoking, with ?1 due at ?2, every room agent ?3 is in, DMs too, so what its key began there is turned away. */
const QUEUE_AGENT_REVOCATIONS = `INSERT INTO pending_revocations (room_id, tag, code, due_at)
  SELECT room_id, user_id, ?1, ?2 FROM memberships WHERE user_id = ?3 RETURNING id`;

/** Turns off the active personal agent ?2 at ?1: deactivated, with no digest any key matches. Answers it, if it did. */
const TURN_OFF_AGENT = `UPDATE users SET status = ${DEACTIVATED}, bot_key_digest = NULL, updated_at = ?1
  WHERE id = ?2 AND owner_id IS NOT NULL AND status = ${ACTIVE} RETURNING id`;

/**
 * Puts the active personal agent ?2 in room ?1, at ?3, but a DM, and only while its person is in it.
 * Answers it, if it put it in.
 */
const PLACE_AGENT = `INSERT INTO memberships (room_id, user_id, created_at, updated_at)
  SELECT rooms.id, agents.id, ?3, ?3 FROM rooms, users AS agents
  WHERE rooms.id = ?1 AND rooms.kind <> 'direct' AND agents.id = ?2 AND agents.owner_id IS NOT NULL AND agents.status = ${ACTIVE}
    AND EXISTS (SELECT 1 FROM memberships AS theirs WHERE theirs.room_id = ?1 AND theirs.user_id = agents.owner_id)
  ON CONFLICT DO NOTHING RETURNING user_id`;

/** Whether agent ?2 is in room ?1. */
const AGENT_IN_ROOM = `SELECT 1 FROM memberships WHERE room_id = ?1 AND user_id = ?2`;

/** Queues revoking, with ?3 due at ?4, room ?1 for agent ?2, if it's in it and it isn't a DM. */
const QUEUE_AGENT_ROOM_REVOCATION = `INSERT INTO pending_revocations (room_id, tag, code, due_at)
  SELECT room_id, user_id, ?3, ?4 FROM memberships WHERE room_id = ?1 AND user_id = ?2
    AND EXISTS (SELECT 1 FROM rooms WHERE rooms.id = ?1 AND rooms.kind <> 'direct')`;

/** Takes agent ?2 out of room ?1, but a DM, answering it if it did. */
const REMOVE_AGENT = `DELETE FROM memberships WHERE room_id = ?1 AND user_id = ?2
  AND EXISTS (SELECT 1 FROM rooms WHERE rooms.id = ?1 AND rooms.kind <> 'direct') RETURNING user_id`;

/** The personal agents among the people a JSON list ?2 names, whatever their status, with whether each is in room ?1. */
const PICKED_AGENTS = `SELECT users.id, users.owner_id, users.status = ${ACTIVE} AS active,
    EXISTS (SELECT 1 FROM memberships WHERE memberships.room_id = ?1 AND memberships.user_id = users.id) AS member
  FROM users WHERE users.id IN (SELECT value FROM json_each(?2)) AND users.owner_id IS NOT NULL`;

/** Whose agents the personal agents among a JSON list of ids are, by their names now. */
const OWNERS_OF = `SELECT agents.id, owners.id AS owner_id, owners.name AS owner_name
  FROM users AS agents JOIN users AS owners ON owners.id = agents.owner_id WHERE agents.id IN (SELECT value FROM json_each(?))`;

/** Records that agent ?1's key was used at ?2, unless it was since ?3, so it's written at most once in a while. */
const TOUCH_KEY = `UPDATE users SET bot_key_used_at = ?2 WHERE id = ?1 AND (bot_key_used_at IS NULL OR bot_key_used_at < ?3)`;

/** The rooms bot ?1 is in, DMs too, by name, DMs, which have none, last. */
const BOT_ROOMS = `SELECT rooms.id, rooms.kind, CASE WHEN rooms.kind = 'direct' THEN NULL ELSE rooms.name END AS name
  FROM memberships JOIN rooms ON rooms.id = memberships.room_id WHERE memberships.user_id = ?
  ORDER BY rooms.kind = 'direct', lower(rooms.name), rooms.id`;

export class PersonalAgentStore {
  constructor(private readonly db: Db) {}

  /** How many personal agents each person may have at once. */
  async limit(): Promise<number> {
    const [row] = await this.db.all<{ personal_agents: number }>(`SELECT personal_agents FROM accounts LIMIT 1`);
    return row?.personal_agents ?? 0;
  }

  /** Sets how many personal agents each person may have. Those who have more keep them. */
  async setLimit(limit: number, now: string): Promise<void> {
    await this.db.run(`UPDATE accounts SET personal_agents = ?, updated_at = ?`, limit, now);
  }

  /** The active personal agents of `ownerId`, or everyone's with null, by name, each with its rooms. */
  async agents(ownerId: UserId | null): Promise<StoredPersonalAgent[]> {
    const [agents, rooms] = (await this.db.batch(
      ownerId === null
        ? [statement(EVERYONES_AGENTS), statement(EVERYONES_AGENTS_ROOMS)]
        : [statement(OWNERS_AGENTS, ownerId), statement(OWNERS_AGENTS_ROOMS, ownerId)],
    )) as [AgentRow[], Array<PersonalAgentRoom & { user_id: UserId }>];
    return agents.map((row) => ({
      ...directoryEntry(row),
      ownerId: row.owner_id,
      usedAt: row.bot_key_used_at,
      avatar: row.avatar_key !== null,
      rooms: rooms.filter((room) => room.user_id === row.id).map(({ id, name }) => ({ id, name })),
    }));
  }

  /** Whether `userId` is a personal agent's, whatever its status. */
  async isPersonalAgent(userId: UserId): Promise<boolean> {
    return (await this.db.all(`SELECT 1 FROM users WHERE id = ? AND owner_id IS NOT NULL`, userId)).length > 0;
  }

  /** The names of the active personal agents but `except`. */
  async names(except: UserId | null): Promise<string[]> {
    const rows = await this.db.all<{ name: string }>(`SELECT name FROM users WHERE owner_id IS NOT NULL AND status = ${ACTIVE} AND id IS NOT ?`, except);
    return rows.map((row) => row.name);
  }

  /** The active personal agent `agentId`, whoever's it is, or null. */
  async activeAgent(agentId: UserId): Promise<FoundPersonalAgent | null> {
    const [row] = await this.db.all<{ id: UserId; name: string; owner_id: UserId }>(ACTIVE_AGENT, agentId);
    return row ? { id: row.id, name: row.name, ownerId: row.owner_id } : null;
  }

  /** Adds `ownerId`'s agent `id`, as `INSERT_AGENT` lets it, answering whether it did. */
  async createAgent(id: UserId, name: string, ownerId: UserId, keyDigest: string, now: string): Promise<boolean> {
    return (await this.db.all(INSERT_AGENT, id, name, ownerId, keyDigest, now)).length > 0;
  }

  /** Renames `ownerId`'s active agent `agentId`. */
  async renameAgent(agentId: UserId, ownerId: UserId, name: string, now: string): Promise<void> {
    await this.db.run(RENAME_AGENT, name, now, agentId, ownerId);
  }

  /** The picture of `ownerId`'s active agent `agentId`, with when it last changed, or null unless it's theirs and on. */
  async picture(agentId: UserId, ownerId: UserId): Promise<{ updatedAt: string; key: string | null } | null> {
    const [row] = await this.db.all<{ updated_at: string; avatar_key: string | null }>(AGENT_PICTURE, agentId, ownerId);
    return row ? { updatedAt: row.updated_at, key: row.avatar_key } : null;
  }

  /**
   * Gives `ownerId`'s active agent `agentId` `picture`, which R2 has stored under a key that was reserved
   * for it, or takes its picture away with null, and queues R2 deleting the one it had, `previous`, at
   * `dueAt`, once nothing has it. Answers whether it did.
   */
  async changePicture(agentId: UserId, ownerId: UserId, picture: StoredPicture | null, previous: string | null, now: string, dueAt: number): Promise<boolean> {
    const [changed] = await this.db.batch([
      statement(CHANGE_AGENT_PICTURE, picture?.key ?? null, picture?.variant ?? null, agentId, ownerId, now),
      ...(picture ? [statement(KEEP_AGENT_PICTURE, picture.key)] : []),
      ...(previous ? [statement(QUEUE_UNUSED_PICTURE, previous, dueAt)] : []),
    ]);
    return changed!.length > 0;
  }

  /**
   * Gives `ownerId`'s active agent `agentId` a new key's digest, and in the same transaction queues revoking
   * every room it's in with `code` due at `dueAt`, so the old key stops at once. Answers whether it did.
   */
  async rekeyAgent(agentId: UserId, ownerId: UserId, keyDigest: string, code: CloseCode, dueAt: number): Promise<boolean> {
    const [, changed] = await this.db.batch([statement(QUEUE_AGENT_REVOCATIONS, code, dueAt, agentId), statement(REKEY_AGENT, keyDigest, agentId, ownerId)]);
    return changed!.length > 0;
  }

  /**
   * Turns off the active personal agent `agentId` in one transaction: queues revoking every room it's in
   * with `code` due at `dueAt`, takes it out of every room but its DMs, and deactivates it, forgetting its
   * key's digest. Its messages stay. Answers whether it did.
   */
  async turnOff(agentId: UserId, code: CloseCode, dueAt: number, now: string): Promise<boolean> {
    const [, , off] = await this.db.batch([
      statement(QUEUE_AGENT_REVOCATIONS, code, dueAt, agentId),
      statement(LEAVE_SHARED_ROOMS, agentId),
      statement(TURN_OFF_AGENT, now, agentId),
    ]);
    return off!.length > 0;
  }

  /** Puts agent `agentId` in room `roomId`, as `PLACE_AGENT` lets it: "placed", "already" when it's in, or "refused". */
  async place(roomId: RoomId, agentId: UserId, now: string): Promise<"placed" | "already" | "refused"> {
    const [placed, already] = await this.db.batch([statement(PLACE_AGENT, roomId, agentId, now), statement(AGENT_IN_ROOM, roomId, agentId)]);
    if (placed!.length > 0) return "placed";
    return already!.length > 0 ? "already" : "refused";
  }

  /** Takes agent `agentId` out of room `roomId`, but a DM, queueing revoking it there with `code` due at `dueAt`. Answers whether it did. */
  async remove(roomId: RoomId, agentId: UserId, code: CloseCode, dueAt: number): Promise<boolean> {
    const [, removed] = await this.db.batch([statement(QUEUE_AGENT_ROOM_REVOCATION, roomId, agentId, code, dueAt), statement(REMOVE_AGENT, roomId, agentId)]);
    return removed!.length > 0;
  }

  /** The personal agents among `userIds`, with whether each is active and in room `roomId`, if any. */
  async picked(userIds: UserId[], roomId: RoomId | null): Promise<PickedAgent[]> {
    const rows = await this.db.all<{ id: UserId; owner_id: UserId; active: number; member: number }>(PICKED_AGENTS, roomId ?? "", JSON.stringify(userIds));
    return rows.map((row) => ({ id: row.id, ownerId: row.owner_id, active: row.active === 1, member: row.member === 1 }));
  }

  /** Whose agents the personal agents among `ids` are, by agent, each owner by their name now. */
  async ownersOf(ids: UserId[]): Promise<Map<UserId, User>> {
    const rows = await this.db.all<{ id: UserId; owner_id: UserId; owner_name: string }>(OWNERS_OF, JSON.stringify(ids));
    return new Map(rows.map((row) => [row.id, { id: row.owner_id, name: row.owner_name }]));
  }

  /** Records that agent `agentId`'s key was used at `now`, unless it was since `since`. */
  async touchKey(agentId: UserId, now: string, since: string): Promise<void> {
    await this.db.run(TOUCH_KEY, agentId, now, since);
  }

  /** The rooms bot `botId` is in, DMs too. */
  async botRooms(botId: UserId): Promise<BotRoomListed[]> {
    return this.db.all<BotRoomListed>(BOT_ROOMS, botId);
  }
}
