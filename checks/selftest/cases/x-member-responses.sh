#!/bin/sh
set -eu
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
# Purpose: selftest case — RULE-002's census must flag a member route returning request data with no *ForViewer
# shaper, and pass one that uses it; admin routes are outside its population.
mkdir -p "$T/server/api/admin"
printf 'import { listMonth } from "~~/server/domain/requests"\nexport default () => listMonth()\n' > "$T/server/api/calendar.get.ts"
printf 'import { mineForViewer } from "~~/server/domain/requests"\nexport default () => mineForViewer()\n' > "$T/server/api/requests.get.ts"
printf 'import { listPending } from "~~/server/domain/requests"\nexport default () => listPending()\n' > "$T/server/api/admin/pending.get.ts"
out=$(VID_ROOT="$T" sh "$CHECKS/extractors/invariant.member-responses.sh")
printf '%s\n' "$out" | grep -q '^orphan server/api/calendar.get.ts ' && printf '%s\n' "$out" | grep -qx 'ok server/api/requests.get.ts' || exit 1
printf '%s\n' "$out" | grep -q 'admin/pending' && exit 1; exit 0
