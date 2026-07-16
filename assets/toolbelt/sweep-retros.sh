#!/usr/bin/env bash
# sweep-retros.sh — surface un-reviewed design3d retro proposals across a design repo, so no
# proposed kit delta sits unreviewed (SELF-IMPROVEMENT.md §Review lifecycle).
#
# Ported from research-sdd toolbelt (sweep-retros.sh) for the design3d kit — 2026-07-16.
# Changes vs the source, and why:
#   * NO TARGETS.md registry: design3d has one design repo, not a fleet. The repo root is $1
#     (default: cwd) and retros are discovered at <root>/disenos/*/runs/*-retro.md — the kit's
#     actual convention (SELF-IMPROVEMENT.md: "<design-dir>/runs/<YYYY-MM-DD>-retro.md").
#     FUTURE WORK (out of scope, deliberately not implemented): the anti-ai-ui kit keeps a
#     corpus/retros/*.md convention under its own skill dir; sweeping skill dirs is a different
#     trust boundary and a different registry problem — do not bolt it on here.
#   * STALE-MARKER detection (design3d-specific, research-sdd does NOT have this): a retro whose
#     marker reads applied/dismissed but which contains "## Appended live — YYYY-MM-DD" sections
#     dated AFTER the marker's own date is NOT skipped — it is flagged STALE-MARKER. design3d's
#     retro-vivo rule keeps appending to adjudicated retros; the cinemex 2026-07-13 retro carried
#     8 candidate deltas invisible inside an "applied 2026-07-14" marker until a manual read found
#     them. Fail closed: an applied/dismissed marker with NO parseable date is also flagged when
#     appended-live sections exist (a marker that cannot prove it postdates its content does not
#     get to hide it).
#   * CENSUS RULE (kit delta #16, GATES.md §instrument corollaries): the sweep reports how many
#     retro files it scanned and FAILS LOUD (exit 1) when the scan resolves ZERO files — a sweep
#     over an empty set is a false green.
#   * Aging env var renamed RSDD_RETRO_AGE_DAYS → D3_RETRO_AGE_DAYS (default 7, unchanged).
#   * The source's MISSING-RETRO fleet pass (Feature #25b) is NOT ported: it keys on research-sdd's
#     corpus block files (*-block<N>.md), a concept design3d does not have. The analogous signal
#     (a design's runs/ advancing with no fresh retro) is future work.
#   * The source's truncated-path WARN (TARGETS.md '...' entries) is dropped with the registry.
# Read-only: it never edits anything. Exit: 0 = swept (report printed) · 1 = zero-file census or
# missing helper · 2 = bad args.
#
# Usage: sweep-retros.sh [<design-repo-root>]     (default: cwd)

ROOT="${1:-$PWD}"
[ -d "$ROOT" ] || { echo "usage: sweep-retros.sh [<design-repo-root>]" >&2; exit 2; }

# Shared review-status reader — single source of truth for the marker logic (this sweeper and any
# future stage/apply tooling must source it, so the leading-comment-block scan can never drift
# between callers — the drift that created research-sdd's lib in the first place).
LIB="$(cd "$(dirname "$0")" && pwd)/lib/retro-status.sh"
if [ ! -f "$LIB" ]; then
  echo "sweep-retros: cannot find helper $LIB" >&2
  exit 1
fi
# shellcheck source=lib/retro-status.sh
. "$LIB"
# Fail closed: existence of $LIB is not enough — the source must have DEFINED the readers.
# This script does not use `set -e`, so a failed/partial/syntax-broken source would otherwise be
# swallowed and every retro would silently read as 'none' (fail-open). Abort before any work.
declare -F retro_review_status >/dev/null 2>&1 || { echo "sweep-retros: helper $LIB failed to define retro_review_status" >&2; exit 1; }
declare -F retro_marker_date   >/dev/null 2>&1 || { echo "sweep-retros: helper $LIB failed to define retro_marker_date" >&2; exit 1; }

# AGING (ported): each PENDING retro is AGED from its git FIRST-COMMIT (added) date so a stale
# proposal can't sit unreviewed; the queue is REORDERED oldest-first and items past a threshold are
# TAGGED ESCALATED. This only SORTS + LABELS to help the human — it never auto-applies/auto-dismisses
# anything (propose-never-apply).
now="$(date +%s)"
age_days="${D3_RETRO_AGE_DAYS:-7}"   # ESCALATE pending items older than this many days (override via env)
pending=0; stale=0; total=0
pending_rows=()   # "<epoch>\t<f>\t<design>\t<deltas>\t<status>\t<age_d>\t<tag>" for oldest-first sort
stale_rows=()     # "<f>\t<status>\t<marker_date>\t<newest_append>"

# Resolve retros under the kit's convention: disenos/<design>/runs/*-retro.md. DEDUP by canonical
# path (symlinked/duplicated design dirs count once). Index/manifest files are excluded as in the
# source (generated tables of contents are not proposals).
declare -A d3_seen_retro=()
while IFS= read -r f; do
  [ -n "$f" ] || continue
  key="$(realpath -- "$f" 2>/dev/null || printf '%s' "$f")"
  [ -n "${d3_seen_retro[$key]:-}" ] && continue
  d3_seen_retro[$key]=1
  total=$((total + 1))
  design_dir="$(dirname "$(dirname "$f")")"
  # Honor the marker only in the retro's LEADING HTML-comment block (see lib/retro-status.sh):
  # a marker-shaped string in the body or in heading/comment prose must not exclude an un-reviewed retro.
  status=$(retro_review_status "$f")
  case "$status" in
    applied|dismissed)
      # STALE-MARKER check: an adjudicated marker only covers the content that existed at its date.
      # "## Appended live — YYYY-MM-DD" sections dated AFTER the marker date mean content was
      # appended after adjudication — the retro must NOT be skipped (the 8-invisible-candidates hole).
      mdate=$(retro_marker_date "$f")
      newest_append="$(grep -E '^##[[:space:]]+Appended live' "$f" 2>/dev/null \
        | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | sort | tail -1)"
      if [ -n "$newest_append" ] && { [ -z "$mdate" ] || [[ "$newest_append" > "$mdate" ]]; }; then
        stale=$((stale + 1))
        stale_rows+=("$(printf '%s\t%s\t%s\t%s' "$f" "$status" "${mdate:-no-date}" "$newest_append")")
      fi
      continue ;;
  esac
  pending=$((pending + 1))
  deltas=$(grep -cE '^\| *[0-9]+ \|' "$f" 2>/dev/null)
  # Age from the git FIRST-COMMIT date of THIS file (when it entered review), falling back to file
  # mtime when the file is untracked or the dir is not a git repo — a non-git repo never crashes the sweep.
  epoch=""
  added="$(git -C "$design_dir" log --follow --diff-filter=A --format=%aI -1 -- "$f" 2>/dev/null)"
  [ -n "$added" ] && epoch="$(date -d "$added" +%s 2>/dev/null || echo '')"
  [ -n "$epoch" ] || epoch="$(stat -c %Y "$f" 2>/dev/null || echo "$now")"
  age_s=$(( now - epoch )); [ "$age_s" -lt 0 ] && age_s=0
  age_d=$(( age_s / 86400 ))
  tag=""; [ "$age_d" -gt "$age_days" ] && tag="  ·  ESCALATED (aged ${age_d}d)"
  pending_rows+=("$(printf '%s\t%s\t%s\t%s\t%s\t%s\t%s' \
    "$epoch" "$f" "$(basename "$design_dir" 2>/dev/null || basename "$(dirname "$f")")" \
    "${deltas:-?}" "${status:-none}" "$age_d" "$tag")")
done < <(find "$ROOT/disenos" -maxdepth 3 -path '*/runs/*-retro.md' -not -path '*/.git/*' -not -iname '*index*.md' 2>/dev/null | sort)

# CENSUS (kit delta #16): a sweep that resolved ZERO retro files must not report a green summary.
if [ "$total" -eq 0 ]; then
  echo "sweep-retros: FAIL — census is ZERO: no files matched $ROOT/disenos/*/runs/*-retro.md." >&2
  echo "sweep-retros: a sweep over an empty set is a false green (kit delta #16). Wrong root, moved convention, or genuinely no retros — verify which before trusting anything." >&2
  exit 1
fi

# Pending queue oldest-first (smallest first-commit epoch on top) so the most-stale proposals lead.
if [ "${#pending_rows[@]}" -gt 0 ]; then
  while IFS=$'\t' read -r _ep f dsg deltas status age_d tag; do
    echo "PENDING       $f"
    echo "              design: $dsg  ·  ~${deltas} proposed deltas  ·  status: ${status}  ·  age: ${age_d}d${tag}"
  done < <(printf '%s\n' "${pending_rows[@]}" | sort -n -t$'\t' -k1,1)
fi

# Stale-marker queue: adjudicated markers hiding post-adjudication content.
if [ "${#stale_rows[@]}" -gt 0 ]; then
  while IFS=$'\t' read -r f status mdate newest; do
    echo "STALE-MARKER  $f (content appended after adjudication)"
    echo "              marker: ${status} ${mdate}  ·  newest '## Appended live' section: ${newest} — re-adjudicate or reset the marker to pending"
  done < <(printf '%s\n' "${stale_rows[@]}")
fi

echo ""
echo "Census: ${total} retro file(s) scanned under $ROOT/disenos  ·  ${pending} pending  ·  ${stale} stale-marker."
if [ "$pending" -eq 0 ] && [ "$stale" -eq 0 ]; then
  echo "Nothing to review."
else
  echo "For each PENDING retro: review it, apply or dismiss its deltas in the kit, then set the top"
  echo "marker to '<!-- review-status: applied <date> · kit v<version> -->' (or dismissed)."
  echo "For each STALE-MARKER retro: the marker predates its content — review the appended sections,"
  echo "then re-date the marker (or reset it to pending until adjudicated)."
fi
