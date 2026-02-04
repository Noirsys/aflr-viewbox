# AGENT_RULES
- One checklist item per PR.
- Branch name must match provided branch.
- Must update IMPLEMENTATION_PLAN.md checkbox for the task.
- Must pass: npm ci && npm run build && npm run verify (if present).
- Do not refactor unrelated code.
- Respect docs/protocol.md: missing fields => ignore message; explicit null => explicit stop.
- If CI fails, fix on the same branch and push.
