import { useCallback, useContext } from "react";
import { ASSISTANT_ID, type DirectoryUser, type Room, type User } from "@ember/protocol";
import { ownersAgent } from "@ember/protocol/personal-agents";
import { Badge } from "@/components/ui/badge";
import { PeopleContext } from "@/hooks/use-directory";
import { cn } from "@/lib/utils";

/**
 * Whether someone is an agent, @ember, an AI agent an administrator made or a personal agent, as the
 * people directory lists them, or @ember before it lists anyone. A deleted agent stays one, as what it
 * said stays.
 */
export const isAgent = (user: User & Pick<DirectoryUser, "agent">) => user.agent === true || user.id === ASSISTANT_ID;

/** Whether someone is an AI agent, as the people directory lists them now. */
export function useIsAgent(): (user: User) => boolean {
  const people = useContext(PeopleContext);
  return useCallback((user: User) => isAgent(people.get(user.id) ?? user), [people]);
}

/** The agent a room is someone's DM with alone, which is named after it, so its name takes the badge too, or undefined for any other room. */
export function useAgentWith(): (room: Room) => User | undefined {
  const isAgentNow = useIsAgent();
  return useCallback((room: Room) => (room.kind === "direct" && room.members.length === 2 ? room.members.find(isAgentNow) : undefined), [isAgentNow]);
}

/** Whether a room is someone's DM with an agent alone (`useAgentWith`). */
export function useIsWithAgent(): (room: Room) => boolean {
  const agentWith = useAgentWith();
  return useCallback((room: Room) => agentWith(room) !== undefined, [agentWith]);
}

/**
 * The badge after an agent's name, so nobody takes it for a person: "Agent" in capitals at 10px on a
 * pill of the ink at 8%, which stays in sight on a hovered or picked row too. It's written as a word
 * after a space, so that screen readers say the name and it as two words, though a row of flex items
 * doesn't show the space. For a personal agent, `agent`, it's followed by whose it is, "Pete's agent", by
 * their name as the people directory lists it now, in the muted ink. The mentions prompt draws both from
 * its own markup (`.autocompletable__badge` and `__owner` in rich-text-editor.css).
 */
export function AgentBadge({ agent, className }: { agent?: User; className?: string }) {
  const people = useContext(PeopleContext);
  const ownerId = agent && people.get(agent.id)?.ownerId;
  const owner = ownerId === undefined ? undefined : people.get(ownerId);
  return (
    <>
      {" "}
      <Badge
        variant="secondary"
        className={cn("bg-foreground/8 px-1.5 py-0 text-[10px] leading-4 font-semibold tracking-wider text-message-muted uppercase", className)}
      >
        Agent
      </Badge>
      {owner && (
        <>
          {" "}
          <span className="shrink-0 text-xs whitespace-nowrap text-message-muted">{ownersAgent(owner.name)}</span>
        </>
      )}
    </>
  );
}
