#!/usr/bin/env bash
# retro-status.sh — shared helper: read a design3d retro's review-status marker from its LEADING
# HTML-comment block (SELF-IMPROVEMENT.md §Review lifecycle: "tooling parses only the first
# HTML-comment block").
#
# Ported from research-sdd toolbelt (lib/retro-status.sh) for the design3d kit — 2026-07-16.
# Changes vs the source, and why:
#   * retro_review_status is a VERBATIM port (algorithm, regressions R1-001/R1-002/R3-001 guards,
#     idempotent-source guard, always-return-0 contract). The lib exists because two hand-copied
#     awk pipelines drifted between research-sdd's sweep-retros.sh and stage-retro.sh; both design3d
#     callers must source THIS file and fail closed if it does not define the readers.
#   * ADDED retro_marker_date (design3d-specific): the stale-marker check in sweep-retros.sh needs
#     the DATE the marker carries ("applied 2026-07-14 · kit v1.4"), so adjudication date can be
#     compared against dated "## Appended live — YYYY-MM-DD" sections appended later. research-sdd
#     has no such function because its retros are append-closed after adjudication; design3d's
#     retro-vivo rule keeps appending to a file whose marker may already read applied/dismissed.
#
#   retro_review_status <file>
#     Echoes the lowercased status word (applied/dismissed/pending/…) found in the retro's leading
#     comment block, or nothing when there is no marker there. Always returns 0 (a non-matching
#     grep must yield empty output, never abort a caller running under `set -o pipefail`).
#
#   retro_marker_date <file>
#     Echoes the YYYY-MM-DD date that immediately follows the status word in the same leading-block
#     marker (e.g. "applied 2026-07-14"), or nothing when the marker carries no parseable date.
#     Always returns 0, same contract as above.
#
# Algorithm — scan ONLY the leading HTML-comment block:
#   * print consecutive lines that (after optional leading spaces) OPEN an HTML comment ('<!--'),
#   * SKIP blank lines (a leading blank is not the block terminator — R1-002),
#   * STOP at the first line that is neither a comment nor blank (so a body marker never gates,
#     and a plain-prose or '# heading' first line ends the scan immediately — R3-001).
# Then pull the FIRST '<!--'-ANCHORED 'review-status: <word>' marker out of that region. Anchoring
# on '<!--' means a bare 'review-status:' substring in prose is ignored (R1-001).

# Idempotent: safe to source more than once (both SUTs may pull it in the same shell in tests).
if ! declare -F retro_review_status >/dev/null 2>&1; then
  retro_review_status() {
    local f="${1:-}"
    [ -n "$f" ] && [ -f "$f" ] || return 0
    awk '
      /^[[:space:]]*<!--/ { print; next }   # a comment line: keep scanning the block
      /^[[:space:]]*$/     { next }          # blank line: skip, do not terminate (R1-002)
      { exit }                               # first non-comment, non-blank line: stop (R3-001)
    ' "$f" 2>/dev/null \
      | grep -oiE '<!--[[:space:]]*review-status:[[:space:]]*[a-z]+' \
      | head -1 \
      | sed -E 's/.*:[[:space:]]*//' \
      | tr 'A-Z' 'a-z'
    return 0
  }
fi

if ! declare -F retro_marker_date >/dev/null 2>&1; then
  retro_marker_date() {
    local f="${1:-}"
    [ -n "$f" ] && [ -f "$f" ] || return 0
    # Same leading-block scan as retro_review_status, then the date token that directly follows
    # the status word ("<!-- review-status: applied 2026-07-14 · …" → "2026-07-14").
    awk '
      /^[[:space:]]*<!--/ { print; next }
      /^[[:space:]]*$/     { next }
      { exit }
    ' "$f" 2>/dev/null \
      | grep -oiE '<!--[[:space:]]*review-status:[[:space:]]*[a-z]+[[:space:]]+[0-9]{4}-[0-9]{2}-[0-9]{2}' \
      | head -1 \
      | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}'
    return 0
  }
fi
