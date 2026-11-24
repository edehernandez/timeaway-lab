#!/bin/sh
# Purpose: the report-only strength extractor (vid-skeleton Part 2): for each Tier-0 row (`sh checks/inventory.sh
# protected`) whose test cites a file, the test FUNCTION naming the row id — a test('ROW-…') title, or a table row of a
# parameterised test naming it — is classified on the ladder Existence → Value; an orphan is a Tier-0 row whose
# strongest assertion there is Existence (toBeVisible/toBeTruthy/toBeDefined, a count above zero, with no expected
# value), or `orphan <file> unbound-row <row>` when no function names it. A value compared with an expected one is Value.
set -eu
R=${VID_ROOT:-.}
ROWS=${VID_PROTECTED_ROWS:-$(cat "$R/protected-rows" 2>/dev/null || cd "$R" && sh checks/inventory.sh protected 2>/dev/null | grep -oE '^ROW-[0-9]+' | sort -u || true)}
CITED=$(for r in $ROWS; do grep -E "^$r \|" "$R/INVENTORY.md" | awk -F' \\| ' -v r="$r" '$8 ~ /^tests\// { print r " " $8 }'; done)
[ -n "$CITED" ] || { echo "inactive no Tier-0 row cites a test yet"; exit 0; }
printf '%s\n' "$CITED" | while read -r r f; do
  [ -f "$R/$f" ] || { echo "orphan $f unbound-row $r"; continue; }
  out=$(awk -v r="$r" 'index($0, r) && /test\(|\[|\{/ { on=1; ln=NR } on && /^\}\)|^  \}\)/ { on=0 }
    on && /toBe\(|toEqual\(|toHaveText\(|toHaveURL\(|toContain\(|toHaveCount\(|toMatch\(|toBeGreaterThan|toBeLessThan|toHaveValue\(|toStrictEqual\(/ { v=1 }
    on && /toBeVisible\(|toBeTruthy\(|toBeDefined\(/ { e=1 } END { if (!ln) print "unbound"; else if (!v) print "existence " ln }' "$R/$f")
  case "$out" in unbound) echo "orphan $f unbound-row $r" ;; existence*) echo "orphan $f:${out#existence } existence $r" ;; *) echo "ok $f:$r" ;; esac
done
