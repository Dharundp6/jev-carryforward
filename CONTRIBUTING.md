# Contributing

Thanks for looking. A few things that keep this small and honest.

**Build only the slice.** No abstractions for later. A helper with one caller lives next to its caller. Duplicate until the third occurrence, then extract.

**Nothing probabilistic in a blocking position.** The scorer ranks; it never deletes, never gates, never overrides a pinned entry. If a change would let a probability remove something from the ledger or hide a constraint, it will not be merged.

**Every failure path falls open.** No key, no task, no network, a malformed answer — `recall` returns the whole ledger and says why. A test that proves the fall-open path is worth more than a feature.

**Measured, not demonstrated.** If a change claims to improve selection, show the diff between what was injected and what the session or agent actually used. No accuracy number goes in the README without the run that produced it.

## Running

```sh
npm install
npm run check   # typecheck, tests, build
```

Tests use a fake scorer and never touch the network. If you need the live scorer, set `AI_GATEWAY_API_KEY` in your shell — never in a file in this repository.

## Pull requests

One change per PR, titled for what it does. Say in the body what you ran. If a PR touches `recall.ts`, add or extend a test in `test/recall.test.ts` for the path it changes.
