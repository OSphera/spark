import { useState, type FormEvent } from "react";
import { AVATAR_TOO_LARGE, MAX_AVATAR_SIZE, MAX_USER_NAME_LENGTH, type RoomId, type SidebarRoom, type UserId } from "@ember/protocol";
import { botKeylessMessagesPath } from "@ember/protocol/bots";
import type { PersonalAgent, YourAgents as Yours } from "@ember/protocol/personal-agents";
import { useFlash } from "@/components/flash";
import { useMounted } from "@/hooks/use-mounted";
import { changeYourAgentPicture, deleteYourAgent, isSignedOut, makeYourAgent, placePersonalAgent, rekeyYourAgent, removeYourAgentPicture, renameYourAgent } from "@/lib/api";
import { avatarVariantOf } from "@/lib/previews";
import { dateTimeLabel } from "@/lib/messages";
import { BUTTON } from "./email-settings";
import { PictureField } from "./picture-picker";

// The Your agents section of your profile, while an administrator lets people have agents: the agents
// you've made, each a bot of yours that speaks under its own name through the bot API, shown everywhere
// as your agent. Each has its picture, which you can change and remove, as your avatar is, and its rooms, which are only rooms you're in, Rename, New key and Delete, and a
// form makes another. A key is shown once, as it's made, since Spark keeps only a digest of it. Making
// one or giving one a new key takes your password, as changing your email address does. Boxed as the AI
// apps section is. Rename, New key and Delete ask in the page, under the agent, never with the browser's
// prompt() or confirm(): some browsers show no dialogs, and there those buttons did nothing (#19).

/** What the section says of agents of your own. */
export const YOUR_AGENTS_EXPLAINED =
  "If you have an AI agent of your own, this is where you give it a name on Spark and get the key it signs in with. Make it below, then give the key to your agent. It posts under that name, shown everywhere as your agent, and only in rooms you're in, where you put it.";

/** The API detail, for whoever sets the agent up. */
export const YOUR_AGENTS_API = "For whoever sets the agent up: it sends its key as Authorization: Bearer in the bot API.";

/** Why the form asks for a password, and whose. */
export const WHOSE_PASSWORD = "Making an agent, or giving one a new key, asks for your own Spark password. Agents don't have passwords.";

/** What the section says once a key is made: it's shown this once. */
export const KEY_SHOWN_ONCE = "Copy this key now and give it to your agent. Spark keeps only a digest of it, so it can't show it again.";

/** What a row says of an agent's picture: the one chat bots start with, until its person gives it one. */
export const pictureSaid = (agent: PersonalAgent) => (agent.avatar ? "You gave it this picture." : "It has the picture agents start with. Choose another.");

/** What a row says of when an agent's key was last used. */
export const keyUsed = (usedAt: string | null) =>
  usedAt === null ? "Its key hasn't been used yet." : `Its key was last used ${dateTimeLabel(new Date(usedAt))}.`;

interface Props {
  /** Your agents and how many you may have, as your profile loaded them. */
  agents: Yours;
  /** Your rooms and DMs, as the sidebar's list has them, or null until it has loaded. */
  rooms: SidebarRoom[] | null;
  /** Whether you have a password, which making an agent and giving one a new key then ask for. */
  hasPassword: boolean;
  /** Says why something didn't work, as the workspace's alerts do. */
  onFailed: (error: unknown) => void;
}

/** Your agents, with what makes, renames, re-keys, deletes and places them, or nothing while you may have none. */
export function YourAgents({ agents: loaded, rooms, hasPassword, onFailed }: Props) {
  const [yours, setYours] = useState<Yours | null>(loaded);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  /** The key just made, for whose agent, until the page is left. */
  const [shownKey, setShownKey] = useState<{ agentId: UserId; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  /** What's being asked under an agent, in place of a browser dialog: a new name, or yes to a new key or to deleting it. */
  const [asking, setAsking] = useState<{ agentId: UserId; what: "rename" | "rekey" | "delete" } | null>(null);
  const [newName, setNewName] = useState("");
  const mounted = useMounted();
  const flash = useFlash();

  if (!yours) return null;

  /** Runs `change`, then shows the agent it answers in place of the one it had. */
  function run<T extends { agent?: PersonalAgent; key?: string }>(change: Promise<T>, then?: (answer: T) => void) {
    setBusy(true);
    change.then(
      (answer) => {
        if (!mounted.current) return;
        setBusy(false);
        const { agent, key } = answer;
        if (agent) setYours((now) => now && { ...now, agents: withAgent(now.agents, agent) });
        if (agent && key) setShownKey({ agentId: agent.id, key });
        then?.(answer);
      },
      (error: unknown) => {
        if (!mounted.current && !isSignedOut(error)) return;
        setBusy(false);
        onFailed(error);
      },
    );
  }

  const make = (event: FormEvent) => {
    event.preventDefault();
    run(makeYourAgent(name, password), () => {
      setName("");
      setPassword("");
    });
  };

  const ask = (agent: PersonalAgent, what: "rename" | "rekey" | "delete") => {
    if (what === "rename") setNewName(agent.name);
    setAsking({ agentId: agent.id, what });
  };

  const rename = (event: FormEvent, agent: PersonalAgent) => {
    event.preventDefault();
    const renamed = newName.trim();
    setAsking(null);
    if (renamed && renamed !== agent.name) run(renameYourAgent(agent.id, renamed));
  };

  /** Gives `agent` the picture `file`, once one is picked. */
  const choosePicture = (agent: PersonalAgent, file: File) => {
    if (file.size > MAX_AVATAR_SIZE) return flash("alert", AVATAR_TOO_LARGE);
    run(avatarVariantOf(file).then((variant) => changeYourAgentPicture(agent.id, { file, variant })));
  };

  const askRekey = (agent: PersonalAgent) => {
    if (hasPassword && !password) return flash("alert", "Enter your Spark password below to give an agent a new key.");
    ask(agent, "rekey");
  };

  const rekey = (agent: PersonalAgent) => {
    setAsking(null);
    run(rekeyYourAgent(agent.id, password), () => setPassword(""));
  };

  const remove = (agent: PersonalAgent) => {
    setAsking(null);
    run(
      deleteYourAgent(agent.id).then(() => ({})),
      () => setYours((now) => now && { ...now, agents: now.agents.filter((other) => other.id !== agent.id) }),
    );
  };

  const place = (agent: PersonalAgent, roomId: RoomId, placed: boolean) => run(placePersonalAgent(agent.id, roomId, placed));

  const sharedRooms = (rooms ?? []).filter((room) => room.kind !== "direct");
  const full = yours.agents.length >= yours.limit;

  return (
    <section aria-labelledby="your-agents-heading" className="flex flex-col gap-3 rounded-[10px] border bg-surface px-[2ch] py-4 max-md:px-3">
      <h2 id="your-agents-heading" className="text-base font-semibold">
        Your agents
      </h2>
      <p>{YOUR_AGENTS_EXPLAINED}</p>
      <p className="text-sm text-muted-foreground">{YOUR_AGENTS_API}</p>
      {yours.agents.length > 0 && (
        <ul className="flex flex-col gap-4">
          {yours.agents.map((agent) => {
            const inRooms = new Set(agent.rooms.map((room) => room.id));
            const addable = sharedRooms.filter((room) => !inRooms.has(room.id));
            return (
              <li key={agent.id} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <PictureField
                      id={`agent-picture-${agent.id}`}
                      src={agent.avatarUrl}
                      alt={`${agent.name}'s picture`}
                      label={`Choose a picture for ${agent.name}`}
                      size="small"
                      disabled={busy}
                      onChoose={(file) => choosePicture(agent, file)}
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className="font-semibold wrap-anywhere">{agent.name}</span>
                      <span id={`agent-picture-${agent.id}-description`} className="text-sm text-muted-foreground">
                        {pictureSaid(agent)}
                      </span>
                      <span className="text-sm text-muted-foreground">{keyUsed(agent.usedAt)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {agent.avatar && (
                      <button type="button" disabled={busy} onClick={() => run(removeYourAgentPicture(agent.id))} className={BUTTON}>
                        Remove picture
                      </button>
                    )}
                    <button type="button" disabled={busy} onClick={() => ask(agent, "rename")} className={BUTTON}>
                      Rename
                    </button>
                    <button type="button" disabled={busy} onClick={() => askRekey(agent)} className={BUTTON}>
                      New key
                    </button>
                    <button type="button" disabled={busy} onClick={() => ask(agent, "delete")} className={BUTTON}>
                      Delete
                    </button>
                  </div>
                </div>
                {asking?.agentId === agent.id && asking.what === "rename" && (
                  <form onSubmit={(event) => rename(event, agent)} className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      required
                      autoFocus
                      maxLength={MAX_USER_NAME_LENGTH}
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      aria-label={`New name for ${agent.name}`}
                      className="min-h-11 min-w-0 flex-1 rounded-[9px] border bg-background px-[0.8em]"
                    />
                    <button type="submit" disabled={busy} className={BUTTON}>
                      Save name
                    </button>
                    <button type="button" onClick={() => setAsking(null)} className={BUTTON}>
                      Cancel
                    </button>
                  </form>
                )}
                {asking?.agentId === agent.id && asking.what !== "rename" && (
                  <div role="group" aria-label={asking.what === "rekey" ? `Give ${agent.name} a new key?` : `Delete ${agent.name}?`} className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">
                      {asking.what === "rekey"
                        ? `Give ${agent.name} a new key? Its key now stops working at once.`
                        : `Delete ${agent.name}? It leaves its rooms and its key stops working. What it said stays.`}
                    </span>
                    <button type="button" disabled={busy} onClick={() => (asking.what === "rekey" ? rekey(agent) : remove(agent))} className={BUTTON}>
                      {asking.what === "rekey" ? "Give it a new key" : `Delete ${agent.name}`}
                    </button>
                    <button type="button" onClick={() => setAsking(null)} className={BUTTON}>
                      Cancel
                    </button>
                  </div>
                )}
                {shownKey?.agentId === agent.id && (
                  <div className="flex flex-col gap-1">
                    <input
                      type="text"
                      readOnly
                      value={shownKey.key}
                      aria-label={`${agent.name}'s key`}
                      onFocus={(event) => event.currentTarget.select()}
                      className="min-h-[42px] w-full min-w-0 rounded-[9px] border bg-background px-[0.8em] py-[0.5em] font-mono text-sm"
                    />
                    <span className="text-sm text-muted-foreground">
                      {KEY_SHOWN_ONCE} It posts to a room at <code>{botKeylessMessagesPath("<room id>")}</code>.
                    </span>
                  </div>
                )}
                <ul aria-label={`${agent.name}'s rooms`} className="flex flex-wrap gap-2">
                  {agent.rooms.map((room) => (
                    <li key={room.id} className="flex items-center gap-1 rounded-full border bg-background py-0.5 ps-3 pe-1 text-sm">
                      <span className="wrap-anywhere">{room.name}</span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => place(agent, room.id, false)}
                        aria-label={`Take ${agent.name} out of ${room.name}`}
                        className="rounded-full px-2 hover:bg-hover disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                {addable.length > 0 && (
                  <select
                    aria-label={`Put ${agent.name} in a room`}
                    disabled={busy}
                    value=""
                    onChange={(event) => event.target.value && place(agent, event.target.value, true)}
                    className="min-h-11 w-fit max-w-full rounded-[9px] border bg-background px-3"
                  >
                    <option value="">Put it in a room…</option>
                    {addable.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={make} className="flex flex-col gap-2">
        {hasPassword && <p className="text-sm text-muted-foreground">{WHOSE_PASSWORD}</p>}
        <p className="text-sm text-muted-foreground">
          {full ? `You have as many agents as you can, ${yours.limit}.` : `You can have ${yours.limit} agent${yours.limit === 1 ? "" : "s"}.`}
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            required
            maxLength={MAX_USER_NAME_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Agent's name"
            aria-label="New agent's name"
            className="min-h-11 min-w-0 flex-1 rounded-[9px] border bg-background px-[0.8em]"
          />
          {hasPassword && (
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your Spark password"
              aria-label="Your Spark password, to make an agent or give one a new key"
              className="min-h-11 min-w-0 flex-1 rounded-[9px] border bg-background px-[0.8em]"
            />
          )}
          <button type="submit" disabled={busy || full} className={BUTTON}>
            Make agent
          </button>
        </div>
      </form>
    </section>
  );
}

/** `agents` with `agent` in place of the one with its id, or added, by name. */
function withAgent(agents: PersonalAgent[], agent: PersonalAgent): PersonalAgent[] {
  const others = agents.filter((other) => other.id !== agent.id);
  return [...others, agent].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id));
}
