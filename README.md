# carryforward

**What your last session knew, scored against what this one is doing.**

An MCP server with two tools. `record` saves a fact the moment it happens. `recall` brings those facts back when you start a task, and uses [Jev](https://typesafe.ai) to keep only the ones that matter right now.

Nothing is summarised. Nothing is deleted.

[![npm](https://img.shields.io/npm/v/carryforward?color=red)](https://www.npmjs.com/package/carryforward)
[![CI](https://github.com/Dharundp6/jev-carryforward/actions/workflows/ci.yml/badge.svg)](https://github.com/Dharundp6/jev-carryforward/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![powered by Jev](https://img.shields.io/badge/scored%20by-Jev-6f42c1)](https://typesafe.ai)

![carryforward recall in a terminal, showing a rule kept in full, a decision scored 0.91 for the task, a measurement shown as one line, and six entries omitted](./assets/demo.svg)

## Contents

- [The problem](#the-problem)
- [What it looks like](#what-it-looks-like)
- [Install](#install)
- [What you can save](#what-you-can-save)
- [Why Jev](#why-jev)
- [A real run](#a-real-run)
- [Things it will never do](#things-it-will-never-do)
- [Where things are kept](#where-things-are-kept)
- [Library and CLI](#library-and-cli)
- [Help and contributing](#help-and-contributing)

## The problem

Your session ends, or it gets compacted halfway through. The next one starts from a summary, and summaries lose things:

- The reason behind a decision is gone, so you argue about it again.
- A number you measured is gone, so you measure it again or guess.
- A rule you set is gone, so it gets broken.
- A guess from last week is now repeated as a fact.

Every agent you spawn has the same problem, many times a day.

## What it looks like

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

The rest is still saved. A different task brings back different things.

## Install

Needs Node 22 or newer.

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

The key is what reaches Jev. Without it everything still works, and `recall` just gives you the whole list and tells you it could not score.

Each project gets its own file. Claude Code starts the server inside your project, so this happens on its own. Desktop apps start it somewhere else, so set `CARRYFORWARD_PROJECT` per project or they all share one file.

**Start every session with your rules already loaded.** Add this to `.claude/settings.json`:

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

Constraints and corrections come back every time, in full. Jev never sees them, because a model should not get a vote on a rule you set.

The other three must point at something real: the command, the pull request, the commit, the file, the link. This keeps the list short, lets anyone check a claim instead of trusting it, and lets an entry fade away once the thing it points at is closed.

Each entry also saves **where it came from**: `measured`, `decided`, `told`, or `inferred`. So a guess never gets repeated later as a fact.

**Write the what before the why.** Entries are matched to a task by their words. One that only explains a reason will not be found by the task it belongs to. There is a real example of this below.

## Why Jev

[Jev](https://typesafe.ai) is an evaluation model from [TypeSafe](https://typesafe.ai). You give it some context and a typed question, and it answers with a probability. It writes no text at all.

That sounds like a limit until you notice this job never needs anything written. It only needs sorting. So the usual worry about a language model rewriting your notes or inventing a detail does not apply here, because Jev cannot write into your file even in principle. It reads and it ranks. Your words stay your words.

For each entry that is not a constraint or a correction, `recall` asks Jev one yes or no question:

> Is this still live for the task starting now? Would not knowing it cause wrong or repeated work?

The probability that comes back decides what you see. Above 0.60 you get the full entry. Between 0.30 and 0.60 you get one line. Below that it is left out. Those numbers are exported constants, not hidden.

It is also cheap and quick. Jev costs $0.042 per million input tokens with no charge for output, so a list of a hundred entries is scored in four requests for well under a tenth of a cent, in about a second. carryforward reaches it through the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway), which is the route with published zero data retention terms.

Prefer a different scorer? Write an `Asker` with one `ask(state, questions)` method and pass it to `recall(entries, task, asker)`.

## A real run

Nine entries from a real project, three different tasks, 1.4 seconds each.

| entry | "resume the email sign-in work" | "rerun the tests, which failures are real" | "add the scope check as a CI job" |
|---|---|---|---|
| email sign-in branch is parked | **0.81** | 0.15 | 0.12 |
| 105 Windows test failures are environmental | 0.27 | **0.81** | 0.21 |
| the hook warns instead of blocking | 0.20 | 0.15 | 0.41 |
| PR #1903, written as *"kept separate from #1860 because..."* | 0.22 | 0.12 | 0.17 |
| the same fact, rewritten as *"proposes the scope check as a CI check"* | | | **0.70** |

When an entry clearly fits the task it scores around 0.8, and nothing else comes close.

The last two rows are the same fact written twice. The first version only explains why the pull request exists and never says what it does, so Jev never connected it to the task. Rewritten to say what it is, it went from left out to shown in full. That is where the "what before why" advice comes from.

Nine entries and three tasks is a hint, not proof. There is no accuracy claim here until there is a proper test behind it.

## Things it will never do

- **It never deletes anything.** Sorting happens when you read, not when you write. The file only grows.
- **It never scores your rules.** Constraints and corrections always come back whole.
- **It never quietly gives you less.** No key, no task, scorer down, rate limited: you get everything, plus a line saying why it could not sort.
- **It never sends anything when you save.** Only `recall` with a task talks to the network, and your constraints and corrections are never part of that.

## Where things are kept

One JSON line per entry, in `~/.carryforward/<project>.jsonl`. Change the folder with `CARRYFORWARD_DIR` and the name with `CARRYFORWARD_PROJECT`.

Nothing is ever rewritten. To retire an entry you add a new one naming the old one, and the old line stays where it is. So a decision you reversed is still visible as reversed.

If a line ever gets damaged, by a crash or a full disk, it is skipped and counted, never removed, and `recall` tells you it happened.

## Library and CLI

```ts
import { append, active, readAll, recall, formatBrief, gatewayAsker, ledgerPath } from "carryforward";

const path = ledgerPath();
append(path, { kind: "constraint", obtained: "told", text: "never force-push" });

const brief = await recall(active(readAll(path)), "add the scope check to CI", gatewayAsker());
console.log(formatBrief(brief));
```

```sh
npx carryforward              # run the MCP server
npx carryforward recall       # print what is saved, one line each
npx carryforward recall "..." # print what matters for this task
npx carryforward path         # show where this project's file lives
```

## Help and contributing

Questions and bugs go in [issues](https://github.com/Dharundp6/jev-carryforward/issues). Pull requests are welcome, and [CONTRIBUTING.md](./CONTRIBUTING.md) explains the few rules that keep this small.

Two things are deliberately not built yet. **Sorting as you write**, a second small use of Jev that labels things as they happen so you do not have to decide what to save. And **a proper accuracy test**, comparing what was given to an agent against what it actually used. No accuracy number goes in this file before that exists.

```sh
npm install
npm run check
```

Tests use a fake scorer and never touch the network.

## License

MIT
