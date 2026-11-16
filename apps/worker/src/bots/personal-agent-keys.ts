import type { UserId } from "@ember/protocol";
import { toBase64url } from "../encoding";
import { hmacKey } from "../hmac";
import { alphanumeric } from "../ids";

// Personal agents' keys. A key has the shape every bot's has, `<agent id>-<token>`, so the bot API reads it
// as it reads any (keys.ts), but its token is longer than a chat bot's, and Ember keeps only its digest,
// so a copy of the database opens nothing and the key is shown once, when it's made.

/** A personal agent's token: 40 random letters and digits. */
export const newAgentToken = () => alphanumeric(40);

const encoder = new TextEncoder();

/**
 * What the Workspace keeps in place of agent `agentId`'s token: its HMAC under SESSION_SECRET, as a
 * session's is kept (auth.ts `tokenDigest`), with the agent's id in it, so a digest is no other agent's.
 * Changing the secret stops every personal agent's key, as it signs everyone out.
 */
export async function agentKeyDigest(agentId: UserId, token: string, secret: string): Promise<string> {
  if (!secret) throw new Error("SESSION_SECRET isn't set. `pnpm dev` and `pnpm run deploy` set it.");
  const signed = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(`personal-agent:${agentId}:${token}`));
  return toBase64url(new Uint8Array(signed));
}

/** How long a key's use is recorded for before it's written again: the profile says when it was last used to within this. */
export const KEY_USE_RECORDED_MS = 10 * 60_000;
