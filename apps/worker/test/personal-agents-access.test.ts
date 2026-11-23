import type { Directory, DirectoryUser, Me, NewWorkspace, RoomId, UserId } from "@ember/protocol";
import type { PersonalAgentAnswer } from "@ember/protocol/personal-agents";
import { beforeEach, describe, expect, it } from "vitest";
import { api, cookieOf, createRoom, freshDeploy, shown, workspaceSql, type Session } from "./support";

// People's own agents: bots without a token, which the Agent badge marks. Spark removed the AI agents
// administrators made beside them (OSphera/spark#4), so these check only what's left of that: a personal
// agent has no Admin access, no AI agent's page reaches it, and it stays out of new open rooms.

const PASSWORD = "compiler design";

/** Sets Ember up with Ada as its administrator, and a personal agent apiece allowed. */
async function setUp(): Promise<Session> {
  const response = await api("/api/first_run", { method: "POST", body: JSON.stringify({ name: "Ada Lovelace", emailAddress: "ada@example.com", password: PASSWORD }) });
  expect(response.status).toBe(201);
  const ada = { user: shown(((await response.json()) as NewWorkspace).user), cookie: cookieOf(response) };
  const limit = await api("/api/account/personal_agents", { method: "PATCH", headers: { Cookie: ada.cookie }, body: JSON.stringify({ limit: 1 }) });
  expect(limit.status, await limit.clone().text()).toBe(200);
  return ada;
}

async function joinAs(name: string): Promise<Session> {
  const [{ join_code: joinCode }] = (await workspaceSql("SELECT join_code FROM accounts")) as [{ join_code: string }];
  const person = { name, emailAddress: `${name.split(" ")[0]!.toLowerCase()}@example.com`, password: PASSWORD };
  const response = await api(`/api/join/${joinCode}`, { method: "POST", body: JSON.stringify(person) });
  expect(response.status, await response.clone().text()).toBe(201);
  return { user: shown(((await response.json()) as { user: Me }).user), cookie: cookieOf(response) };
}

async function makePersonalAgent(owner: Session, name: string): Promise<UserId> {
  const response = await api("/api/users/me/agents", { method: "POST", headers: { Cookie: owner.cookie }, body: JSON.stringify({ name, currentPassword: PASSWORD }) });
  expect(response.status, await response.clone().text()).toBe(201);
  return ((await response.json()) as PersonalAgentAnswer).agent.id;
}

const directory = async (viewer: Session): Promise<DirectoryUser[]> => ((await (await api("/api/users", { headers: { Cookie: viewer.cookie } })).json()) as Directory).users;
const roomsOf = async (userId: UserId) => ((await workspaceSql("SELECT room_id FROM memberships WHERE user_id = ?", userId)) as Array<{ room_id: RoomId }>).map(({ room_id }) => room_id);

beforeEach(freshDeploy);

describe("A person's own agent", () => {
  it("is listed as their agent, with no Admin access, and no AI agent's page reaches it", async () => {
    const ada = await setUp();
    const grace = await joinAs("Grace Hopper");
    const helper = await makePersonalAgent(grace, "Helper");

    const listed = await directory(grace);
    expect(listed.find(({ id }) => id === helper)).toMatchObject({ role: "bot", agent: true, ownerId: grace.user.id });
    expect(listed.find(({ id }) => id === helper)).not.toHaveProperty("adminsOnly");

    const changed = await api(`/api/account/agents/${helper}`, { method: "PATCH", headers: { Cookie: ada.cookie }, body: JSON.stringify({ access: "admins" }) });
    expect(changed.status).toBe(404);
    expect(await workspaceSql("SELECT agent_access, owner_id FROM users WHERE id = ?", helper)).toEqual([{ agent_access: null, owner_id: grace.user.id }]);
  });

  it("stays out of a new open room", async () => {
    const ada = await setUp();
    const grace = await joinAs("Grace Hopper");
    const helper = await makePersonalAgent(grace, "Helper");
    const { id: news } = await createRoom("news", { as: ada });
    expect(await roomsOf(grace.user.id)).toContain(news);
    expect(await roomsOf(helper)).not.toContain(news);
  });
});
