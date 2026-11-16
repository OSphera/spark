import { CloseCode, type Directory, type Me, type NewWorkspace, type UserId } from "@ember/protocol";
import { GUESTS_HAVE_NO_AGENTS, type PersonalAgentAnswer } from "@ember/protocol/personal-agents";
import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonalAgentStore } from "../src/bots/personal-agents-store";
import { DEFAULT_BOT_AVATAR } from "../src/default-bot-avatar";
import type { Env } from "../src/env";
import type { Workspace } from "../src/workspace";
import { api, apiWith, avatarVersionOf, cookieOf, freshDeploy, openWorkspaceSocket, origin, recordedImage, shown, signIn, stopTheClock, workspaceSql, workspaceStub, type Session } from "./support";

// Personal agents' pictures: their person gives, replaces and removes them, and nobody else can.

const files = (env as unknown as Env).FILES!;

const LONG_AGO = "2026-01-01T00:00:00.000Z";

const ada = { name: "Ada Lovelace", emailAddress: "ada@example.com", password: "analytical engine" };
const grace = { name: "Grace Hopper", emailAddress: "grace@example.com", password: "compiler design" };
const alan = { name: "Alan Turing", emailAddress: "alan@example.com", password: "universal machine" };

beforeEach(freshDeploy);
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Sets Ember up with Ada as its administrator, signed in, letting each person have two agents. */
async function setUp(): Promise<Session> {
  const response = await api("/api/first_run", { method: "POST", body: JSON.stringify(ada) });
  expect(response.status).toBe(201);
  const administrator = { user: shown(((await response.json()) as NewWorkspace).user), cookie: cookieOf(response) };
  expect((await api("/api/account/personal_agents", { method: "PATCH", headers: { Cookie: administrator.cookie }, body: JSON.stringify({ limit: 2 }) })).status).toBe(200);
  return administrator;
}

/** Someone joins with the join link, as a member, signed in. */
async function join(person: typeof grace): Promise<Session> {
  const [{ join_code: joinCode }] = (await workspaceSql("SELECT join_code FROM accounts")) as [{ join_code: string }];
  const response = await api(`/api/join/${joinCode}`, { method: "POST", body: JSON.stringify(person) });
  expect(response.status).toBe(201);
  return { user: shown(((await response.json()) as { user: Me }).user), cookie: cookieOf(response) };
}

/** Makes an agent called `name` for `owner`, whose password is `password`, as it was long ago, answering it as it is then. */
async function made(owner: Session, name: string, password: string): Promise<PersonalAgentAnswer["agent"]> {
  const response = await api("/api/users/me/agents", { method: "POST", headers: { Cookie: owner.cookie }, body: JSON.stringify({ name, currentPassword: password }) });
  expect(response.status, await response.clone().text()).toBe(201);
  const { agent } = (await response.json()) as PersonalAgentAnswer;
  // An avatar's address counts seconds.
  await workspaceSql("UPDATE users SET updated_at = ? WHERE id = ?", LONG_AGO, agent.id);
  const yours = (await (await api("/api/users/me/agents", { headers: { Cookie: owner.cookie } })).json()) as { agents: PersonalAgentAnswer["agent"][] };
  return yours.agents.find(({ id }) => id === agent.id)!;
}

/** moon.jpg, a JPEG of 640×640, and the WebP of 512×512 the browser makes of it. */
const moon = () => new File([recordedImage("moon-thumb.jpg")], "moon.jpg", { type: "image/jpeg" });
const moonVariant = () => new File([recordedImage("moon-avatar.webp")], "blob", { type: "image/webp" });

/** A picture's form, as the profile sends your own avatar's. */
function pictureForm(file: File | string = moon()): FormData {
  const form = new FormData();
  form.append("avatar", file);
  if (typeof file !== "string") form.append("variant", moonVariant());
  return form;
}

/** `form` as a browser sends it, with its length, signed in as `session` if given. */
async function sent(form: FormData, session: Session | null): Promise<{ body: ArrayBuffer; headers: Record<string, string> }> {
  const request = new Request(origin, { method: "PUT", body: form });
  const body = await request.arrayBuffer();
  const headers = { "Content-Type": request.headers.get("Content-Type")!, "Content-Length": String(body.byteLength) };
  return { body, headers: session ? { ...headers, Cookie: session.cookie } : headers };
}

const pathOf = (id: UserId) => `/api/users/me/agents/${id}/avatar`;
const putPicture = async (session: Session | null, id: UserId, form = pictureForm()) => api(pathOf(id), { method: "PUT", ...(await sent(form, session)) });
const deletePicture = (session: Session | null, id: UserId) => api(pathOf(id), { method: "DELETE", headers: session ? { Cookie: session.cookie } : {} });

async function agentOf(response: Response, status = 200): Promise<PersonalAgentAnswer["agent"]> {
  expect(response.status, await response.clone().text()).toBe(status);
  return ((await response.json()) as PersonalAgentAnswer).agent;
}

const avatar = (path: string, viewer: Session) => api(path, { headers: { Cookie: viewer.cookie } });
const storedAvatars = async () => (await files.list({ prefix: "avatars/" })).objects.map(({ key }) => key).sort();
const avatarKeyOf = async (userId: UserId) => ((await workspaceSql("SELECT avatar_key FROM users WHERE id = ?", userId)) as Array<{ avatar_key: string | null }>)[0]!.avatar_key;
const pendingDeletions = () => workspaceSql("SELECT object_key FROM pending_picture_deletions ORDER BY object_key");

describe("giving an agent a picture", () => {
  it("is its person's, who needs no password for it, and serves the variant their browser made", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    const scout = await made(member, "Scout", grace.password);
    expect(scout.avatar).toBe(false);
    expect(await (await avatar(scout.avatarUrl, member)).text()).toBe(DEFAULT_BOT_AVATAR);
    const workspace = await openWorkspaceSocket(administrator);

    const given = await agentOf(await putPicture(member, scout.id));
    expect(given).toMatchObject({ id: scout.id, name: "Scout", ownerId: member.user.id, avatar: true });
    expect(given.avatarUrl).not.toBe(scout.avatarUrl);
    expect(await workspace.next()).toMatchObject({ type: "user.updated", user: { id: scout.id, avatarUrl: given.avatarUrl, ownerId: member.user.id, agent: true } });

    const response = await avatar(given.avatarUrl, administrator);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(recordedImage("moon-avatar.webp"));
    const key = (await avatarKeyOf(scout.id))!;
    expect(await storedAvatars()).toEqual([key, `${key}/512`]);
    expect((await files.head(key))?.httpMetadata?.contentType).toBe("image/jpeg");
    // Given to the agent, the picture stays in R2.
    expect(await pendingDeletions()).toEqual([]);
  });

  it("shows in its person's list, and in the directory still as an agent of theirs", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    const scout = await made(member, "Scout", grace.password);
    await agentOf(await putPicture(member, scout.id));

    const yours = (await (await api("/api/users/me/agents", { headers: { Cookie: member.cookie } })).json()) as { agents: Array<{ id: UserId; avatar: boolean }> };
    expect(yours.agents.map(({ id, avatar }) => ({ id, avatar }))).toEqual([{ id: scout.id, avatar: true }]);
    const { users } = (await (await api("/api/users", { headers: { Cookie: administrator.cookie } })).json()) as Directory;
    expect(users.find((user) => user.id === scout.id)).toMatchObject({ role: "bot", agent: true, ownerId: member.user.id });
    const everyone = (await (await api("/api/account/personal_agents", { headers: { Cookie: administrator.cookie } })).json()) as { agents: Array<{ id: UserId; avatar: boolean }> };
    expect(everyone.agents.map(({ avatar }) => avatar)).toEqual([true]);
  });

  it("replaces it, which R2 deletes, and removes it, which brings back the picture chat bots start with", async () => {
    await setUp();
    const member = await join(grace);
    const scout = await made(member, "Scout", grace.password);

    await agentOf(await putPicture(member, scout.id));
    const first = (await avatarKeyOf(scout.id))!;
    await workspaceSql("UPDATE users SET updated_at = ? WHERE id = ?", LONG_AGO, scout.id);
    const replaced = await agentOf(await putPicture(member, scout.id));
    const second = (await avatarKeyOf(scout.id))!;
    expect(second).not.toBe(first);
    await vi.waitFor(async () => expect(await storedAvatars()).toEqual([second, `${second}/512`]), { timeout: 5_000 });
    expect(await pendingDeletions()).toEqual([]);

    // Within the second of the change before it, which waits for the next.
    const removed = await agentOf(await deletePicture(member, scout.id));
    expect(removed.avatar).toBe(false);
    expect(removed.avatarUrl).not.toBe(replaced.avatarUrl);
    expect(await avatarKeyOf(scout.id)).toBeNull();
    expect(await (await avatar(removed.avatarUrl, member)).text()).toBe(DEFAULT_BOT_AVATAR);
    await vi.waitFor(async () => expect(await storedAvatars()).toEqual([]), { timeout: 5_000 });

    // Removing what isn't there changes nothing, not even its address.
    expect((await agentOf(await deletePicture(member, scout.id))).avatarUrl).toBe(removed.avatarUrl);
  });

  it("gives each change a later address, even one in the same second as the last", async () => {
    stopTheClock();
    await setUp();
    const member = await join(grace);
    const scout = await made(member, "Scout", grace.password);
    await workspaceSql("UPDATE users SET updated_at = ? WHERE id = ?", new Date().toISOString(), scout.id);
    const first = await agentOf(await putPicture(member, scout.id));
    const second = await agentOf(await putPicture(member, scout.id));
    const removed = await agentOf(await deletePicture(member, scout.id));
    const versions = [first, second, removed].map(({ avatarUrl }) => avatarVersionOf(avatarUrl));
    expect(new Set(versions).size).toBe(3);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
  });

  it("takes what your own avatar does: a picture's file, and R2 to keep it in (the checks are `avatarOf`'s, which avatars.test.ts covers)", async () => {
    await setUp();
    const member = await join(grace);
    const scout = await made(member, "Scout", grace.password);

    const notAFile = await putPicture(member, scout.id, pictureForm("moon.jpg"));
    expect([notAFile.status, await notAFile.json()]).toEqual([400, { error: "Choose a picture" }]);
    const unbound = await apiWith({ FILES: undefined }, pathOf(scout.id), { method: "PUT", ...(await sent(pictureForm(), member)) });
    expect([unbound.status, await unbound.json()]).toEqual([503, { error: "Ember isn't set up to store files" }]);
    expect(await avatarKeyOf(scout.id)).toBeNull();
    expect(await storedAvatars()).toEqual([]);
  });
});

describe("who can", () => {
  it("is its person alone: nobody signed out, a guest, another member, an administrator, and not for a person or a bot", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    const other = await join(alan);
    const guest = await signIn("Visitor");
    const scout = await made(member, "Scout", grace.password);
    const mine = await made(other, "Mine", alan.password);

    expect((await putPicture(null, scout.id)).status).toBe(401);
    expect((await deletePicture(null, scout.id)).status).toBe(401);
    for (const [session, status] of [[guest, 403], [other, 404], [administrator, 404]] as const) {
      for (const response of [await putPicture(session, scout.id), await deletePicture(session, scout.id)]) {
        expect(response.status, await response.clone().text()).toBe(status);
        if (status === 403) expect(((await response.json()) as { error: string }).error).toBe(GUESTS_HAVE_NO_AGENTS);
      }
    }
    // Not a person's, nor a chat bot's, nor anyone's.
    const bot = (await (await api("/api/account/bots", { method: "POST", headers: { Cookie: administrator.cookie }, body: JSON.stringify({ name: "Build Bot" }) })).json()) as { bot: { id: UserId } };
    for (const id of [member.user.id, bot.bot.id, "0000000000000000"]) {
      expect((await putPicture(member, id)).status).toBe(404);
      expect((await deletePicture(member, id)).status).toBe(404);
    }
    expect(await avatarKeyOf(scout.id)).toBeNull();
    expect(await avatarKeyOf(mine.id)).toBeNull();
    expect(await storedAvatars()).toEqual([]);
    expect(await pendingDeletions()).toEqual([]);

    // Another's picture can't be taken away either.
    await agentOf(await putPicture(member, scout.id));
    const key = await avatarKeyOf(scout.id);
    expect((await deletePicture(administrator, scout.id)).status).toBe(404);
    expect((await deletePicture(other, scout.id)).status).toBe(404);
    expect(await avatarKeyOf(scout.id)).toBe(key);
  });

  it("changes nothing for an agent that's turned off, whoever asks", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    const scout = await made(member, "Scout", grace.password);
    await agentOf(await putPicture(member, scout.id));
    const key = await avatarKeyOf(scout.id);
    expect((await api(`/api/account/personal_agents/${scout.id}`, { method: "DELETE", headers: { Cookie: administrator.cookie } })).status).toBe(204);

    expect((await putPicture(member, scout.id)).status).toBe(404);
    expect((await deletePicture(member, scout.id)).status).toBe(404);
    expect(await avatarKeyOf(scout.id)).toBe(key);
    expect(await storedAvatars()).toEqual([key, `${key}/512`]);
  });

  it("is enforced in the statement that writes, as renaming is, so a change that gets past the checks still finds nobody to change", async () => {
    const administrator = await setUp();
    const member = await join(grace);
    const other = await join(alan);
    const scout = await made(member, "Scout", grace.password);
    await agentOf(await putPicture(member, scout.id));
    const key = (await avatarKeyOf(scout.id))!;
    const picture = (name: string) => ({ key: `avatars/${name}`, variant: "image/webp" });
    await workspaceSql("INSERT INTO pending_picture_deletions (object_key, due_at) VALUES (?, ?)", "avatars/reserved", Date.now() + 60_000);

    const asked = await runInDurableObject(workspaceStub(), async (workspace: Workspace) => {
      const agents = (workspace as unknown as { agentStore: PersonalAgentStore }).agentStore;
      const now = new Date().toISOString();
      const wrongOwner = await agents.changePicture(scout.id, other.user.id, picture("reserved"), key, now, Date.now());
      const administrators = await agents.changePicture(scout.id, administrator.user.id, null, key, now, Date.now());
      await agents.turnOff(scout.id, CloseCode.Revoked, Date.now(), now);
      const turnedOff = await agents.changePicture(scout.id, member.user.id, picture("reserved"), key, now, Date.now());
      return [wrongOwner, administrators, turnedOff];
    });
    expect(asked).toEqual([false, false, false]);
    // Nothing changed, the picture it has isn't queued for deletion, and the one that wasn't given stays reserved, for R2 to delete.
    expect(await avatarKeyOf(scout.id)).toBe(key);
    expect(await pendingDeletions()).toEqual([{ object_key: "avatars/reserved" }]);
  });
});

describe("an agent that's turned off", () => {
  it.each([
    ["by its person deleting it", (member: Session, _administrator: Session, id: UserId) => api(`/api/users/me/agents/${id}`, { method: "DELETE", headers: { Cookie: member.cookie } })],
    ["by an administrator", (_member: Session, administrator: Session, id: UserId) => api(`/api/account/personal_agents/${id}`, { method: "DELETE", headers: { Cookie: administrator.cookie } })],
    ["with its person's removal", (_member: Session, administrator: Session, _id: UserId, owner: UserId) => api(`/api/account/users/${owner}`, { method: "DELETE", headers: { Cookie: administrator.cookie } })],
  ])("keeps its picture, stored and served, %s", async (_how, turnOff) => {
    const administrator = await setUp();
    const member = await join(grace);
    const scout = await made(member, "Scout", grace.password);
    const given = await agentOf(await putPicture(member, scout.id));
    const key = (await avatarKeyOf(scout.id))!;

    expect([200, 204]).toContain((await turnOff(member, administrator, scout.id, member.user.id)).status);
    expect(((await workspaceSql("SELECT status FROM users WHERE id = ?", scout.id)) as [{ status: number }])[0].status).not.toBe(0);
    // Its row, R2's copy and the address its old messages show it at are all as they were, and nothing is queued to delete it.
    expect(await avatarKeyOf(scout.id)).toBe(key);
    expect(await pendingDeletions()).toEqual([]);
    expect(await storedAvatars()).toEqual([key, `${key}/512`]);
    const response = await avatar(given.avatarUrl, administrator);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(recordedImage("moon-avatar.webp"));
  });
});
