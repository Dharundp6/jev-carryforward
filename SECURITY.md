# Security

## What leaves the machine

Only `recall` with a task contacts the network, and only when `AI_GATEWAY_API_KEY` is set. The request carries the task sentence and the **non-pinned** ledger entries — decisions, measurements, threads — for scoring. Constraints and corrections are never sent. `record` never contacts the network.

The scorer is reached through the Vercel AI Gateway (`typesafe-ai/jev`), whose published terms on that route are zero data retention and no training. If you cannot accept a ledger entry being sent for scoring, do not set the key: `recall` then returns everything locally and says so.

## What the ledger holds

Whatever you record. It lives at `~/.carryforward/<project>.jsonl` by default, is plain text, and is not encrypted. Do not record secrets in it. Treat it like any other file under your home directory.

## Reporting

Open a private security advisory on the repository, or email the address on the author's GitHub profile. Please do not open a public issue for something exploitable.
