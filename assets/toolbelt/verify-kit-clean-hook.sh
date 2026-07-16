#!/usr/bin/env bash
# SessionStart hook wrapper — runs verify-kit-clean.sh and, ONLY when the kit is NOT clean, emits its
# report as additionalContext so a dirty/unpushed design3d kit surfaces when a session opens. A clean
# kit emits nothing — no session-start noise (this wrapper, not the checker, owns the silence).
# Read-only. Wire from ~/.claude/settings.json (hooks section; wiring owned by the update-config flow).
#
# Ported from research-sdd toolbelt (verify-kit-clean-hook.sh) for the design3d kit — 2026-07-16.
# Changes vs the source: header text retargeted; the checker's default is the BOTH-KITS list
# (~/.claude/skills/design3d + ~/.claude/skills/anti-ai-ui), so no argument is passed. Logic is
# otherwise identical, including the rc=1 (really dirty) vs rc=2 (gate could not run) banner split.
here="$(cd "$(dirname "$0")" && pwd)"
out="$("$here/verify-kit-clean.sh" 2>&1)"; rc=$?
[ "$rc" = 0 ] && exit 0                         # clean → stay silent
if [ "$rc" = 1 ]; then
  hdr="A skill KIT repo is NOT clean — commit/stash (and push, once a remote exists) before applying retro deltas or starting kit work:"
else
  hdr="kit-clean check could not run everywhere (exit $rc — misconfigured path or not a git repo):"
fi
if command -v jq >/dev/null 2>&1; then
  jq -n --arg h "$hdr" --arg c "$out" \
    '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:($h+"\n"+$c)}}'
else
  printf '%s\n%s\n' "$hdr" "$out"
fi
