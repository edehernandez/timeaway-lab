#!/bin/sh
set -eu
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
# Purpose: selftest case — RULE-001's census must flag a page computing days left itself, also written as
# "- allowance" (a second vocabulary), and pass a route taking it from balanceFor(; a route that only sets an allowance is no site.
mkdir -p "$T/server/api" "$T/app/pages"
printf 'import { balanceFor } from "~~/server/domain/requests"\nexport default () => balanceFor(1)\n' > "$T/server/api/balance.get.ts"
printf '<script setup>const left = 0 - allowance + 3</script>\n' > "$T/app/pages/me.vue"
mkdir -p "$T/server/api/admin"; printf 'export default () => setAllowance(body.allowance)\n' > "$T/server/api/admin/allowance.post.ts"
out=$(VID_ROOT="$T" sh "$CHECKS/extractors/invariant.balance-sites.sh")
printf '%s\n' "$out" | grep -qx 'ok server/api/balance.get.ts' && printf '%s\n' "$out" | grep -q '^orphan app/pages/me.vue ' || exit 1
printf '%s\n' "$out" | grep -q 'allowance.post.ts' && exit 1; exit 0
