# Contributing to Spark

Thanks for your interest in Spark. Issues and pull requests are welcome from everyone: bug reports, ideas, questions, documentation, and code.

Spark is a group chat for small circles, run on your own Cloudflare account. It is a fork of [Ember](https://github.com/NYLLON-SOFTWARE/ember-cloudflare): it started from Ember's code and now goes its own way, taking Ember's changes when they suit it.

## With thanks

Spark stands on other people's work, and we're grateful for it. Our deep thanks to [Kevin Rose](https://github.com/kropdx) and NYLLON for Ember, which Spark is built on, and for releasing it under the MIT License, which is what makes a fork like this possible at all. And our thanks to 37signals for [Campfire](https://github.com/basecamp/once-campfire), which Ember grew from, and which they also opened up under the MIT License. Most of Spark is still their work.

## Start with an issue

Open an [issue](https://github.com/OSphera/spark/issues) for anything you'd like to change or ask about: what happens, what you'd like instead, and why. For a bug, say which version of Spark you saw it on (it's in the left rail, above the "pause notifications" bell icon) and the browser, device, and operating system.

For a small, obvious fix, a pull request on its own is fine. For anything larger, an issue first lets us agree on the approach before you spend time on it.

## Pull requests

- Open it against `main`, and say which issue it addresses (`Fixes #N` closes the issue when it merges).
- Keep it to one coherent change. Several small pull requests are easier to review than one large one.
- Say what you checked (see below), and anything you didn't.

## Checks

There's no CI on this repository, so please run the checks yourself before opening a pull request:

```sh
pnpm install
pnpm typecheck && pnpm test && pnpm build
pnpm test:e2e
```

The browser suite (`pnpm test:e2e`) takes a while. Run the specs your change touches while you work, and the whole suite at the end if you can. [docs/development.md](docs/development.md) covers the layout and getting started, and [AGENTS.md](AGENTS.md) covers the coding rules: design tokens, icons, protocol types, storage on both backends, and tests.

## Commits

- Start the subject with its area in brackets, then say what changed in plain words, for example `[reactions] The tray turns back too`.
- Use the body for the why, and for anything you deliberately left alone.
- If an AI assistant helped write the change, say so with a `Co-Authored-By:` trailer.

## The database

Migrations in `apps/worker/migrations/` with plain numbers are Ember's: please don't edit, renumber or remove them, and don't drop Ember's tables, even ones Spark no longer uses. Spark's own schema changes are `pk-NNNN` migrations, as [docs/fork-migrations.md](docs/fork-migrations.md) describes. Deployments update from release to release, so add to tables rather than take away.

## Changes from Ember

Spark picks changes from Ember with `git cherry-pick -x`, rather than merging it. [docs/upstream.md](docs/upstream.md) has the method and the log of each sync. If you'd like Spark to take a particular Ember change, an issue naming it is the way to ask.

## Releases

Spark uses its own semantic versions, starting at 1.0.0, always shown with all three numbers. A release is a `vX.Y.Z` tag on `main` with a GitHub release and its notes, which Spark's update check and the Update Spark workflow read.

## License

Spark is under the MIT License in [LICENSE](LICENSE), as Ember and Campfire are. Contributions are made under the same license.

Spark is not created by, affiliated with, or supported by NYLLON or 37signals.
