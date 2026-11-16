import { useContext, useEffect, useState, type FormEvent } from "react";
import { MAX_PERSONAL_AGENTS, ownersAgent, type EveryonesAgents, type PersonalAgent } from "@ember/protocol/personal-agents";
import { useFlash } from "@/components/flash";
import { PeopleContext } from "@/hooks/use-directory";
import { useMounted } from "@/hooks/use-mounted";
import { fetchEveryonesAgents, isSignedOut, setPersonalAgentLimit, turnOffPersonalAgent } from "@/lib/api";
import { BUTTON } from "./email-settings";
import { SECTION_HEADING } from "./settings-page";
import { AvatarLink } from "./user-avatar";

// People's agents, under the chat bots on their page: how many agents of their own each person may make
// on their profile, 0 for none, as every Ember starts, and everyone's agents that are on, each shown as
// its person's, with its rooms and Turn off, which an administrator can do to anyone's.

/** What the section says of people's agents. */
export const PEOPLE_AGENTS_EXPLAINED =
  "Let people make agents of their own on their profile, up to a number each. An agent posts under its own name, shown as its person's, and is only ever in rooms its person is in. Removing or banning someone turns their agents off.";

/** What's said once `name` is turned off. */
export const turnedOffNotice = (name: string) => `${name} is off. Its key no longer works.`;

/** The limit and everyone's agents, with Save and Turn off. */
export function PersonalAgentsSettings({ onFailed }: { onFailed: (error: unknown) => void }) {
  const [everyone, setEveryone] = useState<EveryonesAgents | null>(null);
  const [limit, setLimit] = useState("0");
  const [busy, setBusy] = useState(false);
  const people = useContext(PeopleContext);
  const mounted = useMounted();
  const flash = useFlash();

  useEffect(() => {
    let stopped = false;
    fetchEveryonesAgents().then(
      (answer) => {
        if (stopped) return;
        setEveryone(answer);
        setLimit(String(answer.limit));
      },
      (error: unknown) => {
        if (!stopped || isSignedOut(error)) onFailed(error);
      },
    );
    return () => void (stopped = true);
  }, [onFailed]);

  function run(change: Promise<unknown>, then: () => void) {
    setBusy(true);
    change.then(
      () => {
        if (!mounted.current) return;
        setBusy(false);
        then();
      },
      (error: unknown) => {
        if (!mounted.current && !isSignedOut(error)) return;
        setBusy(false);
        onFailed(error);
      },
    );
  }

  const save = (event: FormEvent) => {
    event.preventDefault();
    const set = Number(limit);
    run(setPersonalAgentLimit(set), () => {
      setEveryone((now) => now && { ...now, limit: set });
      flash("notice", "✓");
    });
  };

  const turnOff = (agent: PersonalAgent) => {
    if (!confirm(`Turn off ${agent.name}? It leaves its rooms and its key stops working. What it said stays.`)) return;
    run(turnOffPersonalAgent(agent.id), () => {
      setEveryone((now) => now && { ...now, agents: now.agents.filter((other) => other.id !== agent.id) });
      flash("notice", turnedOffNotice(agent.name));
    });
  };

  const agents = (everyone?.agents ?? []).filter((agent) => people.get(agent.id)?.status !== "deactivated");
  return (
    <section aria-labelledby="people-agents-heading" aria-busy={everyone === null} className="flex flex-col gap-4">
      <header className={SECTION_HEADING}>
        <h2 id="people-agents-heading" className="text-[17px] font-semibold">
          People's agents
        </h2>
        <p className="mt-1.5 max-w-prose text-muted-foreground">{PEOPLE_AGENTS_EXPLAINED}</p>
      </header>
      <form onSubmit={save} className="flex flex-wrap items-center gap-2">
        <label htmlFor="people-agents-limit">Agents each person may have</label>
        <input
          id="people-agents-limit"
          type="number"
          min={0}
          max={MAX_PERSONAL_AGENTS}
          step={1}
          required
          value={limit}
          disabled={everyone === null}
          onChange={(event) => setLimit(event.target.value)}
          className="min-h-11 w-20 rounded-[9px] border bg-background px-[0.8em]"
        />
        <button type="submit" disabled={busy || everyone === null} className={BUTTON}>
          Save
        </button>
      </form>
      {agents.length > 0 && (
        <ul className="flex flex-col gap-3">
          {agents.map((agent) => {
            const owner = people.get(agent.ownerId);
            return (
              <li key={agent.id} className="flex flex-wrap items-center gap-x-[1ch] gap-y-2 rounded-[10px] border bg-surface px-[2ch] py-3">
                <AvatarLink user={agent} lazy className="size-[2.25em]" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="wrap-anywhere">
                    <strong>{people.get(agent.id)?.name ?? agent.name}</strong>
                    {owner && <span className="ms-[1ch] text-sm text-message-muted">{ownersAgent(owner.name)}</span>}
                  </span>
                  <span className="text-sm text-muted-foreground wrap-anywhere">
                    {agent.rooms.length === 0 ? "In no rooms." : `In ${agent.rooms.map((room) => room.name).join(", ")}.`}
                  </span>
                </div>
                <button type="button" disabled={busy} onClick={() => turnOff(agent)} aria-label={`Turn off ${agent.name}`} className={BUTTON}>
                  Turn off
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
