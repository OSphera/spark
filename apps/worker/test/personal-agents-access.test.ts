import type { Directory, DirectoryUser, DirectRoom, Me, NewWorkspace, RoomId, UserId } from "@ember/protocol";
import type { AgentAnswer, AgentSettings, AvailableAgents, NewAgent } from "@ember/protocol/agents";
import { THINKING_LEVELS } from "@ember/protocol/assistant";
import type { PersonalAgentAnswer } from "@ember/protocol/personal-agents";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentWithKeptModel, answerWithKeptModel, api, cookieOf, createRoom, freshDeploy, shown, startDirect, workspaceSql, type KeptModel, type Session } from "./support";

// People's own agents beside the AI agents administrators make: both are bots without a token, which
// the Agent badge marks, but only the AI agents are in `agents`, and only they have Admin access.

const SETUP = { accountId: "0123456789abcdef0123456789abcdef", apiToken: "an-api-token-with-ai-gateway-run_0123456" };
const [GLM, GEMMA, SONNET] = ["@cf/zai-org/glm-4.7-flash", "@cf/google/gemma-4-26b-a4b-it", "anthropic/claude-sonnet-5.5"];
const KEPT_GLM: KeptModel = { id: GLM, name: "GLM-4.7 Flash", format: "chat", thinkingLevels: [...THINKING_LEVELS] };
const KEPT_GEMMA: KeptModel = { id: GEMMA, name: "Gemma 4 26B", format: "chat", thinkingLevels: [...THINKING_LEVELS] };
const PASSWORD = "compiler design";

const SCOUT: NewAgent = {
  name: "Scout",
  description: "Finds what's current",
  instructions: "Say what you know of the weather, and nothing else.",
  model: "anthropic/claude-haiku-5.5",
  thinking: "off",
  length: "short",
  webSearch: false,
  rooms: null,
};

/** A model's answer saying `text`, for whichever API asks. */
function internet(text: string): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const { url } = new Request(input, init);
    return url.endsWith("/messages")
      ? Response.json({ type: "message", role: "assistant", content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 10 } })
      : Response.json({ object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }] });
  });
}

/** Sets Ember up with Ada as its administrator, Ember AI on, and a personal agent apiece allowed. */
async function setUp(): Promise<Session> {
  const response = await api("/api/first_run", { method: "POST", body: JSON.stringify({ name: "Ada Lovelace", emailAddress: "ada@example.com", password: PASSWORD }) });
  expect(response.status).toBe(201);
  const ada = { user: shown(((await response.json()) as NewWorkspace).user), cookie: cookieOf(response) };
  internet("Hello, team!");
  const saved = await api("/api/account/assistant", { method: "PUT", headers: { Cookie: ada.cookie }, body: JSON.stringify({ ...SETUP, model: SONNET }) });
  expect(saved.status, await saved.clone().text()).toBe(200);
  vi.restoreAllMocks();
  await answerWithKeptModel(KEPT_GLM);
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

async function makeAiAgent(administrator: Session, agent: NewAgent): Promise<AgentSettings> {
  internet("Hello, team!");
  const response = await api("/api/account/agents", { method: "POST", headers: { Cookie: administrator.cookie }, body: JSON.stringify(agent) });
  expect(response.status, await response.clone().text()).toBe(201);
  vi.restoreAllMocks();
  const made = ((await response.json()) as AgentAnswer).agent;
  await agentWithKeptModel(made.id, KEPT_GEMMA);
  return made;
}

async function makePersonalAgent(owner: Session, name: string): Promise<UserId> {
  const response = await api("/api/users/me/agents", { method: "POST", headers: { Cookie: owner.cookie }, body: JSON.stringify({ name, currentPassword: PASSWORD }) });
  expect(response.status, await response.clone().text()).toBe(201);
  return ((await response.json()) as PersonalAgentAnswer).agent.id;
}

const directory = async (viewer: Session): Promise<DirectoryUser[]> => ((await (await api("/api/users", { headers: { Cookie: viewer.cookie } })).json()) as Directory).users;
const available = async (viewer: Session) => ((await (await api("/api/agents", { headers: { Cookie: viewer.cookie } })).json()) as AvailableAgents).agents.map(({ name }) => name);
const roomsOf = async (userId: UserId) => ((await workspaceSql("SELECT room_id FROM memberships WHERE user_id = ?", userId)) as Array<{ room_id: RoomId }>).map(({ room_id }) => room_id);

beforeEach(freshDeploy);
afterEach(() => vi.restoreAllMocks());

describe("A person's own agent beside AI agents kept for administrators", () => {
  it("isn't one of the AI agents Available Agents lists, and has no Admin access", async () => {
    const ada = await setUp();
    const grace = await joinAs("Grace Hopper");
    const helper = await makePersonalAgent(grace, "Helper");
    const kept = await makeAiAgent(ada, { ...SCOUT, access: "admin-dms" });
    expect(await available(grace)).toEqual(["Ember"]);
    expect(await available(ada)).toEqual(["Ember", "Scout"]);

    const listed = await directory(grace);
    expect(listed.find(({ id }) => id === helper)).toMatchObject({ role: "bot", agent: true, ownerId: grace.user.id });
    expect(listed.find(({ id }) => id === helper)).not.toHaveProperty("adminsOnly");
    // The AI agent only administrators' DMs reach is listed to them alone, and has no owner.
    expect(listed.find(({ id }) => id === kept.id)).toBeUndefined();
    const toAda = (await directory(ada)).find(({ id }) => id === kept.id);
    expect(toAda).toMatchObject({ agent: true, adminsOnly: true });
    expect(toAda).not.toHaveProperty("ownerId");

    // An AI agent's page, Admin access and all, doesn't reach a personal agent.
    const changed = await api(`/api/account/agents/${helper}`, { method: "PATCH", headers: { Cookie: ada.cookie }, body: JSON.stringify({ access: "admins" }) });
    expect(changed.status).toBe(404);
    expect(await workspaceSql("SELECT agent_access, owner_id FROM users WHERE id = ?", helper)).toEqual([{ agent_access: null, owner_id: grace.user.id }]);
  });

  it("stays out of a new open room, as an AI agent kept to administrators' DMs does", async () => {
    const ada = await setUp();
    const grace = await joinAs("Grace Hopper");
    const helper = await makePersonalAgent(grace, "Helper");
    const kept = await makeAiAgent(ada, { ...SCOUT, access: "admin-dms" });
    const { id: news } = await createRoom("news", { as: ada });
    expect(await roomsOf(grace.user.id)).toContain(news);
    expect(await roomsOf(helper)).not.toContain(news);
    expect(await roomsOf(kept.id)).toEqual([]);
  });

  it("keeps an administrator's AI agent for their DMs out of a DM with their own agent, which its key would read", async () => {
    const ada = await setUp();
    const helper = await makePersonalAgent(ada, "Helper");
    const kept = await makeAiAgent(ada, { ...SCOUT, access: "admin-dms" });
    const started = await startDirect(ada, [helper, kept.id]);
    expect([200, 201], await started.clone().text()).toContain(started.status);
    const { room } = (await started.json()) as { room: DirectRoom };
    expect(room.members.map(({ id }) => id).sort()).toEqual([ada.user.id, helper].sort());
  });
});
