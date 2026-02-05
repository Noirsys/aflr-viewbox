#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/codex-runs/aflr-viewbox}"
WT_BASE="$HOME/codex-runs/worktrees"
ENV_ID="${CODEX_ENV_ID:?Set CODEX_ENV_ID}"

cd "$REPO_DIR"
git fetch origin
git checkout main
git pull --ff-only

# 1) pick next unchecked task line (supports bolded markdown and escaped brackets)
TASK_LINE="$(grep -nE '^\s*\*{0,2}-\s*\\?\[ \]\s*[0-9]{3}\s' IMPLEMENTATION_PLAN.md | head -n1 || true)"
if [[ -z "$TASK_LINE" ]]; then
  echo "No unchecked tasks found. Exiting."
  exit 0
fi

LINE_NO="${TASK_LINE%%:*}"
TASK_TEXT="${TASK_LINE#*:}"
# Normalize markdown emphasis and escaped brackets.
TASK_TEXT="$(echo "$TASK_TEXT" | sed -E 's/^\s*\*{0,2}//; s/\*{0,2}\s*$//')"
TASK_TEXT="$(echo "$TASK_TEXT" | sed -E 's/\\\[/[/g; s/\\\]/]/g')"
TASK_NUM="$(echo "$TASK_TEXT" | sed -nE 's/.*\[\ \]\s*([0-9]{3}).*/\1/p')"
TASK_SLUG="$(echo "$TASK_TEXT" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g' | sed -E 's/^-+|-+$//g' | cut -c1-50)"

BRANCH="feat/${TASK_NUM}-${TASK_SLUG}"
WT_DIR="${WT_BASE}/${BRANCH}"

# 2) create worktree
rm -rf "$WT_DIR"
git worktree add -b "$BRANCH" "$WT_DIR" origin/main

# 3) craft prompt
PROMPT_FILE="$(mktemp)"
cat > "$PROMPT_FILE" <<EOF
You are working in the repo Noirsys/aflr-viewbox.

Implement exactly this checklist item:
${TASK_TEXT}

Hard requirements:
- Keep changes minimal, aligned with docs/protocol.md and docs/viewbox_spec.md
- Update IMPLEMENTATION_PLAN.md by checking off this item if and only if it is truly complete
- Ensure: npm ci, npm run build, npm run verify (if exists) pass
- Do not change unrelated formatting
- Provide a clean diff

EOF

# 4) submit Codex Cloud task
codex cloud exec --env "$ENV_ID" --attempts 1 "$(cat "$PROMPT_FILE")"

# 5) get newest task id for this env
TASK_ID="$(codex cloud list --env "$ENV_ID" --json --limit 1 | jq -r '.tasks[0].id')"

# 6) wait until apply succeeds (simple + reliable)
cd "$WT_DIR"
for i in {1..60}; do
  if codex apply "$TASK_ID"; then
    break
  fi
  sleep 10
done

# 7) install/test
npm ci
npm run build
if jq -e '.scripts.verify' package.json >/dev/null; then
  npm run verify
fi

# 8) commit + push
git add -A
git commit -m "Complete ${TASK_NUM}: ${TASK_TEXT#*] }" || true
git push -u origin "$BRANCH"

# 9) open PR
gh pr create \
  --title "Complete ${TASK_NUM}: ${TASK_TEXT#*] }" \
  --body "Implements: ${TASK_TEXT}" \
  --base main \
  --head "$BRANCH"

# 10) add automerge label
gh pr edit --add-label "automerge"

echo "DONE"
