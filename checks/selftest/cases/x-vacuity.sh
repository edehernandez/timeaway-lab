#!/bin/sh
set -eu
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
# Purpose: selftest case — the vacuity extractor must flag a status span with no error code, an or-constant and a
# presence-only test, and leave a value assertion alone.
mkdir -p "$T/tests/invariants"
cat > "$T/tests/invariants/a.spec.ts" <<'X'
test('ROW-1 status', async () => {
  expect([200, 201, 302]).toContain(res.status())
})
test('ROW-2 visible', async () => {
  await expect(page.getByText('Days left')).toBeVisible()
})
test('ROW-3 value', async () => {
  expect(ok || true).toBe(true)
  expect(left).toBe(20)
})
X
out=$(VID_ROOT="$T" sh "$CHECKS/extractors/vacuity.ledger.sh")
printf '%s\n' "$out" | grep -qx 'orphan tests/invariants/a.spec.ts:2 status-span' || exit 1
printf '%s\n' "$out" | grep -qx 'orphan tests/invariants/a.spec.ts:4 presence-only' || exit 1
printf '%s\n' "$out" | grep -qx 'orphan tests/invariants/a.spec.ts:8 or-constant' || exit 1
