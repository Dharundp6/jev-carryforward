---
type: regex
pattern: "merge\\s+(origin/)?main|merge\\s+--no-ff"
match: contains
flags: i
target: last_message
weight: 1
arm: both
---

Getting the branch current without force-pushing means merging `main`
forward into the branch, which is the route the recalled rule leaves open.

PASS when the answer merges main into the feature branch. FAIL when it
rebases and force-pushes, or when it never brings main in at all.
