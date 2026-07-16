#!/usr/bin/env bash
# verify-kit-clean.sh — are the KIT repos clean + committed (+ pushed, when a remote exists)?
#
# Ported from research-sdd toolbelt (verify-kit-clean.sh) for the design3d kit — 2026-07-16.
# Changes vs the source, and why:
#   * Default is a LIST of kit repos ($HOME/.claude/skills/design3d and
#     $HOME/.claude/skills/anti-ai-ui) instead of "the repo containing this script": the same
#     disease — accepted kit work sitting uncommitted — was found in BOTH kits in the same
#     session (2026-07-16), so one check sweeps both. Self-location would also only ever see
#     design3d now that the toolbelt lives inside it. Override with explicit repo args as in
#     the source; each repo gets its own per-repo report block (format unchanged), and the
#     exit code is the WORST per-repo code.
#   * The sync check is UNCHANGED — the source already degrades gracefully when no upstream is
#     configured (prints an informational line, rc stays 0, never errors). design3d has no remote
#     yet, so that branch of the source is simply the one this kit exercises today.
#   * The source's advisory check for a mis-committed `audits/` dir (research-sdd §13, target-scoped
#     evidence) is ADAPTED to design3d's equivalent misplacement: run evidence (`runs/`) or design
#     dirs (`disenos/`) at the KIT root. Run evidence is design-repo-scoped; the kit must stay
#     evidence-free. Advisory only — it never changes the exit code, same as the source.
#   * Messaging retargeted: design3d's dirty-kit hazard is applying retro deltas (or letting a
#     concurrent reviewer score the kit) over an uncommitted tree, not retro-branch squashes.
#
# NOTE on silence: like the source, this checker ALWAYS prints its report. The silent-when-clean
# behavior that makes it a free SessionStart hook lives in the WRAPPER (verify-kit-clean-hook.sh),
# exactly as in research-sdd — the wrapper exits 0 with no output when this script returns 0.
#
# Usage: verify-kit-clean.sh [<kit-repo>...]   (default: ~/.claude/skills/design3d
#                                                         ~/.claude/skills/anti-ai-ui)
# Exit (worst across repos): 0 = clean (committed, and pushed when an upstream exists) · 1 = dirty
#       tree OR unpushed commits · 2 = not a git repo / bad args.
set -uo pipefail
if [ "$#" -gt 0 ]; then
  repos=("$@")
else
  repos=("$HOME/.claude/skills/design3d" "$HOME/.claude/skills/anti-ai-ui")
fi

check_repo() {
local repo="$1"
[ -d "$repo" ] || { echo "usage: verify-kit-clean.sh [<kit-repo>...]" >&2; return 2; }
root="$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null)" || { echo "verify-kit-clean: not a git repo: $repo" >&2; return 2; }
branch="$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null)"

echo "== verify-kit-clean: $(basename "$root") (branch: ${branch:-?}) =="
rc=0

# 1. Working tree — any staged / unstaged / untracked change makes it DIRTY.
porcelain="$(git -C "$root" status --porcelain 2>/dev/null)"
if [ -n "$porcelain" ]; then
  staged=$(git -C "$root" diff --cached --name-only 2>/dev/null | grep -c . || true)
  unstaged=$(git -C "$root" diff --name-only 2>/dev/null | grep -c . || true)
  untracked=$(git -C "$root" ls-files --others --exclude-standard 2>/dev/null | grep -c . || true)
  echo "   working tree : DIRTY — uncommitted: ${staged} staged · ${unstaged} unstaged · ${untracked} untracked"
  rc=1
else
  echo "   working tree : CLEAN"
fi

# 2. Sync — local commits not on the upstream. Prefer the configured tracking ref (@{upstream});
# if none is set but a remote branch exists (repo pushed WITHOUT -u), fall back to origin/<branch>.
# design3d has no remote today: both probes come back empty and this check degrades to an
# informational line with rc untouched (source behavior, preserved).
upstream="$(git -C "$root" rev-parse --abbrev-ref '@{upstream}' 2>/dev/null || true)"
if [ -z "$upstream" ] && [ -n "$branch" ] && [ "$branch" != "HEAD" ] \
   && git -C "$root" rev-parse --verify -q "origin/$branch" >/dev/null 2>&1; then
  upstream="origin/$branch"
fi
if [ -n "$upstream" ]; then
  ahead=$(git -C "$root" rev-list --count "${upstream}..HEAD" 2>/dev/null || echo 0)
  if [ "${ahead:-0}" -gt 0 ]; then
    echo "   sync         : ${ahead} local commit(s) NOT pushed to ${upstream}"
    rc=1
  else
    echo "   sync         : up to date with ${upstream}"
  fi
else
  echo "   sync         : (no upstream configured for ${branch:-HEAD} — nothing to be un-pushed against)"
fi

# 3. Evidence location (ADVISORY) — run evidence is DESIGN-REPO-scoped. A `runs/` or `disenos/`
# dir at the kit root is almost certainly misplaced run output. Advisory WARN only: it does NOT
# change the clean/dirty verdict or the exit-code contract (rc stays driven by checks 1–2).
for misplaced in runs disenos; do
  if [ -d "$root/$misplaced" ]; then
    echo "   WARN: $misplaced/ exists at the kit root — run evidence is design-repo-scoped; this is likely misplaced run output. Relocate to the design repo or remove."
  fi
done

if [ "$rc" = 0 ]; then
  echo "   verdict      : clean — safe to apply retro deltas / start clean kit work"
else
  echo "   verdict      : NOT clean — commit/stash before applying retro deltas (an unreviewed dirty kit reads as scope creep)"
fi
echo "== exit $rc =="
return $rc
}

worst=0
for repo in "${repos[@]}"; do
  check_repo "$repo"; r=$?
  [ "$r" -gt "$worst" ] && worst=$r
done
exit $worst
