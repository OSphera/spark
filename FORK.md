# This fork

This is Peter Kaminski's fork of [Ember](https://github.com/NYLLON-SOFTWARE/ember-cloudflare), forked on 2026-11-15 from Ember 0.5 beta 4. Ember is NYLLON's work, and the credit for it is theirs. This page says what this fork changes and why, and what it would change next.

To deploy Ember, use upstream's Deploy to Cloudflare button. This fork is where we try changes, and those that work may be offered upstream.

## What we care about

We read Ember with one question: how well does it serve a small group whose members each work through an AI agent of their own, and who may one day want to leave, or to talk with other groups? Ember's agent surface is careful work. Calls to outside tools wait for a person's approval on a card everyone in the room can see, a tool whose server changes its description is set aside, and an AI app that connects as a person sees only what that person sees. The changes below build on that.

## Changed in this fork

Each is an issue in this repository, closed by the pull request that made the change.

1. **A message an AI app sends says so.** Upstream posts what a connected AI app sends as the person's own message, with nothing to tell the two apart. Here the message records which app sent it, and everyone in the room sees "via" and the app's name beside it. People should know when they are reading an agent's words.
2. **A bot can keep its key out of the address.** Upstream's bot API carries the bot's key in the path, where request logs record it. Here the same calls also take the key as `Authorization: Bearer`. The Slack-compatible webhook address is unchanged, since Slack's senders can only be given an address.
3. **Anyone can take a copy of a room they're in.** Upstream has no export on its default storage. Here a member can download a room's messages, their own direct messages included, as JSON Lines. It gives each person their own record; an administrator's export of everything is a different decision, with privacy questions of its own, and isn't part of this.
4. **An AI app can ask what's new.** Upstream's `read_room` reads backwards from the newest message. Here it also reads forwards from a message the app has already seen, so an agent that checks in from time to time asks for only what it hasn't read.

## What we'd change next

Not filed as issues yet. The first three are small enough to build; the rest need a design first.

- **Say when an administrator signs in as someone.** An administrator can make a sign-in link for any member. The person should be told when one is used, and the workspace should keep a list.
- **File addresses that can end.** A file's signed address works until its message is deleted. A setting for addresses that expire would suit groups that share sensitive files.
- **Tell a connected app when something arrives.** Reading forwards makes polling cheap; a notification would remove the polling.
- **Let agents answer one another, safely.** Upstream's agents never answer a bot, which stops loops and also stops two agents from working something out between them. A turn limit and a visible hand-off could allow it.
- **Messages signed by their author.** Today a message is a row that the server vouches for. A signature from the author's own key would let a message be checked after it leaves the server, and would let an identity outlast one deployment.
- **A way to talk between Embers.** Upstream marks shared channels as something it doesn't do. Signed messages and an export format are the groundwork for it.
- **Run somewhere other than Cloudflare.** Ember depends on Workers, Durable Objects and R2. An export that another system can read is the first step toward not depending on one provider.

## Keeping up with upstream

`main` here follows upstream's `main`, with this fork's changes merged on top. `upstream` is the remote for `NYLLON-SOFTWARE/ember-cloudflare`. Upstream's workflows only run in upstream's repository, so checks here are run by hand: `pnpm typecheck && pnpm test && pnpm build`.

---
*Drafted by AI (Claude Code, Fable 5.2) under the direction of Peter Kaminski, who takes responsibility for its content.*
