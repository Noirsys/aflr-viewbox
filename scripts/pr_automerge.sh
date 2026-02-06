#!/usr/bin/env bash
set -euo pipefail

LABEL="${AUTO_MERGE_LABEL:-automerge}"
MERGE_METHOD="${MERGE_METHOD:-squash}"
DELETE_BRANCH="${DELETE_BRANCH:-1}"

usage() {
  cat <<'EOF'
Usage:
  scripts/pr_automerge.sh [<pr-number|pr-url|branch-name>]
  scripts/pr_automerge.sh --all

Behavior:
  - Ensures label "automerge" exists.
  - Adds the label to target PR(s).
  - Enables GitHub auto-merge so PR merges after required checks pass.

Environment:
  AUTO_MERGE_LABEL  Label name to use (default: automerge)
  MERGE_METHOD      squash|merge|rebase (default: squash)
  DELETE_BRANCH     1 to delete branch on merge (default), 0 to keep
EOF
}

require_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: required command not found: $cmd" >&2
    exit 2
  fi
}

require_command gh
gh auth status -h github.com >/dev/null
REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"

case "$MERGE_METHOD" in
  squash|merge|rebase) ;;
  *)
    echo "ERROR: MERGE_METHOD must be one of: squash, merge, rebase" >&2
    exit 2
    ;;
esac

ensure_label() {
  gh label create "$LABEL" \
    --color "0e8a16" \
    --description "Enable GitHub auto-merge after required checks pass" \
    >/dev/null 2>&1 || true
}

enable_for_pr() {
  local pr_ref="$1"
  local pr_number
  local delete_flag=()
  local err_file
  local url

  pr_number="$(gh pr view "$pr_ref" --json number -q .number)"
  url="$(gh pr view "$pr_number" --json url -q .url)"

  if [[ "$DELETE_BRANCH" == "1" ]]; then
    delete_flag=(--delete-branch)
  fi

  gh api --method POST "repos/$REPO/issues/$pr_number/labels" -f "labels[]=$LABEL" >/dev/null
  err_file="$(mktemp)"

  if gh pr merge "$pr_number" --auto "--$MERGE_METHOD" "${delete_flag[@]}" >/dev/null 2>"$err_file"; then
    rm -f "$err_file"
    echo "Enabled native auto-merge: $url"
    return 0
  fi

  if grep -q "Protected branch rules not configured" "$err_file"; then
    rm -f "$err_file"
    echo "Label applied for workflow-driven merge (native auto-merge unavailable): $url"
    return 0
  fi

  echo "WARN: failed to enable native auto-merge for $url" >&2
  cat "$err_file" >&2
  rm -f "$err_file"
}

target="${1:-}"
if [[ "${target}" == "-h" || "${target}" == "--help" ]]; then
  usage
  exit 0
fi

ensure_label

if [[ "$target" == "--all" ]]; then
  mapfile -t prs < <(gh pr list --state open --json number -q '.[].number')
  if [[ "${#prs[@]}" -eq 0 ]]; then
    echo "No open PRs found."
    exit 0
  fi

  for pr in "${prs[@]}"; do
    enable_for_pr "$pr"
  done
  exit 0
fi

if [[ -z "$target" ]]; then
  target="$(git rev-parse --abbrev-ref HEAD)"
fi

enable_for_pr "$target"
