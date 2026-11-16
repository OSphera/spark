import { CURRENT_PASSWORD_WRONG, isPasswordTooLong, isRoomId, SIGN_IN_LIMITED, type RoomId, type UserId } from "@ember/protocol";
import { NAME_TAKEN } from "@ember/protocol/agents";
import {
  AGENT_NOT_WITH_OWNER,
  AGENT_PASSWORD_NEEDED,
  currentPasswordOf,
  GUESTS_HAVE_NO_AGENTS,
  parseNewPersonalAgent,
  parsePersonalAgentLimit,
  parsePersonalAgentName,
  PERSONAL_AGENTS_FORBIDDEN,
  PERSONAL_AGENTS_OFF,
  personalAgentsFull,
  type EveryonesAgents,
  type PersonalAgentAnswer,
  type PersonalAgentLimit,
  type YourAgents,
} from "@ember/protocol/personal-agents";
import { credentialsOf } from "../auth";
import { storeAvatar } from "../avatars";
import { jsonBodyOf } from "../bodies";
import type { Env } from "../env";
import { pictureFormOf } from "../files/pictures";
import { NO_STORAGE } from "../files/uploads";
import { passwordHasher } from "../passwords";
import { workspace, type Credentials } from "../workspace";
import { bearerKey, botKeyParts } from "./keys";

// Personal agents, as their people make and manage them on their profile, at /api/users/me/agents, and
// as administrators see everyone's and turn them off, at /api/account/personal_agents. A personal agent
// is a bot with a recorded owner; it speaks through the bot API with its key (api.ts). Each answers JSON
// for the app's pages. Its key is in an answer only as it's made or given anew, since nothing keeps it.

const problem = (status: number, message: string) => Response.json({ error: message }, { status });

const NOT_SIGNED_IN = "Not signed in";
/** Keys are secrets, which no cache should keep, and the lists are someone's own. */
const PRIVATE = { "Cache-Control": "no-store" };

/** What a refusal common to these answers, or null for none. */
function refusal(answer: "forbidden" | "not found" | "off" | "full" | "name taken" | "password needed" | "not with owner" | null, limit = 0): Response | null {
  if (answer === null) return problem(401, NOT_SIGNED_IN);
  if (answer === "forbidden") return problem(403, GUESTS_HAVE_NO_AGENTS);
  if (answer === "not found") return problem(404, "Not found");
  if (answer === "off") return problem(403, PERSONAL_AGENTS_OFF);
  if (answer === "full") return problem(409, personalAgentsFull(limit));
  if (answer === "name taken") return problem(422, NAME_TAKEN);
  if (answer === "password needed") return problem(422, AGENT_PASSWORD_NEEDED);
  return problem(422, AGENT_NOT_WITH_OWNER);
}

/** `GET /api/users/me/agents`: your agents, by name, and how many you may have. */
export async function listYourAgents(request: Request, env: Env): Promise<Response> {
  const credentials = await credentialsOf(request, env);
  const yours = credentials && (await workspace(env).yourAgents(credentials));
  if (!yours || yours === "forbidden") return refusal(yours)!;
  return Response.json(yours satisfies YourAgents, { headers: PRIVATE });
}

/**
 * Checks the current password `given`, as making an agent or giving one a new key takes it while you have
 * one, as changing your email address does: so that holding your session isn't enough to make a key that
 * speaks for you. It counts against sign-in's limit (429). Answers the digest it checked, which the
 * Workspace checks again as it saves, null for someone without a password, or what to answer instead.
 */
async function checkedPassword(request: Request, env: Env, credentials: Credentials, given: string | undefined): Promise<string | null | Response> {
  const check = await workspace(env).agentPasswordCheck(credentials, request.headers.get("CF-Connecting-IP") ?? "unknown");
  if (!check || check === "forbidden") return refusal(check)!;
  if (check === "limited") return problem(429, SIGN_IN_LIMITED);
  if (check.passwordDigest === null) return null;
  if (!given) return problem(422, AGENT_PASSWORD_NEEDED);
  // One longer than the form takes is nobody's, as at sign-in.
  if (isPasswordTooLong(given) || !(await passwordHasher(env).verify(given, check.passwordDigest)).matches) return problem(422, CURRENT_PASSWORD_WRONG);
  return check.passwordDigest;
}

/**
 * `POST /api/users/me/agents`, `{ name, currentPassword }`: makes an agent of your own, answering 201
 * with it and its key, which is shown this once. 401 without a session, 403 for a guest or while the
 * limit is 0, 409 once you have as many as it lets you, 422 for a name someone has, or a password that's
 * missing or wrong, and 429 past sign-in's limit.
 */
export async function createYourAgent(request: Request, env: Env): Promise<Response> {
  const credentials = await credentialsOf(request, env);
  if (!credentials) return problem(401, NOT_SIGNED_IN);
  const agent = parseNewPersonalAgent(await jsonBodyOf(request));
  if (typeof agent === "string") return problem(422, agent);
  const checked = await checkedPassword(request, env, credentials, agent.currentPassword);
  if (checked instanceof Response) return checked;
  const created = await workspace(env).createPersonalAgent(credentials, agent.name, checked);
  if (!created || typeof created === "string") return refusal(created, created === "full" ? await limitFor(env, credentials) : 0)!;
  return Response.json(created satisfies PersonalAgentAnswer, { status: 201, headers: PRIVATE });
}

/** How many agents the person `credentials` signs in may have, for what refusing another says. */
async function limitFor(env: Env, credentials: Credentials): Promise<number> {
  const yours = await workspace(env).yourAgents(credentials);
  return yours && yours !== "forbidden" ? yours.limit : 0;
}

/** `PATCH /api/users/me/agents/:id`, `{ name }`: renames an agent of yours, answering it. */
export async function renameYourAgent(request: Request, env: Env, agentId: UserId): Promise<Response> {
  const credentials = await credentialsOf(request, env);
  if (!credentials) return problem(401, NOT_SIGNED_IN);
  const named = parsePersonalAgentName(await jsonBodyOf(request));
  if (typeof named === "string") return problem(422, named);
  const renamed = await workspace(env).renamePersonalAgent(credentials, agentId, named.name);
  if (!renamed || typeof renamed === "string") return refusal(renamed)!;
  return Response.json(renamed satisfies PersonalAgentAnswer, { headers: PRIVATE });
}

/**
 * `PUT /api/users/me/agents/:id/key`, `{ currentPassword }`: gives an agent of yours a new key, answering
 * it with the key, shown this once. The old key stops working at once.
 */
export async function rekeyYourAgent(request: Request, env: Env, agentId: UserId): Promise<Response> {
  const credentials = await credentialsOf(request, env);
  if (!credentials) return problem(401, NOT_SIGNED_IN);
  const password = currentPasswordOf(await jsonBodyOf(request));
  if (typeof password === "object") return problem(422, password.error);
  const checked = await checkedPassword(request, env, credentials, password);
  if (checked instanceof Response) return checked;
  const rekeyed = await workspace(env).rekeyPersonalAgent(credentials, agentId, checked);
  if (!rekeyed || typeof rekeyed === "string") return refusal(rekeyed)!;
  return Response.json(rekeyed satisfies PersonalAgentAnswer, { headers: PRIVATE });
}

/** `DELETE /api/users/me/agents/:id`: deletes an agent of yours, which turns it off for good, answering 204. Its messages stay. */
export async function deleteYourAgent(request: Request, env: Env, agentId: UserId): Promise<Response> {
  const credentials = await credentialsOf(request, env);
  const off = credentials && (await workspace(env).turnOffPersonalAgent(credentials, agentId, "owner"));
  return off === "off" ? new Response(null, { status: 204 }) : refusal(off)!;
}

/**
 * `PUT /api/users/me/agents/:id/avatar` gives an agent of yours the picture the form brings, as your own
 * avatar's does (`avatar` and `variant`), answering the agent. It takes no password, as renaming doesn't.
 * Who's asking is checked before the picture is read: 404 for an agent that isn't yours, or is off,
 * administrators' too, and 403 for a guest.
 */
export async function changeYourAgentPicture(request: Request, env: Env, agentId: UserId): Promise<Response> {
  const credentials = await credentialsOf(request, env);
  if (!credentials) return problem(401, NOT_SIGNED_IN);
  const may = await workspace(env).mayPicturePersonalAgent(credentials, agentId);
  if (may !== "ok") return refusal(may)!;
  if (!env.FILES) return problem(503, NO_STORAGE);
  const form = await pictureFormOf(request);
  if (!(form instanceof FormData)) return problem(form.status, form.error);
  const picture = await storeAvatar(env, env.FILES, form);
  if ("error" in picture) return problem(picture.status, picture.error);
  return pictureAnswer(await workspace(env).changePersonalAgentPicture(credentials, agentId, picture));
}

/** `DELETE /api/users/me/agents/:id/avatar` takes away the picture of an agent of yours, which brings back the one chat bots start with, answering the agent. */
export async function removeYourAgentPicture(request: Request, env: Env, agentId: UserId): Promise<Response> {
  const credentials = await credentialsOf(request, env);
  return pictureAnswer(credentials && (await workspace(env).changePersonalAgentPicture(credentials, agentId, null)));
}

function pictureAnswer(changed: PersonalAgentAnswer | "not found" | "forbidden" | null): Response {
  if (!changed || typeof changed === "string") return refusal(changed)!;
  return Response.json(changed satisfies PersonalAgentAnswer, { headers: PRIVATE });
}

/**
 * `PUT /api/personal_agents/:id/rooms/:room id` puts a personal agent in a room, and `DELETE` takes it
 * out, as its person or an administrator asks, who has to be in the room, answering the agent. It goes
 * only in a room its person is in, and never in a DM (422).
 */
export async function placeAgent(request: Request, env: Env, agentId: UserId, roomId: RoomId): Promise<Response> {
  const credentials = await credentialsOf(request, env);
  if (!credentials) return problem(401, NOT_SIGNED_IN);
  if (!isRoomId(roomId)) return problem(404, "Not found");
  const placed = await workspace(env).placePersonalAgent(credentials, agentId, roomId, request.method === "PUT");
  if (!placed || typeof placed === "string") return refusal(placed)!;
  return Response.json(placed satisfies PersonalAgentAnswer, { headers: PRIVATE });
}

/** `GET /api/account/personal_agents`: everyone's active personal agents and the limit, for administrators. */
export async function listEveryonesAgents(request: Request, env: Env): Promise<Response> {
  const credentials = await credentialsOf(request, env);
  const everyone = credentials && (await workspace(env).everyonesAgents(credentials));
  if (!everyone) return problem(401, NOT_SIGNED_IN);
  if (everyone === "forbidden") return problem(403, PERSONAL_AGENTS_FORBIDDEN);
  return Response.json(everyone satisfies EveryonesAgents, { headers: PRIVATE });
}

/** `PATCH /api/account/personal_agents`, `{ limit }`: sets how many agents each person may have, from 0, which is off. */
export async function setAgentLimit(request: Request, env: Env): Promise<Response> {
  const credentials = await credentialsOf(request, env);
  if (!credentials) return problem(401, NOT_SIGNED_IN);
  const administrator = await workspace(env).canAdminister(credentials);
  if (administrator === null) return problem(401, NOT_SIGNED_IN);
  if (!administrator) return problem(403, PERSONAL_AGENTS_FORBIDDEN);
  const limit = parsePersonalAgentLimit(await jsonBodyOf(request));
  if (typeof limit === "string") return problem(422, limit);
  const set = await workspace(env).setPersonalAgentLimit(credentials, limit.limit);
  if (!set) return problem(401, NOT_SIGNED_IN);
  if (set === "forbidden") return problem(403, PERSONAL_AGENTS_FORBIDDEN);
  return Response.json(set satisfies PersonalAgentLimit, { headers: PRIVATE });
}

/** `DELETE /api/account/personal_agents/:id`: turns off anyone's personal agent, as an administrator, answering 204. */
export async function turnOffAgent(request: Request, env: Env, agentId: UserId): Promise<Response> {
  const credentials = await credentialsOf(request, env);
  const off = credentials && (await workspace(env).turnOffPersonalAgent(credentials, agentId, "administrator"));
  if (off === "forbidden") return problem(403, PERSONAL_AGENTS_FORBIDDEN);
  return off === "off" ? new Response(null, { status: 204 }) : refusal(off)!;
}

/**
 * `GET /bot/rooms`, with a bot's key as `Authorization: Bearer`: the rooms the bot is in, DMs too, each
 * with its id, its name, null for a DM's, and its kind, as JSON, for any bot. 401 for a key that names no
 * active bot, or is a webhook's, which opens only the room it was given for.
 */
export async function listBotRooms(request: Request, env: Env): Promise<Response> {
  const parts = botKeyParts(bearerKey(request) ?? "");
  const rooms = parts && (await workspace(env).botRooms(parts.botId, parts.token));
  if (!rooms) return Response.json({ error: "Unknown bot key" }, { status: 401 });
  return Response.json(rooms, { headers: PRIVATE });
}
