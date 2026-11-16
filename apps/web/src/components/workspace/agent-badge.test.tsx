import type { DirectoryUser } from "@ember/protocol";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PeopleContext, type People } from "@/hooks/use-directory";
import { AgentBadge } from "./agent-badge";

const grace: DirectoryUser = {
  id: "u1",
  name: "Grace Hopper",
  bio: null,
  role: "member",
  status: "active",
  avatarUrl: "/users/u1.abc/avatar?v=20261014120000",
};
const scout: DirectoryUser = {
  id: "u2",
  name: "Scout",
  bio: null,
  role: "bot",
  status: "active",
  avatarUrl: "/users/u2.abc/avatar?v=20261014120000",
  agent: true,
  ownerId: grace.id,
};
const recap: DirectoryUser = {
  id: "u3",
  name: "Recap",
  bio: null,
  role: "bot",
  status: "active",
  avatarUrl: "/users/u3.abc/avatar?v=20261014120000",
  agent: true,
};

const badge = (agent: DirectoryUser, people: People) => render(<PeopleContext value={people}>{<AgentBadge agent={agent} />}</PeopleContext>);

describe("AgentBadge", () => {
  it("says whose a personal agent is, by their name now", () => {
    const { rerender } = badge(scout, new Map([grace, scout].map((user) => [user.id, user])));
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper's agent")).toBeInTheDocument();
    const renamed = { ...grace, name: "Amazing Grace" };
    rerender(<PeopleContext value={new Map([renamed, scout].map((user) => [user.id, user]))}>{<AgentBadge agent={scout} />}</PeopleContext>);
    expect(screen.getByText("Amazing Grace's agent")).toBeInTheDocument();
  });

  it("says nothing more of an administrator's AI agent", () => {
    const { container } = badge(recap, new Map([[recap.id, recap]]));
    expect(container).toHaveTextContent(/^\s*Agent$/);
  });
});
