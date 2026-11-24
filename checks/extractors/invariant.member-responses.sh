#!/bin/sh
# Purpose: RULE-002's census — every server route a non-admin can reach (server/api outside admin/ and __test/)
# that returns request data shapes it through a requests-module function whose name ends ForViewer( (D-031), so no
# other person's kind leaves the server. Sites: such routes importing the requests module; guarded: they call *ForViewer(.
set -eu
R=${VID_ROOT:-.}
[ -d "$R/server/api" ] || { echo "inactive no server/api"; exit 0; }
SITES=$(grep -rlE "server/domain/requests" "$R/server/api" --include='*.ts' 2>/dev/null | grep -vE '/server/api/(admin|__test)/' || true)
[ -n "$SITES" ] || { echo "inactive no member route returns request data yet"; exit 0; }
for f in $SITES; do
  s=${f#"$R"/}
  if grep -qE "[A-Za-z]+ForViewer\(" "$f"; then echo "ok $s"; else echo "orphan $s returns request data without a *ForViewer shaper"; fi
done
