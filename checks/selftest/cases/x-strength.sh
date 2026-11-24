#!/bin/sh
set -eu
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
# Purpose: selftest case — the strength extractor reads at the function grain: a Tier-0 row bound to an
# existence-only function is an orphan though a value test sits beside it in the same file; a row naming no
# function is unbound; a value-asserting row is ok.
mkdir -p "$T/tests/invariants"
printf 'ROW-001 | behavior | X | a | n/a | o | REQ-1 | tests/invariants/a.spec.ts\nROW-002 | behavior | X | a | n/a | o | REQ-1 | tests/invariants/a.spec.ts\nROW-003 | behavior | X | a | n/a | o | REQ-1 | tests/invariants/a.spec.ts\n' > "$T/INVENTORY.md"
cat > "$T/tests/invariants/a.spec.ts" <<'X'
test('ROW-001 shows the figure', async () => {
  await expect(page.getByText('left')).toBeVisible()
})
test('ROW-002 the figure is right', async () => {
  expect(await left()).toBe(20)
})
X
out=$(VID_ROOT="$T" VID_PROTECTED_ROWS='ROW-001 ROW-002 ROW-003' sh "$CHECKS/extractors/strength.ledger.sh")
printf '%s\n' "$out" | grep -q '^orphan tests/invariants/a.spec.ts:1 existence ROW-001' || exit 1
printf '%s\n' "$out" | grep -qx 'ok tests/invariants/a.spec.ts:ROW-002' || exit 1
printf '%s\n' "$out" | grep -qx 'orphan tests/invariants/a.spec.ts unbound-row ROW-003' || exit 1
