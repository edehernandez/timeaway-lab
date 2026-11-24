#!/bin/sh
set -eu
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
# Purpose: selftest case — RULE-005's census must flag a system-clock read outside the team clock, also as SQL
# CURRENT_TIMESTAMP (a second vocabulary), and accept the clock module's own read.
mkdir -p "$T/server/domain/accounts" "$T/server/db"
printf 'export const now = () => new Date()\n' > "$T/server/domain/accounts/clock.ts"
printf 'export const sent = () => Date.now()\n' > "$T/server/domain/accounts/index.ts"
printf 'CREATE TABLE t (at text DEFAULT CURRENT_TIMESTAMP);\n' > "$T/server/db/0001.sql"
out=$(VID_ROOT="$T" sh "$CHECKS/extractors/invariant.clock-reads.sh")
printf '%s\n' "$out" | grep -qx 'ok server/domain/accounts/clock.ts' || exit 1
printf '%s\n' "$out" | grep -q '^orphan server/domain/accounts/index.ts:1 ' && printf '%s\n' "$out" | grep -q '^orphan server/db/0001.sql:1 ' || exit 1
