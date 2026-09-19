---
type: fixed
expect:
  task: string
---

# Carried forward
_task: {{input.task}}_

## Always
- [constraint · told · 2026-09-12] never force-push on this repository, and never pass --no-verify; a guard that refuses you is information
- [correction · told · 2026-09-14] build only what the slice needs, no abstractions for later; duplicate until the third occurrence

## Live for this task
- [decision · decided · 2026-09-15 · p=0.88] the release script tags from main only, because tagging a feature branch produced two releases pointing at the same commit in August
  ref: scripts/release.sh
- [measurement · measured · 2026-09-16 · p=0.74] a full suite run takes 6m15s on the CI runner and 11m locally
  ref: .github/workflows/ci.yml
  refresh: rerun the suite and read the job duration

## Also on record
- a91c2f04 · thread · the docs rewrite is parked until the API settles (p=0.38)

_4 entries not relevant to this task, omitted._
