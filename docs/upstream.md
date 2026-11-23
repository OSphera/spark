# Spark and Ember

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
| 2026-11-22 | `6784948c` | v0.5.0-beta.14 + 9 (PR #496) | merge commit on `main` | 14 files, 22 hunks |
