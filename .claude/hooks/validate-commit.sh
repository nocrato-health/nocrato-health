#!/bin/bash
# nocrato-hook: validate-commit (PreToolUse Bash)
# Checks that git commit messages follow Conventional Commits.
# ADVISORY: emits a warning via additionalContext, never blocks the call.
# Solo dev — pragmatism > enforcement.

INPUT=$(cat)

CMD=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).tool_input?.command||'')}catch{}})" 2>/dev/null)

if [[ ! "$CMD" =~ ^git[[:space:]]+commit ]]; then
  exit 0
fi

# Extract message from -m "..." or -m '...'
MSG=""
if [[ "$CMD" =~ -m[[:space:]]+\"([^\"]+)\" ]]; then
  MSG="${BASH_REMATCH[1]}"
elif [[ "$CMD" =~ -m[[:space:]]+\'([^\']+)\' ]]; then
  MSG="${BASH_REMATCH[1]}"
fi

# Heredoc commits: can't reliably extract — skip
if [[ -z "$MSG" ]]; then
  exit 0
fi

SUBJECT=$(echo "$MSG" | head -1)
WARN=""

if ! [[ "$SUBJECT" =~ ^(feat|fix|docs|style|refactor|perf|test|build|ci|chore)(\(.+\))?(\!)?:[[:space:]].+ ]]; then
  WARN="Commit subject does not match Conventional Commits: <type>(<scope>): <subject>. Valid types: feat fix docs style refactor perf test build ci chore."
elif [[ ${#SUBJECT} -gt 72 ]]; then
  WARN="Commit subject is ${#SUBJECT} chars (> 72). Consider shortening."
fi

if [[ -n "$WARN" ]]; then
  cat <<EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"⚠️ commit-lint advisory: $WARN Message: \"$SUBJECT\""}}
EOF
fi

exit 0
