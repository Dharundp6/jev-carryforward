---
name: carryforward
description: Use at the start of any non-trivial task to recall what earlier sessions recorded about this project, and whenever the user states a rule, corrects you, settles a decision, or a tool produces a number you will rely on later. Keeps rules, decisions, measurements and parked work across sessions so they are not lost to compaction or a new session.
---

# carryforward

Two tools. `recall` brings back what earlier sessions recorded. `record` saves
something the moment it happens.

## Call `recall` before you start

At the start of any task that is more than a one-line answer, call `recall`
with the task in one sentence, **before** reading files or planning. It is
fast and costs almost nothing, and what comes back may change what you do.

It returns rules the user set, decisions already made and why, numbers already
measured, and work already parked. Treat everything under **Always** as
binding: those are the user's own rules, and breaking one is worse than being
slow. Treat everything under **Live for this task** as true unless you find
evidence otherwise, and check a `ref` before relying on a claim.

Do not ask permission to call it. Do not skip it because the task looks
familiar; looking familiar is exactly when a forgotten rule bites.

## Call `record` the moment something is worth keeping

Save it when it happens, not at the end. A session can be compacted or
interrupted before any end arrives.

Record a **constraint** when the user states a rule or a boundary. Record a
**correction** when the user corrects something you did. Record a **decision**
when a choice is settled, and put the reason in the text, since a decision
without its reason gets re-argued. Record a **measurement** when a tool
produces a number you will rely on later, and say in `refresh` how to get it
again or that it cannot be reproduced. Record a **thread** when work is
parked, blocked, or handed to someone else.

Decisions, measurements and threads need a `ref`: the command, the pull
request, the commit, the file, the link. Also set `obtained` honestly, to
`measured`, `decided`, `told` or `inferred`, so a guess is never quoted later
as a fact.

**Say what a thing is before why it exists.** Entries are matched to a future
task by their words, so one that only explains a reason will never be found by
the task it belongs to. Write "the release script tags from main only, because
tagging a branch produced two releases" rather than "because tagging a branch
produced two releases".

## What not to do

Do not record the question the user just asked, your own plan, or anything the
repository already states. Do not record secrets. One fact per entry.

To retire an entry, record a new one with `supersedes` set to the old id. The
old entry stays on disk, visibly replaced. Nothing is ever deleted.
