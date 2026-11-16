# This fork's migrations

This fork of Ember adds to Ember's database, and keeps following Ember as it changes. Ember numbers its
migrations `0001_`, `0002_` and so on, and takes the next number with each new one. If the fork numbered
its own the same way, the two would meet: on 2026-11-15 the fork had a `0063_` and a `0064_`, and the
next day Ember added a `0063_` of its own.

So the fork's migrations are named `pk-0001_`, `pk-0002_` and so on, and never take one of Ember's
numbers.

## How it works

- **Migrations are files, and a database records the ones it has run by file name.** On D1,
  `wrangler d1 migrations apply`, which `pnpm run deploy` runs, applies every file in
  `apps/worker/migrations/` that the database's `d1_migrations` table doesn't list, whatever its
  number. On Durable Object SQLite, each object does the same from the list in
  `apps/worker/src/migrations.ts` when it opens.
- **wrangler sorts files by their leading number, then puts names without one after them all**, by
  name (`compareSegments` in wrangler 4.149.0). So every `pk-` file sorts after every one of Ember's,
  and `pk-0001`, `pk-0002` keep their order.
- **A database that's already running sees them in the order they arrived**: the fork's `pk-0002`,
  then whatever Ember added next, then the fork's `pk-0003`. A new one runs all of Ember's and then
  all of the fork's. Both come to the same tables only while the rule below holds.
- **The list in the code keeps them apart too.** Ember's are in `MIGRATIONS` in `migrations.ts`; the
  fork's are in `FORK_MIGRATIONS` in `fork-migrations.ts`, which `migrations.ts` adds to the end. A
  migration Ember adds to its list never lands beside one of ours, so merging Ember in has nothing to
  resolve there. A test checks the whole list against the directory, in wrangler's order.

## The rule

**The fork's migrations and Ember's must not depend on each other's order.** A fork migration may rely
on any table or column an Ember migration made before the fork was made. It must not rely on one Ember
might add later, and nothing of Ember's can rely on ours. Then "all of Ember's, then ours" and "as they
arrived" give the same database.

Ours so far only add columns to Ember's tables: `messages.sent_via`, and `users.owner_id`,
`users.bot_key_digest`, `users.bot_key_used_at` and `accounts.personal_agents`.

## Adding one

1. Write `apps/worker/migrations/pk-NNNN_<what>.sql`, with the next `pk-` number. Don't use
   `wrangler d1 migrations create`: it takes Ember's next number.
2. Add it to the end of `FORK_MIGRATIONS` in `apps/worker/src/fork-migrations.ts`, with the kind of
   object whose tables it changes.
3. Keep to what `CLAUDE.md` asks of any migration: SQL that runs on both Durable Object SQLite and D1,
   adding to tables and never taking away, and never changing a migration once it has been deployed.
4. Run `pnpm typecheck && pnpm test`. The worker's tests make a new database on both backends.

## When Ember changes something of ours

The tests find it when Ember is merged in, since they build a new database every run.

- **Ember adds a column or table the fork already added.** Its migration fails on a database that has
  ours ("duplicate column"). Take Ember's, change our code to use it, and write a `pk-` migration that
  moves what ours held, if anything. A database already running needs the clash settled by hand
  before the deploy.
- **Ember renames or drops something a fork migration touches.** Ours then fails on a new database.
  Deployed migrations don't change, so add a `pk-` migration for what the fork needs now, and make the
  old one harmless only if there is no other way.
