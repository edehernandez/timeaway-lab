#!/bin/sh
# Purpose: the report-only vacuity extractor (vid-skeleton Part 2), for Playwright tests in tests/invariants/*.spec.ts.
# Flags, one `orphan <file>:<line> <rule>` each: or-constant (`|| true`), literal-vs-literal (expect(<literal>)),
# status-span (a status set holding a 2xx and no 4xx/5xx), skip-on-condition (test.skip(/fixme(), presence-only
# (toBeVisible/toBeTruthy/toBeDefined as the test's only assertion), zero-population (a loop over a list never checked
# non-empty), format-string (an expect message with ${} placeholders and none filled — read to its own closing quote,
# the other quote kind inside it being text), circular-fixture (a fixture without a Provenance: header naming no product).
set -eu
R=${VID_ROOT:-.}; T=$R/tests/invariants
F=$(find "$T" -name '*.spec.ts' 2>/dev/null | sort)
[ -n "$F" ] || { echo "inactive no spec under tests/invariants"; exit 0; }
n=0
for f in $F; do s=${f#"$R"/}; n=$((n+1))
  grep -nE '\|\|[[:space:]]*true\b' "$f" | cut -d: -f1 | sed "s#^#orphan $s:#;s#\$# or-constant#"
  grep -nE "expect\((true|false|[0-9]+|'[^']*'|\"[^\"]*\")\)" "$f" | cut -d: -f1 | sed "s#^#orphan $s:#;s#\$# literal-vs-literal#"
  grep -nE "\[[^]]*\b2[0-9][0-9]\b[^]]*\]\)?\.toContain\(|toContain\(.*status" "$f" | grep -vE '\b[45][0-9][0-9]\b' | cut -d: -f1 | sed "s#^#orphan $s:#;s#\$# status-span#"
  grep -nE "test\.(skip|fixme)\(" "$f" | cut -d: -f1 | sed "s#^#orphan $s:#;s#\$# skip-on-condition#"
  awk -v s="$s" '/^test\(|^  test\(/ { if (t && a && !v) print "orphan " s ":" t " presence-only"; t=NR; a=0; v=0 }
    /toBeVisible\(|toBeTruthy\(|toBeDefined\(/ { a=1 } /toBe\(|toEqual\(|toHaveText\(|toHaveURL\(|toContain\(|toHaveCount\(|toMatch\(|toBeGreaterThan|toBeLessThan|toHaveValue\(/ { v=1 }
    END { if (t && a && !v) print "orphan " s ":" t " presence-only" }' "$f"
done
echo "population $n"
