import { describe, expect, it } from "vitest";
import { NAME_RESERVED } from "./index.ts";
import { LIMIT_REFUSED, ownersAgent, parseNewPersonalAgent, parsePersonalAgentLimit, parsePersonalAgentName, personalAgentsFull } from "./personal-agents.ts";

describe("personal agents", () => {
  it("are called their person's agent", () => {
    expect(ownersAgent("Pete")).toBe("Pete's agent");
  });

  it("take a name as a bot does, never @ember's", () => {
    expect(parsePersonalAgentName({ name: "Scout" })).toEqual({ name: "Scout" });
    expect(parsePersonalAgentName({ name: "  " })).toBe("Name can't be blank");
    expect(parsePersonalAgentName({ name: "x".repeat(101) })).toBe("Name can't be longer than 100 characters");
    expect(parsePersonalAgentName({ name: "Ember" })).toBe(NAME_RESERVED);
    expect(parsePersonalAgentName([])).toBe("Expected a JSON object");
  });

  it("are made with a name and the current password, and nothing else is read", () => {
    expect(parseNewPersonalAgent({ name: "Scout", currentPassword: "secret", role: "administrator", ownerId: "someone" })).toEqual({
      name: "Scout",
      currentPassword: "secret",
    });
    expect(parseNewPersonalAgent({ name: "Scout" })).toEqual({ name: "Scout" });
    expect(parseNewPersonalAgent({ name: "Scout", currentPassword: 1 })).toBe("Current password must be text");
  });

  it("are limited to a whole number from 0 to 10", () => {
    expect(parsePersonalAgentLimit({ limit: 0 })).toEqual({ limit: 0 });
    expect(parsePersonalAgentLimit({ limit: 10 })).toEqual({ limit: 10 });
    for (const limit of [-1, 11, 2.5, "3", null]) expect(parsePersonalAgentLimit({ limit })).toBe(LIMIT_REFUSED);
    expect(personalAgentsFull(1)).toBe("You can have at most 1 agent. Delete one first.");
    expect(personalAgentsFull(3)).toBe("You can have at most 3 agents. Delete one first.");
  });
});
