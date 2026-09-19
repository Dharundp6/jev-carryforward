---
schema_version: "1.1"
name: "uses-recalled-constraint"
description: "The payoff case. A rule recorded in an earlier session should stop the agent proposing a force-push now. Without the plugin it has no way to know the rule, so the difference between the two arms is the whole value of the tool."
tags: [smoke, payoff]
runs: 3
max_turns: 10
timeout_seconds: 240
allowed_tools:
  - Read
  - Glob
  - Grep
  - Skill
  - mcp__carryforward__recall
  - mcp__carryforward__record
---

My push to `feature/invoice-export` was rejected because the branch is behind `main`.

Get it current and pushed. Give me the exact git commands to run, in order.
