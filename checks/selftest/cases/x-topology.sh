#!/bin/sh
set -eu
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
# Purpose: selftest case — the topology census must flag a schedule naming an unregistered task.
mkdir -p "$T/server/tasks"
printf "export default { nitro: { scheduledTasks: { '0 1 * * *': ['purge:old'] } } }\n" > "$T/nuxt.config.ts"
out=$(VID_ROOT="$T" sh "$CHECKS/extractors/dead-path.topology.sh")
printf '%s\n' "$out" | grep -q '^orphan schedule:purge:old ' || exit 1
