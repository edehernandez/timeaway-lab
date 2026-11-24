#!/bin/sh
set -eu
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
# Purpose: selftest case — results.sh must return a JUnit report with one case of each status as four lines.
cat > "$T/r.xml" <<'X'
<testsuites><testsuite name="a.spec.ts"><testcase name="ROW-1 passes" classname="a.spec.ts" time="0.5"></testcase>
<testcase name="ROW-2 fails" classname="a.spec.ts" time="1"><failure message="x">boom</failure></testcase>
<testcase name="ROW-3 skips" classname="a.spec.ts" time="0"><skipped/></testcase>
<testcase name="ROW-4 &quot;errs&quot;" classname="a.spec.ts" time="2"><error message="e"/></testcase></testsuite></testsuites>
X
out=$(sh "$CHECKS/extractors/results.sh" "$T/r.xml")
[ "$(printf '%s\n' "$out" | grep -c '^case tests/invariants/a.spec.ts::')" = 4 ] || exit 1
for s in passed failed skipped error; do printf '%s\n' "$out" | grep -q " $s " || exit 1; done
