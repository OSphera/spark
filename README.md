# Spark

Spark is a group chat for small circles, run on your own Cloudflare account. It grew out of [Ember](https://github.com/NYLLON-SOFTWARE/ember-cloudflare), and it is a fork that goes its own way: we change it quickly, in directions Ember may not want, so it carries its own name, its own [releases](https://github.com/OSphera/spark/releases) and its own version numbers, starting at 1.0.0. What we try here shouldn't be taken for Ember's work, or reflect on it.

Spark picks the changes it wants from Ember, rather than following its releases: [docs/upstream.md](docs/upstream.md) says how, and logs each one.

## Where the name stands

Spark says Spark at the front door (the page title, the sign-in, join and setup pages, emails and the installable app), in its icon, in its version and update notices, and on its Agents page. Some settings and messages, the guides under `docs/` and the source's own names still say Ember. Read "Ember" in those places as "this software"; saying Spark everywhere is [#12](https://github.com/OSphera/spark/issues/12).

## What it does today

- **Rooms, private rooms and direct messages**, with threads, mentions, `#` links to rooms, quotes, and editing or deleting what you wrote.
- **Reactions**: 👍 ❤️ 🙂 one tap away, a tray of more, and any emoji you like.
- **Writing**: drafts, messages scheduled for later, short voice and video clips, and `/` commands. Someone's messages close together show under their name once, two minutes apart unless an administrator chooses otherwise.
- **Unread and activity**: unread rooms stand out, with a count of the mentions waiting, and each room's bell says whether you hear about every message, only mentions, or nothing. Pause notifications for a while when you need quiet. You see who's here and who's typing.
- **Files, pictures and video** shared in a room and shown inline.
- **Search** across every message in your rooms and direct messages, narrowed to a room, a person, links, files or threads.
- **On your phone**: add it to your home screen, turn on push notifications, and sign in by scanning the QR code on your profile.
- **Huddles**, voice and video in a room, if you turn them on.
- **Agents**: an agent posts through an incoming webhook or the bot API, and a member can have agents of their own, shown as theirs.
- **Yours to shape**: your community's name, logo and tagline, room icons, custom CSS and your own domain. You choose who gets in: a join link, invitations by email, an email domain, or everyone.

Spark 1.0.0 took out Ember's built-in AI assistant and AI agents, connected apps and outside AI, and signing in through Memberful or single sign-on. The left rail shows which version you're running.

## Why run your own

**Own your conversations.** Messages live in Durable Objects, and files in an R2 bucket, in your Cloudflare account. Nobody else hosts your circle's chat, and the code is yours to read, change and run.

**Keep every message.** Nothing ages out. Spark keeps every message and file for as long as you do.

**Nothing to look after.** No servers, containers or databases to patch. Quiet rooms hibernate, so an idle community uses next to nothing.

## What it costs

Spark is free. Cloudflare runs it, at its own prices. The figures below are Ember's, as its README gave them in November 2026:

| | What you pay Cloudflare |
|---|---|
| **A small group** | $0 on the [Workers Free](https://developers.cloudflare.com/workers/platform/pricing/) plan. By Ember's measurements it carries about 100 people a day sending 30 messages each. |
| **A growing group** | $5 a month on Workers Paid, for the whole account. It includes 50 million database rows written a month, where Free allows 100,000 a day, and bills any use past its allowances. |
| **Files** | 10 GB in [R2](https://developers.cloudflare.com/r2/pricing/) free, then $0.015 per GB a month, with nothing to pay for downloads. |
| **Email, if you want it** | Free with [Resend](https://resend.com), up to 3,000 emails a month and 100 a day, or 3,000 a month included with Workers Paid through Cloudflare Email Service. |
| **Huddles, if you turn them on** | Free for the first 1,000 GB a month that Cloudflare's [Realtime SFU](https://developers.cloudflare.com/realtime/sfu/pricing/) sends, then $0.05 per GB. |
| **Your own domain, if you want one** | Whatever your registrar charges. |

The free plan's allowances are daily: once a day's are used up, nothing new can be saved until they reset at midnight UTC.

## Get started

### Try it on your computer

With Node 22.22.2+, 24.15+ or 26+, and pnpm 10:

```sh
pnpm install
pnpm build      # once, for the app's files that wrangler serves
pnpm dev        # Spark at http://localhost:5173
pnpm seed       # in a second terminal: a made-up team sets it up and talks
```

`pnpm seed` prints how to sign in as each of the team. [Development](docs/development.md) says more.

### Deploy to Cloudflare

Spark has no one-click deploy yet. Deploy it from a checkout with wrangler, as the [self-hosting guide](docs/self-hosting.md#deploying) describes under "To deploy from your machine". Turn on R2 in your Cloudflare dashboard first, for the files people share; each deployment needs a bucket and a database of its own. Setup is opened only by the setup password you give the deployment (`EMBER_SETUP_PASSWORD`), so nobody who finds the address first can take it over.

## Built on Cloudflare

- **Every room is its own [Durable Object](https://developers.cloudflare.com/durable-objects/)**, holding the room's live connections, who's here and who's typing, and, by default, its messages in its own SQLite database.
- **Secure by default.** HTTPS everywhere with HSTS, a strict Content Security Policy, passwords hashed with scrypt, and setup only through the deployment's own password. Removing someone ends their sessions within a minute. The [security notes](docs/self-hosting.md#security-notes) have the rest.
- **Tested.** The Worker's tests run on both storage backends, and browser tests drive the app on a desktop and on emulated phones.

## Contributing

Issues and pull requests are welcome from everyone: [CONTRIBUTING.md](CONTRIBUTING.md) says how.

## Learn more

These guides began as Ember's, and parts still say Ember:

- [Self-hosting guide](docs/self-hosting.md): deploying, custom domains, who can join, email, push notifications, files and security.
- [Bot API](docs/bot-api.md): how a bot posts, reads, edits and boosts with its key in a header.
- [Incoming webhooks](docs/slack-webhooks.md): what bots can post, and how it looks.
- [Development](docs/development.md): the code's layout, running it locally, tests and performance.
- [The database](docs/database.md): the schema.
- [This fork's migrations](docs/fork-migrations.md): how the fork's database changes stay clear of Ember's.
- [Spark and Ember](docs/upstream.md): how Spark takes changes from Ember, and the log of each.

## Credits

Spark grew out of [Ember](https://github.com/NYLLON-SOFTWARE/ember-cloudflare), NYLLON's group chat on Workers and Durable Objects. Ember in turn grew out of [Campfire](https://github.com/basecamp/once-campfire), 37signals' group chat. Our deep thanks to [Kevin Rose](https://github.com/kropdx) and NYLLON for Ember, and for releasing it under the MIT License, and to 37signals for Campfire, which they also opened up under the MIT License. Thank you, truly.

Spark is [MIT licensed](LICENSE), as Ember and Campfire are, and the license file carries their copyright notices. Its icons are [Iconoir](https://iconoir.com)'s, and the made-up team's pictures are credited in [the seed's files](apps/worker/scripts/seed/files/README.md).

Spark is not created by, affiliated with, or supported by NYLLON or 37signals.
