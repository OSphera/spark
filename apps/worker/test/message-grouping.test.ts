import type { Bootstrap, NewWorkspace } from "@ember/protocol";
import { GROUPING_MINUTES_REFUSED } from "@ember/protocol/grouping";
import { beforeEach, describe, expect, it } from "vitest";
import { api, cookieOf, freshDeploy, openWorkspaceSocket, shown, signIn, workspaceSql, type Session } from "./support";

// Spark (OSphera/spark#2): Message grouping, the window an administrator chooses in Workspace settings.

const ada = { name: "Ada Lovelace", emailAddress: "ada@example.com", password: "analytical engine" };

async function setUp(): Promise<Session> {
  const response = await api("/api/first_run", { method: "POST", body: JSON.stringify(ada) });
  expect(response.status).toBe(201);
  return { user: shown(((await response.json()) as NewWorkspace).user), cookie: cookieOf(response) };
}

const as = (session?: Session | null): Record<string, string> => (session ? { Cookie: session.cookie } : {});
const choose = (session: Session | null, groupingMinutes: unknown) => api("/api/account", { method: "PATCH", headers: as(session), body: JSON.stringify({ groupingMinutes }) });
const shownAccount = async () => ((await (await api("/api/bootstrap")).json()) as Bootstrap).account;
const storedSettings = async () => JSON.parse(((await workspaceSql("SELECT settings FROM accounts")) as Array<{ settings: string }>)[0]!.settings) as Record<string, unknown>;

beforeEach(freshDeploy);

describe("Message grouping (setting)", () => {
  it("says nothing until an administrator chooses, so pages group two minutes apart", async () => {
    expect(await shownAccount()).not.toHaveProperty("groupingMinutes");
    await setUp();
    expect(await shownAccount()).not.toHaveProperty("groupingMinutes");
    expect(await storedSettings()).not.toHaveProperty("grouping_minutes");
  });

  it("changes for everyone as an administrator chooses, telling every tab, and goes quiet again at the default", async () => {
    const administrator = await setUp();
    const member = await signIn("Grace");
    const sockets = [await openWorkspaceSocket(administrator), await openWorkspaceSocket(member)];

    const response = await choose(administrator, 5);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ account: { groupingMinutes: 5 } });
    expect(await storedSettings()).toMatchObject({ grouping_minutes: 5 });
    for (const socket of sockets) expect(await socket.next()).toMatchObject({ type: "account.updated", account: { groupingMinutes: 5 } });
    expect((await shownAccount()).groupingMinutes).toBe(5);

    expect((await choose(administrator, 0)).status).toBe(200);
    expect((await shownAccount()).groupingMinutes).toBe(0);
    expect((await choose(administrator, 2)).status).toBe(200);
    expect(await shownAccount()).not.toHaveProperty("groupingMinutes");
  });

  it("is an administrator's to choose, and only among the windows offered", async () => {
    const administrator = await setUp();
    const member = await signIn("Grace");
    expect((await choose(member, 5)).status).toBe(403);
    for (const refused of [3, "5", -1, null]) {
      const response = await choose(administrator, refused);
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ error: GROUPING_MINUTES_REFUSED });
    }
    expect(await storedSettings()).not.toHaveProperty("grouping_minutes");
  });
});
