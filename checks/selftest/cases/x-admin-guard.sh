#!/bin/sh
set -eu
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
# Purpose: selftest case — RULE-003's census must flag an admin operation outside admin/ with no guard, and one whose
# guard comes after the operation (a second shape), and pass one guarded first.
mkdir -p "$T/server/api/admin" "$T/server/api/people"
printf 'export default (e) => {\n  requireAdmin(e)\n  return listPeople()\n}\n' > "$T/server/api/admin/people.get.ts"
printf 'export default (e) => listPeople()\n' > "$T/server/api/people/index.get.ts"
printf 'export default (e) => {\n  const r = setAllowance(e)\n  requireAdmin(e)\n  return r\n}\n' > "$T/server/api/admin/allow.post.ts"
out=$(VID_ROOT="$T" sh "$CHECKS/extractors/invariant.admin-guard.sh")
printf '%s\n' "$out" | grep -qx 'ok server/api/admin/people.get.ts' || exit 1
printf '%s\n' "$out" | grep -q '^orphan server/api/people/index.get.ts ' && printf '%s\n' "$out" | grep -q '^orphan server/api/admin/allow.post.ts ' || exit 1
