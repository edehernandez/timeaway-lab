#!/bin/sh
# Purpose: RULE-003's census — every server route calling an admin-only operation of the accounts or requests
# modules, wherever it lives, calls requireAdmin( on a line before the first such call (D-031). Deny by default:
# the admin operations are listed by name; a route calling one with no earlier requireAdmin( is an orphan.
set -eu
R=${VID_ROOT:-.}
OPS='approveRequest|rejectRequest|adminCancel|setAllowance|createAccount|renameAccount|setPassword|changeEmail|switchAccount|listPeople|personRequests|personHistory|listPending|forecastFor|effectOf'
[ -d "$R/server/api" ] || { echo "inactive no server/api"; exit 0; }
SITES=$(grep -rlE "\b($OPS)\(" "$R/server/api" --include='*.ts' 2>/dev/null | grep -v '/server/api/__test/' || true)
[ -n "$SITES" ] || { echo "inactive no route calls an admin operation yet"; exit 0; }
for f in $SITES; do
  s=${f#"$R"/}
  op=$(grep -nE "\b($OPS)\(" "$f" | grep -v 'import' | head -n 1 | cut -d: -f1)
  g=$(grep -nE "requireAdmin\(" "$f" | grep -v 'import' | head -n 1 | cut -d: -f1)
  if [ -n "$g" ] && [ -n "$op" ] && [ "$g" -lt "$op" ]; then echo "ok $s"; else echo "orphan $s calls an admin operation before requireAdmin"; fi
done
