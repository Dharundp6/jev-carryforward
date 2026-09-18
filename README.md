# carryforward

**What your last session knew, scored against what this one is doing.**

An MCP server with two tools. `record` writes a fact to a per-project ledger the moment it is produced. `recall` brings the ledger back at the start of a task, scored by [Jev](https://typesafe.ai) — TypeSafe's evaluation model, reached through the Vercel AI Gateway — for whether each entry still matters. The next session, or the next agent, starts with what it needs and not the whole history. Nothing is summarised; nothing is deleted.

[![CI](https://github.com/Dharundp6/jev-carryforward/actions/workflows/ci.yml/badge.svg)](https://github.com/Dharundp6/jev-carryforward/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/carryforward?color=red)](https://www.npmjs.com/package/carryforward)
[![MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

## ❌ Without it

A long session ends, or gets compacted mid-flight. The next one starts from a summary — and a summary is lossy in an unbounded way:

- the *reason* for a decision is gone, so it gets re-litigated
- a measured number is gone, so it gets re-measured, or guessed
- a rule you stated is gone, so it gets broken
- a guess from three sessions ago is now quoted as a fact

Every subagent you spawn has the same problem in miniature, dozens of times a session.

## ✅ With it

```
record  constraint  "never force-push; a guard that refuses is information"
record  decision    "hook warns, never blocks — blocking would force --no-verify"  ref: .git/hooks/pre-push
record  measurement "14 decisions cost $0.00059, 318 ms median"  ref: triage.mjs  refresh: not reproducible
record  thread      "email sign-in branch parked until the dashboard lane reopens"  ref: branch dharun-dev/email-signin
```

Next session, first task:

```
recall  "add the scope check as a CI job"
```

```markdown
# Carried forward
_task: add the scope check as a CI job_

## Always — constraints and corrections
- [constraint · told · 2026-09-18] never force-push; a guard that refuses is information

## Live for this task
- [decision · decided · 2026-09-18 · p=0.91] hook warns, never blocks — blocking would force --no-verify
  ref: .git/hooks/pre-push

## Also on record
- 3f9a12c0 · measurement · 14 decisions cost $0.00059, 318 ms median (p=0.41)

_1 entry not relevant to this task, omitted._
```

Nothing was summarised. Nothing was deleted. The ledger is still all there for the next task, which will score it differently.

## Install

Needs Node 22+ and an [AI Gateway](https://vercel.com/docs/ai-gateway) key in `AI_GATEWAY_API_KEY` for scoring. Without a key everything still works — `recall` returns the whole ledger and says so.

**Claude Code**

```sh
claude mcp add carryforward -e AI_GATEWAY_API_KEY=$AI_GATEWAY_API_KEY -- npx -y carryforward
```

**Cursor / Claude Desktop / any MCP client**

```json
{
  "mcpServers": {
    "carryforward": {
      "command": "npx",
      "args": ["-y", "carryforward"],
      "env": { "AI_GATEWAY_API_KEY": "...", "CARRYFORWARD_PROJECT": "my-project" }
    }
  }
}
```

The ledger is chosen by the server's working directory. Claude Code launches the server in your project, so each project gets its own ledger automatically. Desktop clients launch it from an unrelated directory, so set `CARRYFORWARD_PROJECT` per project as above or every project shares one ledger.

**From source**

```sh
git clone https://github.com/Dharundp6/jev-carryforward && cd jev-carryforward
npm install && npm run build
node dist/cli.js            # serves MCP over stdio
node dist/cli.js recall     # prints the brief; no task = one line each
node dist/cli.js path       # where this project's ledger lives
```

### Re-inject at session start

The ledger lives on disk, outside the context window, so compaction cannot touch it. To have every session open with the pinned entries already in context, add a `SessionStart` hook in `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "npx -y carryforward recall" }] }
    ]
  }
}
```

With no task the hook injects constraints and corrections in full and lists everything else one line each. The model then calls `recall` with the actual task once it knows it, and gets the scored version.

## How it works

The sorting axis is not *importance* — everything feels important when it is produced. What predicts whether losing something hurts is whether it can be re-derived, against what being wrong costs:

|                          | expensive to lose                        | cheap to lose              |
|--------------------------|------------------------------------------|----------------------------|
| **not re-derivable**     | **pin** — carried verbatim, never scored | drop                       |
| **re-derivable cheaply** | **pointer** — carry the ref, refresh it  | **score** — the model's job |

Three of the four cells are handled by plain code. The model gets one.

### The ledger

One JSON line per entry, append-only, one file per project (`~/.carryforward/<project>.jsonl`; override with `CARRYFORWARD_DIR` and `CARRYFORWARD_PROJECT`). Nothing is ever rewritten. An entry is retired by appending another that names it in `supersedes` — the old line stays, so a reversed decision remains visible as reversed.

| kind          | what it is                                    | scored? | needs `ref`? |
|---------------|-----------------------------------------------|---------|--------------|
| `constraint`  | a rule or boundary the user stated            | never   | no           |
| `correction`  | the user corrected something you did          | never   | no           |
| `decision`    | a choice between alternatives, with the reason | yes     | **yes**      |
| `measurement` | a figure a tool produced that you will rely on | yes     | **yes**      |
| `thread`      | work parked, blocked, or handed to someone    | yes     | **yes**      |

Every entry also records **how it was obtained** — `measured`, `decided`, `told` or `inferred` — so a guess cannot be carried forward and quoted later as a fact.

Decisions, measurements and threads **must point at something verifiable**: the command, the PR, the commit, the file, the URL. That keeps the ledger small, makes every claim checkable rather than trusted, and lets an entry expire naturally when the thing it points at closes.

**Write the text so it says *what* before *why*.** Recall scores an entry against a future task by its text. An entry that only records a reason will not be found by the task it belongs to — see the measured example below.

### Scoring with Jev

`recall` asks one yes/no question per non-pinned entry, in one request per 25 entries:

> Entry *N* is still live for the task starting now: not knowing it would cause wrong or repeated work.

The probability lands the entry on a rung: **≥ 0.60 inject in full**, **0.30–0.60 mention in one line**, **below 0.30 omit**. The thresholds are exported constants, not hidden.

The scorer is [Jev](https://typesafe.ai) by TypeSafe, an evaluation model that answers typed questions with calibrated probabilities and generates no text — which is exactly why it fits: nothing here needs writing, only ranking. It is reached through the Vercel AI Gateway (`typesafe-ai/jev`, $0.042 per million input tokens, no output charge, zero data retention on the gateway route). A hundred-entry ledger scores in four requests for well under a tenth of a cent.

You can bring your own scorer: implement `Asker` — one `ask(state, questions)` returning a probability per id — and call `recall(entries, task, asker)` from the library.

### One measured run

Nine entries from a real project ledger, three tasks, live scorer, 1.4 s per recall. The two irrelevant-to-most-tasks entries are omitted from the table for space.

| entry (kind)                                            | "resume the email sign-in work" | "rerun the test suite, which failures are real" | "add the scope check as an advisory CI job" |
|---------------------------------------------------------|------|------|------|
| email sign-in branch parked (thread)                    | **0.81** | 0.15 | 0.12 |
| 105 Windows test failures are environmental (measurement) | 0.27 | **0.81** | 0.21 |
| pre-push scope hook warns, never blocks (decision)      | 0.20 | 0.15 | 0.41 |
| PR #1903 *"opened separately from #1860 because…"* (decision) | 0.22 | 0.12 | 0.17 |
| → rewritten: *"proposes the scope check as an advisory CI check…"* | — | — | **0.70** |

When one entry plainly matches the task it scores around 0.8 and the next-best sits under 0.3. The last two rows are the same fact recorded twice: the first version explains *why* the PR exists and never says what it proposes, and the scorer — correctly — could not connect it to the task. Rewritten to say what it is, it moves from omitted to injected. That is where the *what before why* rule comes from. Three tasks and nine entries is a signal, not a measurement; the precision/recall harness below is what would make it one.

### What it never does

- **Never deletes by probability.** Selection happens at read time, when the task is known. The ledger is written dumb and complete, and stays that way.
- **Never scores a constraint or a correction.** A model does not get a vote on a rule the user stated.
- **Never returns less than the ledger holds without saying so.** No key, no task, scorer down, rate-limited — every path falls open to injecting everything, with a note naming why.
- **Never sends the ledger anywhere at write time.** Only `recall` with a task contacts the scorer, and only the non-pinned entries are in the state it sends.

## Principles

1. **The record lives outside the context window.** Compaction operates on the window; a record inside it can be damaged by it.
2. **Never delete at write time; select at read time.** At write time the next task is unknown, so keep/drop is an unrecoverable guess. At read time the task is the query.
3. **This is separation, not compression.** The expensive-to-lose set is kilobytes. The cheap-to-lose set is megabytes. There is no size pressure on the valuable set; the job is stopping the bulk crowding it out.
4. **Everything is a pointer to something verifiable**, except constraints and corrections, which are tiny.
5. **A carried decision is a default the next session may revisit. A carried constraint is not.** The ledger keeps those two visibly different.

## Library

```ts
import { append, active, readAll, recall, formatBrief, gatewayAsker, ledgerPath } from "carryforward";

const path = ledgerPath();                          // ~/.carryforward/<project>.jsonl
append(path, { kind: "constraint", obtained: "told", text: "never force-push" });

const brief = await recall(active(readAll(path)), "add the scope check to CI", gatewayAsker());
console.log(formatBrief(brief));
```

## Not built, on purpose

- **Write-time tagging** — a second, small use of the scorer that classifies events as they happen ("is this user message a correction?") so the model does not have to decide what to record. Tagging cannot lose anything, so it is safe; it is just not in the first slice.
- **Measured precision and recall.** Every subagent dispatch is a labelled trial — what was injected against what the agent actually used or asked for — and the same diff exists for sessions from the transcript on disk. That measurement is the next thing to build, and no accuracy number gets quoted here before it exists.

## Development

```sh
npm install
npm run check    # typecheck + tests + build
```

The tests use a fake scorer and never contact the network.

## License

MIT
