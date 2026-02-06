#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$(git -C "$SCRIPT_DIR/.." rev-parse --show-toplevel)}"
DEFAULT_BASE_BRANCH="$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)"
BASE_BRANCH="${BASE_BRANCH:-$DEFAULT_BASE_BRANCH}"
FETCH_REMOTE="${FETCH_REMOTE:-1}"
CANDIDATE_COUNT="${CANDIDATE_COUNT:-2}"
CODEX_MODEL="${CODEX_MODEL:-}"
CODEX_TIMEOUT_SEC="${CODEX_TIMEOUT_SEC:-3600}"
DRY_RUN="${DRY_RUN:-0}"
MERGE_TO_BASE="${MERGE_TO_BASE:-1}"
AUTO_PUSH="${AUTO_PUSH:-0}"
AUTO_PR="${AUTO_PR:-0}"
AUTO_MERGE_PR="${AUTO_MERGE_PR:-0}"
KEEP_WORKTREES="${KEEP_WORKTREES:-0}"
WORK_ROOT="${WORK_ROOT:-$REPO_DIR/.ralph/worktrees}"
LOG_ROOT="${LOG_ROOT:-$REPO_DIR/.ralph/logs}"
BASE_REF_MODE="${BASE_REF_MODE:-local}"
DEFAULT_CODEX_HOME="$REPO_DIR/.ralph/codex_home"
CODEX_HOME_PATH="${CODEX_HOME:-$DEFAULT_CODEX_HOME}"

if ! [[ "$CANDIDATE_COUNT" =~ ^[0-9]+$ ]] || [[ "$CANDIDATE_COUNT" -lt 1 ]]; then
  echo "ERROR: CANDIDATE_COUNT must be >= 1" >&2
  exit 2
fi

RUN_ID="$(date +%Y%m%d-%H%M%S)-$$"
RUN_LOG_DIR="$LOG_ROOT/$RUN_ID"
mkdir -p "$RUN_LOG_DIR" "$WORK_ROOT"

log() {
  printf '[%s] %s\n' "$(date +'%Y-%m-%dT%H:%M:%S%z')" "$*"
}

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

codex_log_has_environment_error() {
  local log_file="$1"
  grep -E -q \
    'Fatal error: Codex cannot access session files|failed to initialize rollout recorder: Permission denied|Failed to create session: Permission denied|failed to clean up stale arg0 temp dirs: Permission denied|could not update PATH: Permission denied' \
    "$log_file"
}

has_verify_script() {
  node -e "const p=require('./package.json'); process.exit(p.scripts&&p.scripts.verify?0:1)"
}

prepare_codex_home() {
  local source_home="$HOME/.codex"
  local codex_home="$CODEX_HOME_PATH"
  local file

  mkdir -p \
    "$codex_home" \
    "$codex_home/log" \
    "$codex_home/rules" \
    "$codex_home/sessions" \
    "$codex_home/shell_snapshots" \
    "$codex_home/tmp"

  if [[ "$codex_home" != "$source_home" ]]; then
    for file in auth.json config.toml models_cache.json version.json; do
      if [[ ! -f "$codex_home/$file" ]] && [[ -f "$source_home/$file" ]]; then
        cp "$source_home/$file" "$codex_home/$file" >/dev/null 2>&1 || true
      fi
    done
  fi

  [[ -w "$codex_home" ]] || return 87
  [[ -w "$codex_home/sessions" ]] || return 87
  return 0
}

verify_worktree() {
  local wt="$1"
  local out_log="$2"

  if [[ "$DRY_RUN" == "1" ]]; then
    printf 'dry-run: skipped npm ci and verification\n' >>"$out_log"
    return 0
  fi

  (
    cd "$wt"
    npm ci >>"$out_log" 2>&1
    if has_verify_script; then
      npm run verify >>"$out_log" 2>&1
    else
      npm run build >>"$out_log" 2>&1
      npm run lint --if-present >>"$out_log" 2>&1
      npm run test --if-present >>"$out_log" 2>&1
    fi
  )
}

run_codex_exec() {
  local wt="$1"
  local prompt_file="$2"
  local out_log="$3"
  local rc=0

  if [[ "$DRY_RUN" == "1" ]]; then
    printf 'dry-run: skipped codex exec for %s\n' "$wt" >"$out_log"
    return 0
  fi

  if ! prepare_codex_home; then
    printf 'ERROR: unable to prepare writable CODEX_HOME at %s\n' "$CODEX_HOME_PATH" >"$out_log"
    return 87
  fi

  local cmd=(env CODEX_HOME="$CODEX_HOME_PATH" codex exec --dangerously-bypass-approvals-and-sandbox -C "$wt")
  if [[ -n "$CODEX_MODEL" ]]; then
    cmd+=( -m "$CODEX_MODEL" )
  fi
  cmd+=( - )

  timeout "$CODEX_TIMEOUT_SEC" "${cmd[@]}" <"$prompt_file" >"$out_log" 2>&1 || rc=$?

  if codex_log_has_environment_error "$out_log"; then
    return 86
  fi

  if [[ "$rc" -ne 0 ]]; then
    return "$rc"
  fi

  return 0
}

run_codex_review() {
  local wt="$1"
  local out_log="$2"
  local rc=0

  if [[ "$DRY_RUN" == "1" ]]; then
    printf 'dry-run: skipped codex review for %s\n' "$wt" >"$out_log"
    return 0
  fi

  if ! prepare_codex_home; then
    printf 'ERROR: unable to prepare writable CODEX_HOME at %s\n' "$CODEX_HOME_PATH" >"$out_log"
    return 87
  fi

  local cmd=(env CODEX_HOME="$CODEX_HOME_PATH" codex exec review --uncommitted --dangerously-bypass-approvals-and-sandbox)
  if [[ -n "$CODEX_MODEL" ]]; then
    cmd+=( -m "$CODEX_MODEL" )
  fi

  (cd "$wt" && "${cmd[@]}") >"$out_log" 2>&1 || rc=$?

  if codex_log_has_environment_error "$out_log"; then
    return 86
  fi

  if [[ "$rc" -ne 0 ]]; then
    return "$rc"
  fi

  return 0
}

get_next_task_line() {
  local base_ref="$1"
  git -C "$REPO_DIR" show "$base_ref:IMPLEMENTATION_PLAN.md" \
    | grep -E '^\*{0,2}- (\\)?\[ (\\)?\] [0-9]{3} ' \
    | head -n 1 || true
}

cleanup_worktrees() {
  if [[ "$KEEP_WORKTREES" == "1" ]]; then
    return
  fi

  local wt
  for wt in "$@"; do
    if [[ -d "$wt" ]]; then
      git -C "$REPO_DIR" worktree remove --force "$wt" >/dev/null 2>&1 || true
    fi
  done
}

find_worktree_for_branch() {
  local branch_name="$1"
  local target_ref="refs/heads/$branch_name"
  git -C "$REPO_DIR" worktree list --porcelain | awk -v target="$target_ref" '
    /^worktree / { wt=$2 }
    /^branch / { if ($2 == target) { print wt; exit } }
  '
}

prepare_candidate_worktree() {
  local branch="$1"
  local wt="$2"
  local base_ref="$3"

  local existing_wt
  existing_wt="$(find_worktree_for_branch "$branch" || true)"
  if [[ -n "$existing_wt" ]] && [[ "$existing_wt" != "$wt" ]]; then
    git -C "$REPO_DIR" worktree remove --force "$existing_wt" >/dev/null 2>&1 || true
  fi

  if [[ -d "$wt" ]]; then
    git -C "$REPO_DIR" worktree remove --force "$wt" >/dev/null 2>&1 || true
    rm -rf "$wt"
  fi

  git -C "$REPO_DIR" worktree add -f -B "$branch" "$wt" "$base_ref" >/dev/null
}

if [[ "$FETCH_REMOTE" == "1" ]]; then
  git -C "$REPO_DIR" fetch origin "$BASE_BRANCH" >/dev/null 2>&1 || true
fi
git -C "$REPO_DIR" worktree prune >/dev/null 2>&1 || true

BASE_REF="$BASE_BRANCH"
if [[ "$BASE_REF_MODE" == "remote" ]] && git -C "$REPO_DIR" rev-parse --verify --quiet "origin/$BASE_BRANCH" >/dev/null; then
  BASE_REF="origin/$BASE_BRANCH"
fi

NEXT_LINE="$(get_next_task_line "$BASE_REF")"
if [[ -z "$NEXT_LINE" ]]; then
  echo '{"done":true,"message":"No unchecked tasks found."}'
  exit 10
fi

LINE_CLEAN="$(echo "$NEXT_LINE" | sed -E 's/^\*+//; s/\*+$//; s/\\\[/[/g; s/\\\]/]/g')"
TASK_ID="$(echo "$LINE_CLEAN" | sed -E 's/^- \[ \] ([0-9]{3}) .*/\1/')"
TASK_TEXT="$(echo "$LINE_CLEAN" | sed -E 's/^- \[ \] [0-9]{3} //')"
SLUG="$(echo "$TASK_TEXT" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' | cut -c1-48 | sed -E 's/^-+|-+$//g')"
BRANCH_BASE="feat/${TASK_ID}-${SLUG}"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "{\"done\":false,\"dry_run\":true,\"task_id\":\"$TASK_ID\",\"task\":\"$(json_escape "$TASK_TEXT")\",\"branch_base\":\"$BRANCH_BASE\",\"candidate_count\":$CANDIDATE_COUNT}"
  exit 0
fi

log "Starting task $TASK_ID: $TASK_TEXT"
log "Using $CANDIDATE_COUNT Codex candidate(s)"

candidate_branches=()
candidate_worktrees=()
candidate_prompts=()
candidate_logs=()
candidate_pids=()
candidate_statuses=()

for i in $(seq 1 "$CANDIDATE_COUNT"); do
  branch="${BRANCH_BASE}-c${i}"
  wt="$WORK_ROOT/${RUN_ID}-${TASK_ID}-c${i}"
  prompt_file="$RUN_LOG_DIR/prompt-c${i}.md"
  out_log="$RUN_LOG_DIR/codex-c${i}.log"

  candidate_branches+=("$branch")
  candidate_worktrees+=("$wt")
  candidate_prompts+=("$prompt_file")
  candidate_logs+=("$out_log")

  prepare_candidate_worktree "$branch" "$wt" "$BASE_REF"

  cat >"$prompt_file" <<PROMPT
You are candidate ${i}/${CANDIDATE_COUNT} for task ${TASK_ID} in this repository.

Task line from IMPLEMENTATION_PLAN.md:
- [ ] ${TASK_ID} ${TASK_TEXT}

Hard requirements:
- Follow docs/protocol.md exactly for message payloads and behavior.
- Follow docs/viewbox_spec.md exactly where layout is relevant.
- Work only on task ${TASK_ID}. Do not refactor unrelated areas.
- Update IMPLEMENTATION_PLAN.md and mark task ${TASK_ID} as [x] when complete.
- Run npm ci and npm run verify (or build/lint/test fallback) before finishing.
- Keep media path conventions under /media/**.
- Unknown message types must be ignored safely.

Execution requirements:
- Make all code changes directly.
- Fix any lint/build/test issues you introduce.
- Do not commit or push.
- At the end, summarize changed files and key behavior.
PROMPT

  run_codex_exec "$wt" "$prompt_file" "$out_log" &
  candidate_pids+=("$!")
  log "Launched candidate $i on $branch"
done

for i in $(seq 1 "$CANDIDATE_COUNT"); do
  idx=$((i - 1))
  status=0
  if wait "${candidate_pids[$idx]}"; then
    status=0
  else
    status=$?
  fi
  candidate_statuses+=("$status")
  log "Candidate $i exited with status $status"
done

winner_index=-1
winner_branch=""
winner_worktree=""
verify_log=""
codex_env_error_detected=0

for i in $(seq 1 "$CANDIDATE_COUNT"); do
  idx=$((i - 1))
  wt="${candidate_worktrees[$idx]}"
  branch="${candidate_branches[$idx]}"
  out_log="$RUN_LOG_DIR/verify-c${i}.log"

  if [[ "${candidate_statuses[$idx]}" -eq 86 ]] || [[ "${candidate_statuses[$idx]}" -eq 87 ]]; then
    codex_env_error_detected=1
    log "Candidate $i rejected: Codex session/environment setup error"
    continue
  fi

  if [[ "${candidate_statuses[$idx]}" -ne 0 ]]; then
    log "Candidate $i rejected: Codex execution failed"
    continue
  fi

  if ! git -C "$wt" status --porcelain | grep -Ev '^\?\? public/fixtures/' | grep -q .; then
    log "Candidate $i rejected: no code changes"
    continue
  fi

  if ! verify_worktree "$wt" "$out_log"; then
    log "Candidate $i rejected: verification failed (see $out_log)"
    continue
  fi

  winner_index="$idx"
  winner_branch="$branch"
  winner_worktree="$wt"
  verify_log="$out_log"
  log "Selected candidate $i ($branch)"
  break
done

if [[ "$winner_index" -lt 0 ]]; then
  cleanup_worktrees "${candidate_worktrees[@]}"
  if [[ "$codex_env_error_detected" -eq 1 ]]; then
    echo "{\"done\":false,\"task_id\":\"$TASK_ID\",\"error\":\"Codex session/environment permission error detected. Check ~/.codex ownership and permissions.\",\"logs\":\"$RUN_LOG_DIR\"}"
    exit 42
  fi
  echo "{\"done\":false,\"task_id\":\"$TASK_ID\",\"error\":\"No candidate produced a verified solution.\",\"logs\":\"$RUN_LOG_DIR\"}"
  exit 4
fi

review_log="$RUN_LOG_DIR/review.log"
fix_prompt="$RUN_LOG_DIR/fix-from-review.md"
fix_log="$RUN_LOG_DIR/fix.log"
final_verify_log="$RUN_LOG_DIR/final-verify.log"

run_codex_review "$winner_worktree" "$review_log" || true

cat >"$fix_prompt" <<PROMPT
You are the QA fixer for task ${TASK_ID}.

Task line:
- [x] ${TASK_ID} ${TASK_TEXT}

Review output is in:
- ${review_log}

Actions:
1) Read the review output.
2) Fix any real high/medium severity issues related to this task.
3) Keep scope limited to this task.
4) Re-run npm run verify (or build/lint/test fallback) and ensure green.
5) Do not commit or push.
6) Provide a concise summary of what was fixed.
PROMPT

run_codex_exec "$winner_worktree" "$fix_prompt" "$fix_log" || true
verify_worktree "$winner_worktree" "$final_verify_log"

(
  cd "$winner_worktree"
  git add -A . ':(exclude)public/fixtures' ':(exclude).ralph'
  if git diff --cached --quiet; then
    echo "ERROR: No staged changes for task ${TASK_ID}" >&2
    exit 3
  fi
  git commit -m "feat(${TASK_ID}): ${TASK_TEXT}" >/dev/null
)

winner_commit="$(git -C "$winner_worktree" rev-parse --short HEAD)"

if [[ "$MERGE_TO_BASE" == "1" ]]; then
  git -C "$REPO_DIR" checkout "$BASE_BRANCH" >/dev/null
  if [[ "$FETCH_REMOTE" == "1" ]]; then
    git -C "$REPO_DIR" pull --ff-only origin "$BASE_BRANCH" >/dev/null 2>&1 || true
  fi
  git -C "$REPO_DIR" merge --ff-only "$winner_branch" >/dev/null

  if [[ "$AUTO_PUSH" == "1" ]]; then
    git -C "$REPO_DIR" push origin "$BASE_BRANCH"
  fi
else
  if [[ "$AUTO_PUSH" == "1" ]]; then
    git -C "$winner_worktree" push -u origin "$winner_branch"
  fi
fi

pr_url=""
if [[ "$AUTO_PR" == "1" ]] && command -v gh >/dev/null 2>&1; then
  if [[ "$AUTO_PUSH" != "1" ]]; then
    git -C "$winner_worktree" push -u origin "$winner_branch"
  fi

  existing_pr="$(gh pr list --head "$winner_branch" --state open --json number --jq '.[0].number' || true)"
  if [[ -z "$existing_pr" ]]; then
    pr_url="$(gh pr create --base "$BASE_BRANCH" --head "$winner_branch" --title "feat(${TASK_ID}): ${TASK_TEXT}" --body "Automated Ralph workflow for task ${TASK_ID}." --json url -q .url)"
  else
    pr_url="$(gh pr view "$existing_pr" --json url -q .url)"
  fi

  if [[ "$AUTO_MERGE_PR" == "1" ]]; then
    gh pr merge "$winner_branch" --auto --squash >/dev/null
  fi
fi

cleanup_worktrees "${candidate_worktrees[@]}"

echo "{\"done\":false,\"task_id\":\"$TASK_ID\",\"task\":\"$(json_escape "$TASK_TEXT")\",\"winner_branch\":\"$winner_branch\",\"winner_commit\":\"$winner_commit\",\"verify_log\":\"$verify_log\",\"final_verify_log\":\"$final_verify_log\",\"logs\":\"$RUN_LOG_DIR\",\"pr_url\":\"$pr_url\"}"
