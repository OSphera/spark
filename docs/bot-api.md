# Bot API

A bot posts to the rooms it's in, reads them, and edits, deletes and boosts its own messages with the
bot's key. The Agents page shows the key of a bot an administrator made; a person's own agent's key
is shown once, on their profile under Your agents, when the agent is made or given a new key
([People's agents](self-hosting.md#peoples-agents)). The key goes in an `Authorization` header, at an
address with no key in it, so a request log has nothing to record:

```sh
curl -H 'Authorization: Bearer <bot key>' -d 'Hello!' https://<your Worker>/bot/rooms/<room id>/messages
curl -H 'Authorization: Bearer <bot key>' -F "attachment=@/path/to/file" https://<your Worker>/bot/rooms/<room id>/messages
```

| Request | Does |
| --- | --- |
| `POST /bot/rooms/<room id>/messages` | Posts the body, or the file a form sends as `attachment`. With `?thread=<message id>` it posts in that message's thread. |
| `GET /bot/rooms/<room id>/messages` | Reads a page of the room's messages as JSON, oldest first, with `?before`, `?after`, or `?thread=<message id>` to read a thread. |
| `PUT` or `PATCH /bot/rooms/<room id>/messages/<message id>` | Replaces the text, or the file, of the bot's own message. |
| `DELETE /bot/rooms/<room id>/messages/<message id>` | Deletes the bot's own message. |
| `POST /bot/rooms/<room id>/messages/<message id>/boosts` | Boosts a message with the body. |
| `DELETE /bot/rooms/<room id>/messages/<message id>/boosts/<boost id>` | Removes the bot's own boost. |
| `GET /bot/rooms` | Lists the rooms the bot is in, DMs too, as a JSON array of `{ "id", "name", "kind" }`, `kind` being `open`, `closed` or `direct`, and a DM's `name` null. |

A room is named by its id, the last part of its address in the app, which `GET /bot/rooms` lists, not
by its name. `?before` and `?after` take a message's id, and answer 404 when the room no longer has
that message, as when it was deleted: a bot that reads on from the last message it saw then reads the
newest page instead, and keeps what's later than the id it had.

The addresses are under `/bot` because `/rooms/<room id>/messages` is the app's. The key can also be in the address, as Campfire's bot API takes it, and that keeps working for bots
already written that way: `/rooms/<room id>/<bot key>/messages`, and the same under it for the rest. A
request with a key in the address and an `Authorization` header that name different keys is refused
with 400. A missing or wrong key answers 401 `Unknown bot key` either way, and an empty 404 when the bot
isn't in the room.

`GET /bot/rooms` takes the key only in the `Authorization` header, and only the bot's own: the key a
webhook's delivery gives the bot opens one room, so it lists none. The JSON of a message's `creator`,
and of a boost's `booster`, carries an `owner`, `{ "id", "name" }`, when they're a person's own agent
([People's agents](self-hosting.md#peoples-agents)), by that person's name now.

The [Slack-compatible webhook](slack-webhooks.md), `/rooms/<room id>/<bot key>/slack`, keeps its key in the
address, since the tools that post to Slack are only given an address. Ember's logs show a key in an
address as `[FILTERED]`, but Workers Logs record the address before that, so see
[the security notes](self-hosting.md#security-notes) for keeping them out of a log.
