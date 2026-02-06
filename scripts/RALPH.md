# Ralph Orchestrator

Long-running Codex workflow for completing the checklist in `IMPLEMENTATION_PLAN.md`.

## Scripts

- `scripts/ralph_once.sh`
  - Runs one task cycle.
  - Finds next unchecked checklist item.
  - Launches multiple Codex candidates in parallel.
  - Picks first candidate that passes verification.
  - Runs a second Codex QA pass.
  - Commits result and optionally merges/pushes/opens PR.

- `scripts/ralph_forever.sh`
  - Repeats `ralph_once.sh` until all checklist items are done.
  - Handles retry and failure backoff.

- `scripts/loop_once.sh`
  - Compatibility alias to `ralph_once.sh`.

## Default behavior

- Multi-agent fanout: `CANDIDATE_COUNT=2`
- Local merge mode: `MERGE_TO_BASE=1`
- No push by default: `AUTO_PUSH=0`
- No PR by default: `AUTO_PR=0`

## Quick start

Dry run (no edits):

```bash
DRY_RUN=1 scripts/ralph_once.sh
```

Run one task end-to-end:

```bash
scripts/ralph_once.sh
```

Run continuously until checklist complete:

```bash
AUTO_PUSH=1 scripts/ralph_forever.sh
```

Detached daemon launch:

```bash
setsid -f bash -lc 'cd /path/to/repo && AUTO_PUSH=1 scripts/ralph_forever.sh >> .ralph/ralph_forever.out 2>&1'
```

## Useful environment variables

- `BASE_BRANCH=<current branch by default>`
- `BASE_REF_MODE=local|remote` (default: `local`)
- `CANDIDATE_COUNT=2`
- `CODEX_MODEL=gpt-5`
- `CODEX_TIMEOUT_SEC=3600`
- `MERGE_TO_BASE=1`
- `AUTO_PUSH=1`
- `AUTO_PR=1`
- `AUTO_MERGE_PR=1`
- `MAX_LOOPS=0` (forever)
- `MAX_CONSECUTIVE_FAILURES=3`
- `KEEP_WORKTREES=0`

## Logs and artifacts

- Run logs: `.ralph/logs/<run-id>/`
- Temporary candidate worktrees: `.ralph/worktrees/`

## Example: PR automation mode

```bash
MERGE_TO_BASE=0 AUTO_PUSH=1 AUTO_PR=1 AUTO_MERGE_PR=1 scripts/ralph_once.sh
```

## Label-Driven Auto-Merge

When a PR has label `automerge`, workflow `.github/workflows/pr-automerge.yml`
enables GitHub auto-merge (`--squash --auto --delete-branch`).

Arm one PR:

```bash
scripts/pr_automerge.sh <pr-number>
```

Arm all open PRs:

```bash
scripts/pr_automerge.sh --all
```

## Notes

- `npm ci` and `npm run verify` are enforced before commit.
- `public/fixtures/` is excluded from commit staging.
- If no unchecked tasks remain, `ralph_once.sh` exits with code `10` and JSON `{"done":true,...}`.
