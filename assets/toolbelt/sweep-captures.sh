#!/usr/bin/env bash
# sweep-captures.sh — census prunable capture garbage across a design repo, so superseded attempt
# frames and suffixed per-shot working frames do not accumulate silently. Closes the SKILL v1.8
# DEFERRED "toolbelt capture-gc sweep script" item.
#
# Ported pattern from sweep-retros.sh (same fail-loud zero-census rule, same hook wrapper shape).
# Differences vs sweep-retros.sh:
#   * CALLS capture-gc.mjs in dry-run (node process) instead of reading text files.
#   * DISCOVERY: finds design dirs at two depths — disenos/*/ (top-level groups, may cover children
#     via capture-gc's one-level child enumeration) AND disenos/*/ where the parent has no runs/
#     (per-asset subdirs whose parent is a pure organizational dir with no its own runs/).
#     Dedup rule: if a dir's parent also has runs/, capture-gc called on the parent already covers
#     it — skip the child to avoid double-counting.
#   * NO lib dependency: we don't need the retro-status readers.
#   * CENSUS RULE (same as sweep-retros): FAIL LOUD (exit 1) when zero design dirs resolve.
#   * Read-only: never deletes anything. Use capture-gc.mjs --apply on a specific dir to prune it.
#
# Usage: sweep-captures.sh [<design-repo-root>]   (default: cwd)

ROOT="${1:-$PWD}"
[ -d "$ROOT" ] || { echo "usage: sweep-captures.sh [<design-repo-root>]" >&2; exit 2; }

here="$(cd "$(dirname "$0")" && pwd)"
TOOL="$(cd "$here/.." && pwd)/capture-gc.mjs"
if [ ! -f "$TOOL" ]; then
  echo "sweep-captures: cannot find capture-gc.mjs at $TOOL" >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "sweep-captures: node not found in PATH — required to run capture-gc.mjs" >&2
  exit 1
fi

total_dirs=0
total_prunable_files=0
total_bytes=0
prunable_rows=()   # lines to print for dirs with prunable files

# Discover design dirs: find all dirs that directly contain runs/, then emit only the
# "group roots" (dirs whose parent does NOT also have runs/). capture-gc's one-level child walk
# then covers any child dirs in the same call, avoiding double-counting.
while IFS= read -r runs_dir; do
  [ -n "$runs_dir" ] || continue
  design_dir="$(dirname "$runs_dir")"
  parent_dir="$(dirname "$design_dir")"

  # Skip child dirs already covered by their parent's capture-gc call.
  [ -d "$parent_dir/runs" ] && continue

  total_dirs=$((total_dirs + 1))

  # Run capture-gc in dry-run (no --apply); capture both stdout and stderr.
  out="$(node "$TOOL" "$design_dir" 2>&1)"

  # Parse census line: "census: promoted N review(s) / pruned N file(s) / X.XX MB"
  census_line="$(echo "$out" | grep '^census:')"
  prunable_files="$(echo "$census_line" | grep -oE 'pruned [0-9]+' | grep -oE '[0-9]+')"
  prunable_mb="$(echo "$census_line"   | grep -oE '[0-9]+\.[0-9]+ MB' | head -1)"

  [ -z "$prunable_files" ] && prunable_files=0
  [ -z "$prunable_mb"    ] && prunable_mb="0.00 MB"

  if [ "$prunable_files" -gt 0 ]; then
    prunable_rows+=("$(printf 'PRUNABLE  %s\n          %s file(s) / %s' \
      "$design_dir" "$prunable_files" "$prunable_mb")")
    total_prunable_files=$((total_prunable_files + prunable_files))
    # Accumulate bytes for the total (MB -> bytes, integer approximation).
    mb_val="${prunable_mb%% *}"
    bytes_approx="$(awk "BEGIN{printf \"%d\", $mb_val * 1048576}")"
    total_bytes=$((total_bytes + bytes_approx))
  fi
done < <(find "$ROOT/disenos" -maxdepth 4 -name 'runs' -type d -not -path '*/.git/*' 2>/dev/null | sort)

# CENSUS (kit delta #16 pattern): a sweep that resolved ZERO design dirs must not report green.
if [ "$total_dirs" -eq 0 ]; then
  echo "sweep-captures: FAIL — census is ZERO: no design dirs with runs/ found under $ROOT/disenos." >&2
  echo "sweep-captures: a sweep over an empty set is a false green. Wrong root, moved convention, or genuinely no designs — verify which before trusting anything." >&2
  exit 1
fi

if [ "${#prunable_rows[@]}" -gt 0 ]; then
  for row in "${prunable_rows[@]}"; do
    echo "$row"
  done
fi

total_mb="$(awk "BEGIN{printf \"%.2f\", $total_bytes / 1048576}")"
echo ""
echo "Census: ${total_dirs} design group(s) swept  ·  ${total_prunable_files} prunable file(s)  ·  ~${total_mb} MB freeable"
if [ "$total_prunable_files" -gt 0 ]; then
  echo "Prune a dir: node assets/capture-gc.mjs <design-dir> [--apply] [--dedup]"
fi
