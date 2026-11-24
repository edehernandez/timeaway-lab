#!/bin/sh
set -eu
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
# Purpose: selftest case — memory.sh prints exactly one line, free-mb <n> or inactive <reason>.
out=$(sh "$CHECKS/extractors/memory.sh")
[ "$(printf '%s\n' "$out" | wc -l | tr -d ' ')" = 1 ] || exit 1
printf '%s\n' "$out" | grep -qE '^(free-mb [0-9]+|inactive .+)$' || exit 1
