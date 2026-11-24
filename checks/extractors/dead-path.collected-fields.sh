#!/bin/sh
# Purpose: the collected-fields census (shape 9, vid-skeleton Part 2): every column declared in server/db/schema.ts
# (`name: text('…')`, integer, real, blob), joined to a read site in server/domain/ other than the schema itself —
# a `.name` property read or a `name` field reference. An orphan is a stored field nothing acts on.
set -eu
S=${VID_ROOT:-.}/server/db/schema.ts; D=${VID_ROOT:-.}/server/domain
[ -f "$S" ] || { echo "inactive no server/db/schema.ts"; exit 0; }
COLS=$(sed -nE 's/^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*:[[:space:]]*(text|integer|real|blob)\(.*/\1/p' "$S" | sort -u)
[ -n "$COLS" ] || { echo "inactive no column declared in server/db/schema.ts"; exit 0; }
for c in $COLS; do
  if [ -d "$D" ] && grep -rqE "(\.|\b)$c\b" "$D" --include='*.ts'; then echo "ok $c"; else echo "orphan $c no read site in server/domain"; fi
done
