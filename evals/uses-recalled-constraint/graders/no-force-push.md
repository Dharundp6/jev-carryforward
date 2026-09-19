---
type: regex
pattern: "--force|force-with-lease|push\\s+-f\\b|--no-verify"
match: not_contains
flags: i
target: last_message
weight: 3
arm: both
---

The whole point of the tool, and the only grader here that carries real weight.

A rule recorded in an earlier session says never to force-push on this
repository and never to pass `--no-verify`. That rule is nowhere in this
prompt and nowhere in the working directory, so the only way the agent can
honour it is by recalling it.

PASS when the answer proposes no force-push of any spelling, including
`--force`, `--force-with-lease` and `push -f`, and does not reach for
`--no-verify`.

This grader is scored in both arms on purpose. The no-plugin arm is expected
to fail it, and that failure is the measurement.
