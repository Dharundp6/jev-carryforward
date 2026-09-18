# carryforward

**What your last session knew, scored against what this one is doing.**

An MCP server with two tools. `record` saves a fact the moment it happens. `recall` brings those facts back at the start of a task, keeping only the ones that matter right now.

Nothing is summarised. Nothing is deleted.

[![npm](https://img.shields.io/npm/v/carryforward?color=red)](https://www.npmjs.com/package/carryforward)
[![CI](https://github.com/Dharundp6/jev-carryforward/actions/workflows/ci.yml/badge.svg)](https://github.com/Dharundp6/jev-carryforward/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

## The problem

Your session ends, or it gets compacted halfway through. The next one starts from a summary, and summaries lose things:

- The reason behind a decision is gone, so you argue about it again.
- A number you measured is gone, so you measure it again or guess.
- A rule you set is gone, so it gets broken.
- A guess from last week is now repeated as a fact.

Every agent you spawn has the same problem, many times a day.

## How it feels to use

You save facts as you go:

```
record  constraint  "never force-push, a guard that stops you is telling you something"
record  decision    "the hook warns instead of blocking, since blocking forces --no-verify"  ref: .git/hooks/pre-push
record  measurement "14 decisions cost $0.00059, 318 ms each"  ref: triage.mjs  refresh: not reproducible
record  thread      "email sign-in branch is parked until the dashboard work restarts"  ref: branch dharun-dev/email-signin
```

Next session, you start a task:

```
recall  "add the scope check as a CI job"
```

And you get back only what that task needs:

```markdown
# Carried forward
_task: add the scope check as a CI job_

## Always
- [constraint] never force-push, a guard that stops you is telling you something

## Live for this task
- [decision · p=0.91] the hook warns instead of blocking, since blocking forces --no-verify
  ref: .git/hooks/pre-push

## Also on record
- 3f9a12c0 · measurement · 14 decisions cost $0.00059, 318 ms each (p=0.41)

_1 entry not relevant to this task, omitted._
```

The rest is still saved. A different task will bring back different things.

## Install

You need Node 22 or newer.

**Claude Code**

```sh
claude mcp add carryforward -e AI_GATEWAY_API_KEY=$AI_GATEWAY_API_KEY -- npx -y carryforward
```

**Cursor, Claude Desktop, or any MCP client**

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

The key is for scoring. Without it everything still works, and `recall` just gives you the whole list and tells you it could not score.

Each project gets its own file. Claude Code starts the server inside your project, so this happens on its own. Desktop apps start it somewhere else, so set `CARRYFORWARD_PROJECT` for each project or they will all share one file.

**Start every session with your rules already loaded**

Add this to `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "npx -y carryforward recall" }] }
    ]
  }
}
```

## What you can save

| kind | what it is | needs a `ref`? |
|---|---|---|
| `constraint` | a rule or a boundary you set | no |
| `correction` | you corrected something the agent did | no |
| `decision` | a choice, and why you made it | yes |
| `measurement` | a number you will rely on later | yes |
| `thread` | work that is parked, blocked, or with someone else | yes |

Constraints and corrections come back every time, in full. They are never scored, because a model should not get a vote on a rule you set.

The other three must point at something real: the command, the pull request, the commit, the file, the link. This keeps the list short, lets anyone check a claim instead of trusting it, and lets an entry fade away once the thing it points at is closed.

Each entry also saves **where it came from**: `measured`, `decided`, `told`, or `inferred`. So a guess never gets repeated later as a fact.

**Write the what before the why.** Entries are matched to a task by their words. One that only explains a reason will not be found by the task it belongs to. There is a real example of this below.

## How the scoring works

For each entry that is not a constraint or a correction, `recall` asks one yes or no question:

> Is this still live for the task starting now? Would not knowing it cause wrong or repeated work?

The answer is a probability, and it decides what you see. Above 0.60 you get the full entry. Between 0.30 and 0.60 you get one line. Below that it is left out. Those numbers are exported constants, not hidden.

The scorer is [Jev](https://typesafe.ai) from TypeSafe, reached through the Vercel AI Gateway. It is an evaluation model, so it answers questions with probabilities and writes no text at all. That is why it fits here: nothing needs writing, only sorting. A list of a hundred entries is scored in four requests for well under a tenth of a cent.

You can use your own scorer instead. Write an `Asker` with one `ask(state, questions)` method and pass it to `recall(entries, task, asker)`.

### A real run

Nine entries from a real project, three different tasks, 1.4 seconds each.

| entry | "resume the email sign-in work" | "rerun the tests, which failures are real" | "add the scope check as a CI job" |
|---|---|---|---|
| email sign-in branch is parked | **0.81** | 0.15 | 0.12 |
| 105 Windows test failures are environmental | 0.27 | **0.81** | 0.21 |
| the hook warns instead of blocking | 0.20 | 0.15 | 0.41 |
| PR #1903, written as *"kept separate from #1860 because..."* | 0.22 | 0.12 | 0.17 |
| the same fact, rewritten as *"proposes the scope check as a CI check"* | | | **0.70** |

When an entry clearly fits the task it scores around 0.8, and nothing else comes close.

The last two rows are the same fact written twice. The first version only explains why the pull request exists and never says what it does, so it was never found. Rewritten to say what it is, it went from left out to shown in full. That is where the "what before why" advice comes from.

Nine entries and three tasks is a hint, not proof. There is no accuracy claim here until there is a proper test behind it.

## Things it will never do

- **It never deletes anything.** Sorting happens when you read, not when you write. The file only grows.
- **It never scores your rules.** Constraints and corrections always come back whole.
- **It never quietly gives you less.** No key, no task, scorer down, rate limited: you get everything, plus a line saying why it could not sort.
- **It never sends anything when you save.** Only `recall` with a task talks to the network, and your constraints and corrections are never part of that.

## Where things are kept

One JSON line per entry, in `~/.carryforward/<project>.jsonl`. Change the location with `CARRYFORWARD_DIR` and the name with `CARRYFORWARD_PROJECT`.

Nothing is ever rewritten. To retire an entry you add a new one that names the old one, and the old line stays where it is. So a decision you reversed is still visible as reversed.

If a line ever gets damaged, by a crash or a full disk, it is skipped and counted, never removed, and `recall` tells you it happened.

## Use it as a library

```ts
import { append, active, readAll, recall, formatBrief, gatewayAsker, ledgerPath } from "carryforward";

const path = ledgerPath();
append(path, { kind: "constraint", obtained: "told", text: "never force-push" });

const brief = await recall(active(readAll(path)), "add the scope check to CI", gatewayAsker());
console.log(formatBrief(brief));
```

## Command line

```sh
npx carryforward              # run the MCP server
npx carryforward recall       # print what is saved, one line each
npx carryforward recall "..." # print what matters for this task
npx carryforward path         # show where this project's file lives
```

## Not built yet, on purpose

**Sorting as you write.** A small second use of the scorer that labels things as they happen, so you do not have to decide what to save. It cannot lose anything, so it is safe. It is just not needed yet.

**A proper accuracy test.** Every agent you spawn is a test case: compare what was given to it against what it actually used or asked for. Same idea for sessions, using the saved transcript. No accuracy number goes in this file before that exists.

## Development

```sh
npm install
npm run check
```

Tests use a fake scorer and never touch the network.

## License

MIT
