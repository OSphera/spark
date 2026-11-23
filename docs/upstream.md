# Spark and Ember

**From here on, Spark cherry-picks from Ember rather than merging it** (decided 2026-11-22). Spark is a hard fork: once Ember's AI features, Memberful and single sign-on are gone from Spark (OSphera/spark#4, #6), a full merge would mostly be resolving Ember's changes to code Spark no longer has. So whoever syncs reads Ember's log since the last `ember-sync/*` tag, picks the changes Spark wants with `git cherry-pick -x` (which records the Ember commit in each), and adds a line below. The beta.15 merge is the last full one.


Spark is a fork of [Ember](https://github.com/NYLLON-SOFTWARE/ember-cloudflare), and it takes in Ember's changes by merging, never by squashing or rebasing. So git always knows the last Ember commit Spark took in:

```bash
git merge-base main nyllon/main
```

Each sync also leaves an annotated tag, `ember-sync/<Ember version>`, on the Ember commit merged. To see what Ember has done since:

```bash
git diff ember-sync/v0.5.0-beta.14 nyllon/main     # Ember's changes since that sync
git log --oneline ember-sync/v0.5.0-beta.14..nyllon/main
```

Here `nyllon` is the remote for `NYLLON-SOFTWARE/ember-cloudflare`.

## Syncs

| Date | Ember commit | Ember version | Merged into Spark | Conflicts |
|---|---|---|---|---|
| 2026-11-20 | `7a236185` | v0.5.0-beta.13 + 17 (PR #471) | `2c865299` | not recorded |
| 2026-11-22 | `6784948c` | v0.5.0-beta.14 + 9 (PR #496) | `c7b616b6` | 14 files, 22 hunks |
| 2026-11-22 | `b84acacb` | v0.5.0-beta.15 (the release of the commits above) | merge commit on `main` | none |
