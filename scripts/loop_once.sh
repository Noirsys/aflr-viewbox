#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/aflr-viewbox}"
REPO_URL="${REPO_URL:-https://github.com/Noirsys/aflr-viewbox.git}"
BASE_BRANCH="${BASE_BRANCH:-main}"
CODEX_ENV_ID="${CODEX_ENV_ID:-}"
OPENAI_MODEL="${OPENAI_MODEL:-}"

if [[ -z "$CODEX_ENV_ID" ]]; then
  echo "ERROR: CODEX_ENV_ID not set"
  exit 2
fi

mkdir -p "$(dirname "$REPO_DIR")"

if [[ ! -d "$REPO_DIR/.git" ]]; then
  git clone "$REPO_URL" "$REPO_DIR"
fi

cd "$REPO_DIR"
git fetch origin
git checkout "$BASE_BRANCH"
git pull --ff-only origin "$BASE_BRANCH"

# Parse next unchecked task from IMPLEMENTATION_PLAN.md (allow optional markdown bold **...**)
NEXT_LINE="$(grep -E '^\*{0,2}- \[ \] [0-9]{3} ' IMPLEMENTATION_PLAN.md | head -n 1 || true)"
if [[ -z "$NEXT_LINE" ]]; then
  echo '{"done":true,"message":"No unchecked tasks found."}'
  exit 0
fi

LINE_CLEAN="$(echo "$NEXT_LINE" | sed -E 's/^\*+//; s/\*+$//')"
TASK_ID="$(echo "$LINE_CLEAN" | sed -E 's/^- \[ \] ([0-9]{3}) .*/\1/')"
TASK_TEXT="$(echo "$LINE_CLEAN" | sed -E 's/^- \[ \] [0-9]{3} //')"

# Create slug + branch
SLUG="$(echo "$TASK_TEXT" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' | cut -c1-48)"
BRANCH="feat/${TASK_ID}-${SLUG}"

git checkout -B "$BRANCH"

# Build Codex prompt (deterministic)
cat > .codex_task_prompt.md <<EOF
You are implementing checklist task ${TASK_ID} from IMPLEMENTATION_PLAN.md.

Task line:
- [ ] ${TASK_ID} ${TASK_TEXT}

Hard rules:
$(cat AGENT_RULES.md)

Repo contracts:
- docs/protocol.md must be followed.
- docs/viewbox_spec.md must be followed for layout tasks.

Definition of done:
- npm ci
- npm run build
- npm run verify (if present)
- Update IMPLEMENTATION_PLAN.md: mark task ${TASK_ID} as [x]
- Commit changes with message: "feat(${TASK_ID}): ${TASK_TEXT}"
EOF

# ---- IMPORTANT: Codex Cloud invocation (placeholder) ----
# You must replace the next command with your actual Codex CLI syntax.
# Run once: `codex --help` and/or `codex cloud --help` to find the right flags.
#
# REQUIRED behaviors for the command:
# - Use Cloud env ID: $CODEX_ENV_ID
# - Run in repo: $REPO_DIR
# - Give it the prompt file .codex_task_prompt.md
# - Let Codex edit files locally in the cloud env workspace
# - After Codex finishes, we run tests locally and push/PR
#
# EXAMPLE SHAPE (you will adjust):
# codex cloud run --env "$CODEX_ENV_ID" --repo "$REPO_DIR" --prompt-file .codex_task_prompt.md

codex cloud run --env "$CODEX_ENV_ID" --repo "$REPO_DIR" --prompt-file .codex_task_prompt.md
# --------------------------------------------------------

# Local verification gate (cheap and deterministic)
npm ci
npm run build
if node -e "const p=require('./package.json'); process.exit(p.scripts&&p.scripts.verify?0:1)" ; then
  npm run verify
fi

git add -A
if git diff --cached --quiet; then
  echo "ERROR: Codex produced no changes for task ${TASK_ID}"
  exit 3
fi

git commit -m "feat(${TASK_ID}): ${TASK_TEXT}"
git push -u origin "$BRANCH"

# Create PR using GitHub CLI (needs GH_TOKEN exported)
# If you don't want gh, n8n can open PR via API instead.
if command -v gh >/dev/null 2>&1; then
  existing_pr="$(gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number' || true)"
  if [[ -z "$existing_pr" ]]; then
    PR_URL="$(gh pr create --base "$BASE_BRANCH" --head "$BRANCH" \
      --title "feat(${TASK_ID}): ${TASK_TEXT}" \
      --body "Automated Codex Cloud PR for task ${TASK_ID}." \
      --json url -q .url)"
  else
    PR_URL="$(gh pr view "$existing_pr" --json url -q .url)"
  fi
else
  PR_URL=""
fi

echo "{\"done\":false,\"task_id\":\"${TASK_ID}\",\"branch\":\"${BRANCH}\",\"pr_url\":\"${PR_URL}\"}"
