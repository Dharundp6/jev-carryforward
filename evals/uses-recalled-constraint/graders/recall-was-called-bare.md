---
type: tool_used
tool: mcp__carryforward__recall
min: 1
---

The same indicator as `recall-was-called`, but spelled `mcp__<server>__<tool>`.

Two graders exist because the naming of a plugin-provided MCP tool was not
something I could confirm from documentation, and guessing it wrong is silent:
an unknown name in `allowed_tools` leaves the real tool unavailable with no
error, which looks exactly like the agent choosing not to call it.

Whichever of the two fires is the real name, and the other one gets deleted.
