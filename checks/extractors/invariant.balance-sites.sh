#!/bin/sh
# Purpose: RULE-001's census — every server route or page that renders or returns a days-left, pending or forecast
# figure takes it from the requests module's balanceFor(/forecastFor( (D-031). Sites: files under server/api and
# app/ naming allowance or a figure word; guarded: the file calls balanceFor(/forecastFor( and does no allowance
# arithmetic itself. Orphan: a site computing it locally.
set -eu
R=${VID_ROOT:-.}
SITES=$(grep -rlEi "allowance|days ?left|daysleft|remaining|forecast|wouldleave|balance" "$R/server/api" "$R/app" --include='*.ts' --include='*.vue' 2>/dev/null || true)
[ -n "$SITES" ] || { echo "inactive no route or page shows a days-left figure yet"; exit 0; }
for f in $SITES; do
  s=${f#"$R"/}
  if grep -qE "allowance[[:space:]]*[-+]|[-+][[:space:]]*allowance|reduce\(" "$f"; then echo "orphan $s computes a figure outside balanceFor/forecastFor"
  elif grep -qE "balanceFor\(|forecastFor\(|/api/balance|/api/admin/(pending|people)" "$f"; then echo "ok $s"
  else echo "orphan $s shows a figure not taken from balanceFor/forecastFor"; fi
done
