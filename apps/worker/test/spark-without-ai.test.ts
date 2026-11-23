import type { NewWorkspace } from "@ember/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { api, cookieOf, freshDeploy } from "./support";

// Spark removed Ember's AI features (OSphera/spark#4): Ember AI's settings, AI agents, connected apps and
// Outside AI have no routes, so each answers 404, even to an administrator, and their pages are no pages.

const PASSWORD = "compiler design";

async function administrator(): Promise<string> {
  const response = await api("/api/first_run", { method: "POST", body: JSON.stringify({ name: "Ada Lovelace", emailAddress: "ada@example.com", password: PASSWORD }) });
  expect(response.status).toBe(201);
  expect(((await response.json()) as NewWorkspace).user.administrator).toBe(true);
  return cookieOf(response);
}

beforeEach(freshDeploy);

describe("Spark without Ember's AI", () => {
  it("answers 404 at the API routes Ember AI, the agents, connected apps and Outside AI had", async () => {
    const cookie = await administrator();
    const routes: Array<[string, string]> = [
      ["PUT", "/api/account/assistant"],
      ["PATCH", "/api/account/assistant"],
      ["DELETE", "/api/account/assistant"],
      ["POST", "/api/account/assistant/offered"],
      ["POST", "/api/account/assistant/models"],
      ["PUT", "/api/account/assistant/web_search"],
      ["GET", "/api/account/agents"],
      ["POST", "/api/account/agents"],
      ["POST", "/api/account/agents/trials"],
      ["GET", "/api/account/agents/ember"],
      ["GET", "/api/account/agents/ember/tools"],
      ["GET", "/api/account/apps"],
      ["POST", "/api/account/apps"],
      ["POST", "/api/account/app-sign-ins"],
      ["PUT", "/api/account/outside_ai"],
      ["GET", "/api/agents"],
      ["PATCH", "/api/users/me/assistant"],
      ["POST", "/api/users/me/apps/a1/sign-in"],
      ["DELETE", "/api/users/me/outside/c1"],
      ["POST", "/api/outside/asks"],
      ["POST", "/api/outside/answers"],
    ];
    for (const [method, path] of routes) {
      const response = await api(path, { method, headers: { Cookie: cookie, "Content-Type": "application/json" }, ...(method === "GET" ? {} : { body: "{}" }) });
      expect(response.status, `${method} ${path}`).toBe(404);
    }
  });

  it("answers 404 at the pages and endpoints the AI apps and agents had", async () => {
    const cookie = await administrator();
    for (const path of ["/account/agents/new", "/account/agents/ember/edit", "/account/apps/new", "/account/apps/a1/edit", "/account/apps/signed-in", "/oauth/authorize", "/oauth/client.json", "/mcp", "/.well-known/oauth-authorization-server", "/.well-known/oauth-protected-resource"]) {
      const response = await api(path, { headers: { Cookie: cookie } });
      expect(response.status, path).toBe(404);
    }
  });
});
