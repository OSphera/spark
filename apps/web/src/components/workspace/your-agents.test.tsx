import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PersonalAgent, YourAgents as Yours } from "@ember/protocol/personal-agents";
import type { SidebarRoom } from "@ember/protocol";
import { FlashProvider } from "@/components/flash";
import { KEY_SHOWN_ONCE, YOUR_AGENTS_EXPLAINED, YourAgents } from "./your-agents";

const SCOUT: PersonalAgent = {
  id: "0mgk3x2a9b4c70ab",
  name: "Scout",
  bio: null,
  role: "bot",
  status: "active",
  avatarUrl: "/users/x/avatar?v=1",
  agent: true,
  ownerId: "0mgk3x2a9b4c70aa",
  rooms: [{ id: "0mgk3x2a9b4c70r1", name: "general" }],
  usedAt: null,
};
const ROOMS = [
  { id: "0mgk3x2a9b4c70r1", kind: "open", name: "general", icon: null, unread: false, involvement: "mentions" },
  { id: "0mgk3x2a9b4c70r2", kind: "closed", name: "plans", icon: null, unread: false, involvement: "everything" },
] as SidebarRoom[];

/** Answers each request with what `answers` gives for it, keeping which were made. */
function serve(answers: (method: string, path: string, body: unknown) => unknown) {
  const requests: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const method = init?.method ?? "GET";
    requests.push(`${method} ${String(input)}`);
    return Response.json(answers(method, String(input), init?.body ? JSON.parse(String(init.body)) : null));
  });
  return requests;
}

function show(agents: Yours, hasPassword = true) {
  const onFailed = vi.fn();
  render(
    <FlashProvider workspace>
      <YourAgents agents={agents} rooms={ROOMS} hasPassword={hasPassword} onFailed={onFailed} />
    </FlashProvider>,
  );
  return { user: userEvent.setup(), onFailed };
}

afterEach(() => vi.restoreAllMocks());

describe("The Your agents section of your profile", () => {
  it("lists your agents with their rooms, as your profile loaded them, and shows a new one's key once", async () => {
    const requests = serve((method) =>
      method === "POST"
        ? { agent: { ...SCOUT, id: "0mgk3x2a9b4c70ac", name: "Herald", rooms: [] }, key: "0mgk3x2a9b4c70ac-abc" }
        : null,
    );
    const { user } = show({ limit: 2, agents: [SCOUT] });
    const section = await screen.findByRole("region", { name: "Your agents" });
    expect(within(section).getByText(YOUR_AGENTS_EXPLAINED)).toBeVisible();
    expect(within(section).getByRole("list", { name: "Scout's rooms" })).toHaveTextContent("general");
    // Only the rooms it isn't in yet are offered.
    expect(
      within(within(section).getByRole("combobox", { name: "Put Scout in a room" }))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Put it in a room…", "plans"]);

    await user.type(within(section).getByRole("textbox", { name: "New agent's name" }), "Herald");
    await user.type(within(section).getByLabelText(/^Current password/), "compiler design");
    await user.click(within(section).getByRole("button", { name: "Make agent" }));

    expect(await within(section).findByRole("textbox", { name: "Herald's key" })).toHaveValue("0mgk3x2a9b4c70ac-abc");
    expect(within(section).getByText(KEY_SHOWN_ONCE, { exact: false })).toBeVisible();
    expect(requests).toEqual(["POST /api/users/me/agents"]);
  });
});
