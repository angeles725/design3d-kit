#!/usr/bin/env bash
# SessionStart hook wrapper — runs sweep-captures.sh over the design repo and emits its output as
# additionalContext so prunable capture garbage surfaces when a session opens.
# Wire from ~/.claude/settings.json (hooks section; wiring owned by the update-config flow). Read-only.
#
# Mirrors sweep-retros-hook.sh shape exactly — same D3_DESIGN_REPO env, same stderr capture (the
# zero-census fail on stderr must not be swallowed), same jq/plain-print fallback.
here="$(cd "$(dirname "$0")" && pwd)"
repo="${D3_DESIGN_REPO:-$HOME/prototipos/three.js}"
out="$("$here/sweep-captures.sh" "$repo" 2>&1)"
if command -v jq >/dev/null 2>&1; then
  jq -n --arg c "$out" \
    '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:("design3d capture sweep:\n"+$c)}}'
else
  # jq missing: fall back to a plain print (still shows in transcript).
  printf 'design3d capture sweep:\n%s\n' "$out"
fi
