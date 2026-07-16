#!/usr/bin/env bash
# SessionStart hook wrapper — runs sweep-retros.sh over the design repo and emits its output as
# additionalContext so pending / stale-marker design3d retros surface when a session opens.
# Wire from ~/.claude/settings.json (hooks section; wiring owned by the update-config flow). Read-only.
#
# Ported from research-sdd toolbelt (sweep-retros-hook.sh) for the design3d kit — 2026-07-16.
# Changes vs the source, and why:
#   * The design repo root is passed explicitly (D3_DESIGN_REPO env, default ~/prototipos/three.js)
#     — design3d has no TARGETS.md, so the sweeper needs a root argument.
#   * stderr is CAPTURED (2>&1), not discarded (source used 2>/dev/null): the sweeper's zero-census
#     failure (kit delta #16) reports on stderr, and a wrapper that swallows it would reintroduce
#     the exact false green the census rule exists to kill.
here="$(cd "$(dirname "$0")" && pwd)"
repo="${D3_DESIGN_REPO:-$HOME/prototipos/three.js}"
out="$("$here/sweep-retros.sh" "$repo" 2>&1)"
if command -v jq >/dev/null 2>&1; then
  jq -n --arg c "$out" \
    '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:("design3d retro sweep:\n"+$c)}}'
else
  # jq missing: fall back to a plain print (still shows in transcript).
  printf 'design3d retro sweep:\n%s\n' "$out"
fi
