#!/bin/sh
set -eu
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
# Purpose: selftest case — the collected-fields census must flag a stored column nothing reads, also when it is
# declared with integer( (a second vocabulary), and pass the one read in server/domain.
mkdir -p "$T/server/db" "$T/server/domain/x"
printf "export const t = x('t', {\n  name: text('name'),\n  shoeSize: integer('shoe_size'),\n})\n" > "$T/server/db/schema.ts"
printf 'export const f = (r) => r.name\n' > "$T/server/domain/x/index.ts"
out=$(VID_ROOT="$T" sh "$CHECKS/extractors/dead-path.collected-fields.sh")
printf '%s\n' "$out" | grep -qx 'ok name' && printf '%s\n' "$out" | grep -q '^orphan shoeSize ' || exit 1
