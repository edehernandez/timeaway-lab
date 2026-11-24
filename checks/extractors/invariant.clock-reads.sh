#!/bin/sh
# Purpose: RULE-005's census — every read of the current time in server/ goes through the team clock,
# server/domain/accounts/clock.ts (D-031). Population: that module, plus every other line reading the system clock
# (Date.now(, new Date() with no argument, SQL CURRENT_TIMESTAMP/date('now')/datetime('now')), each an orphan.
set -eu
R=${VID_ROOT:-.}
C=$R/server/domain/accounts/clock.ts
[ -f "$C" ] || { echo "inactive the team clock server/domain/accounts/clock.ts is not built yet"; exit 0; }
echo "ok server/domain/accounts/clock.ts"
grep -rnE "Date\.now\(|new Date\(\)|CURRENT_(TIMESTAMP|DATE)|(date|datetime)\(['\"]now" "$R/server" --include='*.ts' --include='*.sql' --include='*.mjs' 2>/dev/null \
  | grep -v "server/domain/accounts/clock.ts:" | while IFS=: read -r file line _; do echo "orphan ${file#"$R"/}:$line reads the system clock outside the team clock"; done
