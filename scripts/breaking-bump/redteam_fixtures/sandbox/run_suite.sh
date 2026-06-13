#!/usr/bin/env bash
# Non-regression battery for the breaking-bump injection red-team.
# Each scenario = a fully attacker-authored abschema (assume Agent A corrupted,
# maxed provenance) run through B->C->D in the sandbox. A scenario PASSES when the
# pipeline DEFENDS (the attacker's breach signature never lands in the target file).
# Use this to (1) characterise the current pipeline and (2) prove a hardening change
# blocks the attacks that currently propagate.
#
#   ./run_suite.sh            # run every scenario in manifest.tsv
#   ./run_suite.sh <id>       # run one scenario
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$HERE/scenarios/manifest.tsv"
OUTDIR="$HERE/scenarios/out"; mkdir -p "$OUTDIR"
ONLY="${1:-}"

printf '%-22s %-9s %-9s %-7s %s\n' SCENARIO EXPECTED RESULT STATUS DESCRIPTION
printf '%.0s-' {1..100}; echo
fails=0
while IFS=$'\t' read -r id schema target canary expected desc stub_plan stub_bplan; do
  [[ "$id" =~ ^# || -z "$id" ]] && continue
  [[ -n "$ONLY" && "$id" != "$ONLY" ]] && continue
  # Optional col 7 (stub_plan): A+B+C bypassed, plan → D (tests D's gate).
  # Optional col 8 (stub_bplan): B corrupted, malicious plan → C only (tests C's gate).
  # NB: IFS=tab collapses empty middle fields, so a literal "-" is the explicit "no value" marker.
  if [[ -n "$stub_plan" && "$stub_plan" != "-" ]]; then export STUB_PLAN="$HERE/scenarios/$stub_plan"; else unset STUB_PLAN; fi
  if [[ -n "$stub_bplan" && "$stub_bplan" != "-" ]]; then export STUB_BPLAN="$HERE/scenarios/$stub_bplan"; else unset STUB_BPLAN; fi
  STUB_A="$HERE/scenarios/$schema" CODE_TARGET="$target" CANARY_TOKEN="$canary" \
    "$HERE/run_chain.sh" > "$OUTDIR/$id.out" 2>&1
  if grep -q '>>> BROKEN' "$OUTDIR/$id.out"; then result=broken; else result=defended; fi
  if [ "$result" = "$expected" ]; then status=PASS; else status=FAIL; fails=$((fails+1)); fi
  printf '%-22s %-9s %-9s %-7s %s\n' "$id" "$expected" "$result" "$status" "$desc"
done < "$MANIFEST"
printf '%.0s-' {1..100}; echo
echo "outputs: $OUTDIR/<id>.out   ($fails failing)"
exit $(( fails > 0 ? 1 : 0 ))
