#!/bin/sh
set -eu
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
# Purpose: selftest case — routes.sh must map Nuxt pages to their literal routes, the dynamic segment as :id.
mkdir -p "$T/app/pages/admin/people"; touch "$T/app/pages/index.vue" "$T/app/pages/sign-in.vue" "$T/app/pages/admin/people/[id].vue"
out=$(VID_ROUTES_ROOT="$T" sh "$CHECKS/extractors/routes.sh")
printf '%s\n' "$out" | grep -qx 'ok /' && printf '%s\n' "$out" | grep -qx 'ok /sign-in' && printf '%s\n' "$out" | grep -qx 'ok /admin/people/:id' || exit 1
[ "$(printf '%s\n' "$out" | wc -l | tr -d ' ')" = 3 ] || exit 1
