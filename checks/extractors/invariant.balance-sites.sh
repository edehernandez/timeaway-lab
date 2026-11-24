#!/bin/sh
# Purpose: RULE-001's census — every server route or page that renders or returns a days-left, pending or forecast
# figure takes it from the requests module's balanceFor(/forecastFor( (D-031). Sites: files under server/api and
# app/ naming a figure word (days left, remaining, forecast, would leave, balance), or doing arithmetic on an
# allowance; a route that only sets an allowance shows no figure and is no site. Guarded: the file calls
# balanceFor(/forecastFor( (or reads /api/balance or the admin lists) and does no allowance arithmetic itself.
set -eu
R=${VID_ROOT:-.}
SITES=$(grep -rlEi "days ?left|daysleft|remaining|forecast|wouldleave|would leave|balance|allowance[[:space:]]*[-+]|[-+][[:space:]]*allowance" "$R/server/api" "$R/app" --include='*.ts' --include='*.vue' 2>/dev/null || true)
[ -n "$SITES" ] || { echo "inactive no route or page shows a days-left figure yet"; exit 0; }
for f in $SITES; do
  s=${f#"$R"/}
  if grep -qE "allowance[[:space:]]*[-+]|[-+][[:space:]]*allowance|reduce\(" "$f"; then echo "orphan $s computes a figure outside balanceFor/forecastFor"
  elif grep -qE "balanceFor\(|forecastFor\(|/api/balance|/api/admin/(pending|people)" "$f"; then echo "ok $s"
  else echo "orphan $s shows a figure not taken from balanceFor/forecastFor"; fi
done
