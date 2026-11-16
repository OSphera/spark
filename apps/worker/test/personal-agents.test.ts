import type { Directory, Me, NewWorkspace, RoomId, RoomSettings, UserId } from "@ember/protocol";
import { NAME_TAKEN, agentsName } from "@ember/protocol/agents";
import {
  AGENT_DIRECT_REFUSED,
  AGENT_NOT_WITH_OWNER,
  AGENT_PASSWORD_NEEDED,
  GUESTS_HAVE_NO_AGENTS,
  LIMIT_REFUSED,
  PERSONAL_AGENTS_FORBIDDEN,
  PERSONAL_AGENTS_OFF,
  personalAgentsFull,
  type BotRoomListed,
  type EveryonesAgents,
  type PersonalAgentAnswer,
  type YourAgents,
} from "@ember/protocol/personal-agents";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, cookieOf, createRoom, freshDeploy, shown, signIn, startDirect, workspaceSql, type Session } from "./support";

const ada = { name: "Ada Lovelace", emailAddress: "ada@example.com", password: "analytical engine" };
const grace = { name: "Grace Hopper", emailAddress: "grace@example.com", password: "compiler design" };
const alan = { name: "Alan Turing", emailAddress: "alan@example.com", password: "universal machine" };

/** Sets Ember up with Ada as its administrator, signed in. */
async function setUp(): Promise<Session> {
  const response = await api("/api/first_run", { method: "POST", body: JSON.stringify(ada) });
  expect(response.status).toBe(201);
  return { user: shown(((await response.json()) as NewWorkspace).user), cookie: cookieOf(response) };
}

/** Someone joins with the join link, as a member, signed in. */
async function join(person: typeof grace): Promise<Session> {
  const [{ join_code: joinCode }] = (await workspaceSql("SELECT join_code FROM accounts")) as [{ join_code: string }];
  const response = await api(`/api/join/${joinCode}`, { method: "POST", body: JSON.stringify(person) });
  expect(response.status, await response.clone().text()).toBe(201);
  return { user: shown(((await response.json()) as { user: Me }).user), cookie: cookieOf(response) };
}

const as = (session: Session, init: RequestInit = {}): RequestInit => ({ ...init, headers: { Cookie: session.cookie, ...init.headers } });
const json = (body: unknown) => JSON.stringify(body);

const setLimit = (session: Session, limit: unknown) => api("/api/account/personal_agents", as(session, { method: "PATCH", body: json({ limit }) }));
const makeAgent = (session: Session, body: unknown) => api("/api/users/me/agents", as(session, { method: "POST", body: json(body) }));
const yourAgents = (session: Session) => api("/api/users/me/agents", as(session));
const renameAgent = (session: Session, id: UserId, name: string) => api(`/api/users/me/agents/${id}`, as(session, { method: "PATCH", body: json({ name }) }));
const rekeyAgent = (session: Session, id: UserId, currentPassword?: string) =>
  api(`/api/users/me/agents/${id}/key`, as(session, { method: "PUT", body: json({ currentPassword }) }));
const deleteAgent = (session: Session, id: UserId) => api(`/api/users/me/agents/${id}`, as(session, { method: "DELETE" }));
const placeAgent = (session: Session, id: UserId, room: RoomId, method = "PUT") => api(`/api/personal_agents/${id}/rooms/${room}`, as(session, { method }));
const turnOff = (session: Session, id: UserId) => api(`/api/account/personal_agents/${id}`, as(session, { method: "DELETE" }));

/** Makes an agent called `name` for `owner`, whose password is `password`, answering it and its key. */
async function made(owner: Session, name: string, password: string): Promise<Required<PersonalAgentAnswer>> {
  const response = await makeAgent(owner, { name, currentPassword: password });
  expect(response.status, await response.clone().text()).toBe(201);
  return (await response.json()) as Required<PersonalAgentAnswer>;
}

/** Posts `text` to `room` as the bot whose key is `key`: in an `Authorization` header, or with `inPath`, in the address. */
const postAs = (key: string, room: RoomId, text: string, inPath = false) =>
  inPath
    ? api(`/rooms/${room}/${key}/messages`, { method: "POST", body: text })
    : api(`/bot/rooms/${room}/messages`, { method: "POST", body: text, headers: { Authorization: `Bearer ${key}` } });

const readAs = (key: string, room: RoomId) => api(`/bot/rooms/${room}/messages`, { headers: { Authorization: `Bearer ${key}` } });

const stored = async (id: UserId) =>
  (
    (await workspaceSql("SELECT role, status, owner_id, bot_token, bot_key_digest, bot_key_used_at FROM users WHERE id = ?", id)) as Array<{
      role: number;
      status: number;
      owner_id: string | null;
      bot_token: string | null;
      bot_key_digest: string | null;
      bot_key_used_at: string | null;
    }>
  )[0]!;

async function errorOf(response: Response, status: number): Promise<string> {
  expect(response.status, await response.clone().text()).toBe(status);
  return ((await response.json()) as { error: string }).error;
}

const generalRoom = async () => ((await workspaceSql("SELECT id FROM rooms WHERE name = 'general'")) as [{ id: RoomId }])[0].id;
const isMember = async (room: RoomId, userId: UserId) =>
  (await workspaceSql("SELECT 1 FROM memberships WHERE room_id = ? AND user_id = ?", room, userId)).length > 0;

beforeEach(freshDeploy);

describe("the limit", () => {
  it("starts at 0, which lets nobody make an agent", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    expect(await yourAgents(member).then((response) => response.json())).toEqual({ limit: 0, agents: [] } satisfies YourAgents);
    expect(await errorOf(await makeAgent(member, { name: "Scout", currentPassword: grace.password }), 403)).toBe(PERSONAL_AGENTS_OFF);
    expect(await errorOf(await makeAgent(administrator, { name: "Scout", currentPassword: ada.password }), 403)).toBe(PERSONAL_AGENTS_OFF);
    // The profile says nothing of them meanwhile, and once they're on, lists yours.
    const profile = async () => ((await (await api("/api/users/me/profile", as(member))).json()) as { profile: { agents?: YourAgents } }).profile;
    expect(await profile()).not.toHaveProperty("agents");
    await setLimit(administrator, 1);
    const { agent } = await made(member, "Scout", grace.password);
    expect((await profile()).agents).toMatchObject({ limit: 1, agents: [{ id: agent.id, name: "Scout" }] });
  });

  it("is an administrator's to set, from 0 to 10", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    expect(await errorOf(await setLimit(member, 3), 403)).toBe(PERSONAL_AGENTS_FORBIDDEN);
    expect(await errorOf(await setLimit(administrator, 11), 422)).toBe(LIMIT_REFUSED);
    expect(await errorOf(await setLimit(administrator, 1.5), 422)).toBe(LIMIT_REFUSED);
    expect((await setLimit(administrator, 2)).status).toBe(200);
    expect(((await (await yourAgents(member)).json()) as YourAgents).limit).toBe(2);
  });

  it("stops a person at it, even when two requests race", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    await setLimit(administrator, 1);
    const answers = await Promise.all([
      makeAgent(member, { name: "Scout", currentPassword: grace.password }),
      makeAgent(member, { name: "Herald", currentPassword: grace.password }),
      makeAgent(member, { name: "Courier", currentPassword: grace.password }),
    ]);
    expect(answers.map((response) => response.status).sort()).toEqual([201, 409, 409]);
    expect(await errorOf(answers.find((response) => response.status === 409)!, 409)).toBe(personalAgentsFull(1));
    expect(await workspaceSql("SELECT count(*) AS n FROM users WHERE owner_id = ? AND status = 0", member.user.id)).toEqual([{ n: 1 }]);
  });

  it("counts only agents that are on, so deleting one makes room", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    await setLimit(administrator, 1);
    const { agent } = await made(member, "Scout", grace.password);
    expect((await makeAgent(member, { name: "Herald", currentPassword: grace.password })).status).toBe(409);
    expect((await deleteAgent(member, agent.id)).status).toBe(204);
    await made(member, "Herald", grace.password);
  });
});

describe("making one", () => {
  it("takes the person's password, which holding their session isn't", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    await setLimit(administrator, 2);
    expect(await errorOf(await makeAgent(member, { name: "Scout" }), 422)).toBe(AGENT_PASSWORD_NEEDED);
    expect((await makeAgent(member, { name: "Scout", currentPassword: "not it" })).status).toBe(422);
    await made(member, "Scout", grace.password);
  });

  it("isn't for guests", async () => {
    const administrator = await setUp();
    await setLimit(administrator, 2);
    const guest = await signIn("Visitor");
    expect(await errorOf(await makeAgent(guest, { name: "Scout" }), 403)).toBe(GUESTS_HAVE_NO_AGENTS);
    expect(await errorOf(await yourAgents(guest), 403)).toBe(GUESTS_HAVE_NO_AGENTS);
  });

  it("makes a bot of theirs, never an administrator, whatever it's asked", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    await setLimit(administrator, 2);
    const { agent } = await made(member, "Scout", grace.password);
    expect(agent).toMatchObject({ name: "Scout", role: "bot", status: "active", agent: true, ownerId: member.user.id, rooms: [], usedAt: null });
    const sneaky = await makeAgent(member, { name: "Boss", role: "administrator", ownerId: administrator.user.id, currentPassword: grace.password });
    const { agent: boss } = (await sneaky.json()) as PersonalAgentAnswer;
    expect(await stored(boss.id)).toMatchObject({ role: 2, owner_id: member.user.id });
    // Nor can an administrator make it one afterwards.
    const promoted = await api(`/api/account/users/${agent.id}`, as(administrator, { method: "PATCH", body: json({ role: "administrator" }) }));
    expect(promoted.status).toBe(403);
    expect((await stored(agent.id)).role).toBe(2);
  });

  it("shows the key once and keeps only a digest of it", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    await setLimit(administrator, 2);
    const { agent, key } = await made(member, "Scout", grace.password);
    const [id, token] = key.split("-") as [string, string];
    expect(id).toBe(agent.id);
    expect(token).toMatch(/^[A-Za-z0-9]{40}$/);
    const row = await stored(agent.id);
    expect(row.bot_token).toBeNull();
    expect(row.bot_key_digest).not.toBeNull();
    expect(row.bot_key_digest).not.toContain(token);
    // What the row holds opens nothing.
    expect((await readAs(`${agent.id}-${row.bot_key_digest}`, await generalRoom())).status).toBe(401);
    // Nothing shows it again.
    expect(JSON.stringify(await (await yourAgents(member)).json())).not.toContain(token);
    expect(JSON.stringify(await (await api("/api/account/personal_agents", as(administrator))).json())).not.toContain(token);
  });

  it("takes a name nobody has, and nobody can take its name after", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    const other = await join(alan);
    await setLimit(administrator, 2);
    expect(await errorOf(await makeAgent(member, { name: "ada lovelace", currentPassword: grace.password }), 422)).toBe(NAME_TAKEN);
    await made(member, "Scout", grace.password);
    expect(await errorOf(await makeAgent(other, { name: "SCOUT", currentPassword: alan.password }), 422)).toBe(NAME_TAKEN);
    const renamed = await api("/api/users/me/profile", as(other, { method: "PATCH", body: json({ name: "Scout" }) }));
    expect(await errorOf(renamed, 422)).toBe(agentsName("Scout"));
  });
});

describe("whose it is", () => {
  it("lets nobody but its person rename it, give it a key, or delete it", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    const other = await join(alan);
    await setLimit(administrator, 2);
    const { agent } = await made(member, "Scout", grace.password);
    for (const session of [other, administrator]) {
      expect((await renameAgent(session, agent.id, "Mine")).status).toBe(404);
      expect((await rekeyAgent(session, agent.id, session === other ? alan.password : ada.password)).status).toBe(404);
      expect((await deleteAgent(session, agent.id)).status).toBe(404);
    }
    expect((await stored(agent.id)).status).toBe(0);
    // Nor do administrators' bot pages reach it.
    expect((await api(`/api/account/bots/${agent.id}/key`, as(administrator, { method: "PUT" }))).status).toBe(404);
    expect((await api(`/api/account/bots/${agent.id}`, as(administrator, { method: "DELETE" }))).status).toBe(404);
    expect((await api(`/api/account/users/${agent.id}`, as(administrator, { method: "DELETE" }))).status).toBe(404);
    expect((await api(`/api/users/${agent.id}/ban`, as(administrator, { method: "POST" }))).status).toBe(404);
    const renamed = await renameAgent(member, agent.id, "Herald");
    expect(((await renamed.json()) as PersonalAgentAnswer).agent.name).toBe("Herald");
  });

  it("is in the directory with the Agent badge and its person", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    await setLimit(administrator, 2);
    const { agent } = await made(member, "Scout", grace.password);
    const { users } = (await (await api("/api/users", as(administrator))).json()) as Directory;
    expect(users.find((user) => user.id === agent.id)).toMatchObject({ role: "bot", agent: true, ownerId: member.user.id });
    expect(users.find((user) => user.id === member.user.id)).not.toHaveProperty("ownerId");
    // Administrators' chat bots don't list it; their personal agents page does.
    const bots = (await (await api("/api/account/bots", as(administrator))).json()) as { bots: unknown[] };
    expect(bots.bots).toEqual([]);
    const everyone = (await (await api("/api/account/personal_agents", as(administrator))).json()) as EveryonesAgents;
    expect(everyone.agents.map(({ id, ownerId }) => ({ id, ownerId }))).toEqual([{ id: agent.id, ownerId: member.user.id }]);
    expect((await api("/api/account/personal_agents", as(member))).status).toBe(403);
  });

  it("says so in the bot API's messages and the room's download", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    await setLimit(administrator, 2);
    const { agent, key } = await made(member, "Scout", grace.password);
    const general = await generalRoom();
    expect((await placeAgent(member, agent.id, general)).status).toBe(200);
    expect((await postAs(key, general, "Reporting in")).status).toBe(201);
    const messages = (await (await readAs(key, general)).json()) as Array<{ creator: Record<string, unknown> }>;
    expect(messages.at(-1)!.creator).toMatchObject({ id: agent.id, name: "Scout", role: "bot", owner: { id: member.user.id, name: grace.name } });
    const exported = await (await api(`/api/rooms/${general}/export`, as(member))).text();
    const line = exported
      .trim()
      .split("\n")
      .map((text) => JSON.parse(text) as { type: string; author?: unknown })
      .find((line) => line.type === "message");
    expect(line!.author).toEqual({ id: agent.id, name: "Scout", owner: { id: member.user.id, name: grace.name } });
  });
});

describe("its key", () => {
  it("works in the Authorization header and in the address", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    await setLimit(administrator, 2);
    const { agent, key } = await made(member, "Scout", grace.password);
    const general = await generalRoom();
    // In no room until its person puts it in one.
    expect((await postAs(key, general, "Too soon")).status).toBe(404);
    await placeAgent(member, agent.id, general);
    expect((await postAs(key, general, "In the header")).status).toBe(201);
    expect((await postAs(key, general, "In the address", true)).status).toBe(201);
    expect((await postAs(`${agent.id}-${"x".repeat(40)}`, general, "Guessing")).status).toBe(401);
  });

  it("stops at once when it's given a new one, which takes the password", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    await setLimit(administrator, 2);
    const { agent, key } = await made(member, "Scout", grace.password);
    const general = await generalRoom();
    await placeAgent(member, agent.id, general);
    expect(await errorOf(await rekeyAgent(member, agent.id), 422)).toBe(AGENT_PASSWORD_NEEDED);
    const rekeyed = await rekeyAgent(member, agent.id, grace.password);
    expect(rekeyed.status).toBe(200);
    const { key: newKey } = (await rekeyed.json()) as Required<PersonalAgentAnswer>;
    expect(newKey).not.toBe(key);
    expect((await postAs(key, general, "Old key")).status).toBe(401);
    expect((await postAs(key, general, "Old key", true)).status).toBe(401);
    expect((await postAs(newKey, general, "New key")).status).toBe(201);
  });

  it("records when it was last used, at most once in a while", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    await setLimit(administrator, 2);
    const { agent, key } = await made(member, "Scout", grace.password);
    const general = await generalRoom();
    await placeAgent(member, agent.id, general);
    await readAs(key, general);
    const first = (await stored(agent.id)).bot_key_used_at;
    expect(first).not.toBeNull();
    await readAs(key, general);
    expect((await stored(agent.id)).bot_key_used_at).toBe(first);
    expect(((await (await yourAgents(member)).json()) as YourAgents).agents[0]!.usedAt).toBe(first);
  });
});

describe("its rooms", () => {
  it("goes only where its person is, by its person's or an administrator's hand", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    const other = await join(alan);
    await setLimit(administrator, 2);
    const { agent } = await made(member, "Scout", grace.password);
    const theirs = await createRoom("Grace and Ada", { closedTo: [member.user.id, administrator.user.id], as: administrator });
    const notTheirs = await createRoom("Ada and Alan", { closedTo: [administrator.user.id, other.user.id], as: administrator });
    const general = await generalRoom();
    // Someone else can't, even in a room both are in.
    expect((await placeAgent(other, agent.id, general)).status).toBe(404);
    // Its person can't put it where they aren't.
    expect((await placeAgent(member, agent.id, notTheirs.id)).status).toBe(404);
    // Nor can an administrator, who is there.
    expect(await errorOf(await placeAgent(administrator, agent.id, notTheirs.id), 422)).toBe(AGENT_NOT_WITH_OWNER);
    expect(await isMember(notTheirs.id, agent.id)).toBe(false);
    expect((await placeAgent(administrator, agent.id, theirs.id)).status).toBe(200);
    const placed = await placeAgent(member, agent.id, general);
    expect(((await placed.json()) as PersonalAgentAnswer).agent.rooms.map((room) => room.name).sort()).toEqual(["Grace and Ada", "general"]);
    expect((await placeAgent(member, agent.id, general, "DELETE")).status).toBe(200);
    expect(await isMember(general, agent.id)).toBe(false);
  });

  it("isn't put in open rooms by itself", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    await setLimit(administrator, 2);
    const { agent } = await made(member, "Scout", grace.password);
    expect(await isMember(await generalRoom(), agent.id)).toBe(false);
    const open = await createRoom("New and open", { as: administrator });
    expect(await isMember(open.id, agent.id)).toBe(false);
    const closed = await createRoom("Later open", { closedTo: [administrator.user.id], as: administrator });
    await api(`/api/rooms/${closed.id}`, as(administrator, { method: "PATCH", body: json({ kind: "open" }) }));
    expect(await isMember(closed.id, member.user.id)).toBe(true);
    expect(await isMember(closed.id, agent.id)).toBe(false);
  });

  it("can't be put in a room by someone else listing it as a member", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    const other = await join(alan);
    await setLimit(administrator, 2);
    const { agent } = await made(member, "Scout", grace.password);
    const room = await createRoom("Alan's", { closedTo: [other.user.id, member.user.id, agent.id], as: other });
    expect(await isMember(room.id, member.user.id)).toBe(true);
    expect(await isMember(room.id, agent.id)).toBe(false);
    // Nor offered there.
    const settings = (await (await api(`/api/rooms/${room.id}/settings`, as(other))).json()) as RoomSettings;
    expect(settings.people.map((person) => person.id)).not.toContain(agent.id);
    // Its person can list it, though, with themselves.
    const own = await createRoom("Grace's", { closedTo: [member.user.id, agent.id], as: member });
    expect(await isMember(own.id, agent.id)).toBe(true);
    // But not without themselves.
    const alone = await createRoom("Scout's", { closedTo: [administrator.user.id, agent.id], as: administrator });
    expect(await isMember(alone.id, agent.id)).toBe(false);
  });

  it("leaves a room when its person leaves it or is taken out", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    await setLimit(administrator, 2);
    const { agent, key } = await made(member, "Scout", grace.password);
    const left = await createRoom("Left", { closedTo: [administrator.user.id, member.user.id], as: administrator });
    const taken = await createRoom("Taken", { closedTo: [administrator.user.id, member.user.id], as: administrator });
    for (const room of [left, taken]) await placeAgent(member, agent.id, room.id);
    expect((await api(`/api/rooms/${left.id}/membership`, as(member, { method: "DELETE" }))).status).toBe(204);
    expect(await isMember(left.id, agent.id)).toBe(false);
    expect((await postAs(key, left.id, "Still here?")).status).toBe(404);
    // An administrator who keeps the agent listed but not its person takes both out.
    const changed = await api(
      `/api/rooms/${taken.id}`,
      as(administrator, { method: "PATCH", body: json({ kind: "closed", memberIds: [administrator.user.id, agent.id] }) }),
    );
    expect(changed.status, await changed.clone().text()).toBe(200);
    expect(await isMember(taken.id, member.user.id)).toBe(false);
    expect(await isMember(taken.id, agent.id)).toBe(false);
  });

  it("has a DM only its person can start", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    await setLimit(administrator, 2);
    const { agent } = await made(member, "Scout", grace.password);
    expect(await errorOf(await startDirect(administrator, [agent.id]), 403)).toBe(AGENT_DIRECT_REFUSED);
    expect(await errorOf(await startDirect(administrator, [member.user.id, agent.id]), 403)).toBe(AGENT_DIRECT_REFUSED);
    expect((await startDirect(member, [agent.id])).status).toBe(201);
  });

  it("are listed at GET /bot/rooms, for any bot", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    await setLimit(administrator, 2);
    const { agent, key } = await made(member, "Scout", grace.password);
    const general = await generalRoom();
    await placeAgent(member, agent.id, general);
    const direct = (await (await startDirect(member, [agent.id])).json()) as { room: { id: RoomId } };
    const listed = await api("/bot/rooms", { headers: { Authorization: `Bearer ${key}` } });
    expect(listed.status).toBe(200);
    expect((await listed.json()) as BotRoomListed[]).toEqual([
      { id: general, name: "general", kind: "open" },
      { id: direct.room.id, name: null, kind: "direct" },
    ]);
    expect((await api("/bot/rooms", { headers: { Authorization: `Bearer ${agent.id}-nope` } })).status).toBe(401);
    expect((await api("/bot/rooms")).status).toBe(401);
    // And for an administrator's bot, which joined the open rooms.
    const bot = (await (await api("/api/account/bots", as(administrator, { method: "POST", body: json({ name: "Build Bot" }) }))).json()) as {
      bot: { key: string };
    };
    const rooms = (await (await api("/bot/rooms", { headers: { Authorization: `Bearer ${bot.bot.key}` } })).json()) as BotRoomListed[];
    expect(rooms.map((room) => room.name)).toContain("general");
  });
});

describe("its person answers for it", () => {
  /** Grace's agent, in general, with her, and Ada, signed in. */
  async function withAgent() {
    const administrator = await setUp();
    const member = await join(grace);
    await setLimit(administrator, 2);
    const { agent, key } = await made(member, "Scout", grace.password);
    const general = await generalRoom();
    await placeAgent(member, agent.id, general);
    expect((await postAs(key, general, "Before")).status).toBe(201);
    return { administrator, member, agent, key, general };
  }

  it("turns off with its person's removal, key and all", async () => {
    const { administrator, member, agent, key, general } = await withAgent();
    expect((await api(`/api/account/users/${member.user.id}`, as(administrator, { method: "DELETE" }))).status).toBe(200);
    expect((await postAs(key, general, "After")).status).toBe(401);
    expect((await api("/bot/rooms", { headers: { Authorization: `Bearer ${key}` } })).status).toBe(401);
    expect(await stored(agent.id)).toMatchObject({ status: 1, bot_key_digest: null });
    expect(await isMember(general, agent.id)).toBe(false);
    // What it said stays, shown as its person's agent's.
    const { users } = (await (await api("/api/users", as(administrator))).json()) as Directory;
    expect(users.find((user) => user.id === agent.id)).toMatchObject({ status: "deactivated", ownerId: member.user.id, agent: true });
  });

  it("turns off with its person's ban, and stays off once it's lifted", async () => {
    const { administrator, member, agent, key, general } = await withAgent();
    expect((await api(`/api/users/${member.user.id}/ban`, as(administrator, { method: "POST" }))).status).toBe(200);
    expect((await postAs(key, general, "After")).status).toBe(401);
    expect((await stored(agent.id)).bot_key_digest).toBeNull();
    expect((await api(`/api/users/${member.user.id}/ban`, as(administrator, { method: "DELETE" }))).status).toBe(200);
    expect((await stored(agent.id)).status).toBe(1);
    expect((await postAs(key, general, "Back?")).status).toBe(401);
  });

  it("is turned away mid-request when its person is removed", async () => {
    const { administrator, member, key, general } = await withAgent();
    let sent = false;
    const body = new ReadableStream<Uint8Array>(
      {
        async pull(controller) {
          if (!sent) {
            sent = true;
            await api(`/api/account/users/${member.user.id}`, as(administrator, { method: "DELETE" }));
          }
          controller.enqueue(new TextEncoder().encode("Slipping through"));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const response = await api(`/bot/rooms/${general}/messages`, {
      method: "POST",
      body,
      headers: { Authorization: `Bearer ${key}` },
      duplex: "half",
    } as RequestInit);
    expect(response.status).toBe(401);
    const messages = (await (await api(`/api/rooms/${general}/export`, as(administrator))).text())
      .split("\n")
      .filter((line) => line.includes("Slipping through"));
    expect(messages).toEqual([]);
  });

  it("can be turned off by an administrator, and by nobody else but its person", async () => {
    const { administrator, member, agent, key, general } = await withAgent();
    const other = await join(alan);
    expect(await errorOf(await turnOff(other, agent.id), 403)).toBe(PERSONAL_AGENTS_FORBIDDEN);
    expect(await errorOf(await turnOff(member, agent.id), 403)).toBe(PERSONAL_AGENTS_FORBIDDEN);
    expect((await turnOff(administrator, agent.id)).status).toBe(204);
    expect((await postAs(key, general, "After")).status).toBe(401);
    expect((await turnOff(administrator, agent.id)).status).toBe(404);
    await vi.waitFor(async () => expect(await workspaceSql("SELECT count(*) AS n FROM pending_revocations")).toEqual([{ n: 0 }]), { timeout: 5_000 });
  });
});
