#!/bin/sh
set -eu
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
# Purpose: selftest case — the request-state denominator must print a transition as from>to, a guard read as its
# state, and a direct write of a later state as ?>state, which the census convicts.
mkdir -p "$T/server/domain/requests"
printf "insert({ state: 'pending' })\ntransition(r, 'pending', 'approved')\nif (r.state === 'approved') x()\nupdate({ state: 'rejected' })\n" > "$T/server/domain/requests/index.ts"
out=$(VID_ROOT="$T" sh "$CHECKS/extractors/state-machine.request-state.sh")
printf '%s\n' "$out" | grep -qx 'server/domain/requests/index.ts:1 pending' && printf '%s\n' "$out" | grep -qx 'server/domain/requests/index.ts:2 pending>approved' || exit 1
printf '%s\n' "$out" | grep -qx 'server/domain/requests/index.ts:3 approved' && printf '%s\n' "$out" | grep -qx 'server/domain/requests/index.ts:4 ?>rejected' || exit 1
