#!/bin/sh
# Purpose: the route table (vid-skeleton Part 2) — one `ok <route>` per Nuxt page under app/pages, in the literal
# form INVENTORY.md subjects use: index.vue → /, sign-in.vue → /sign-in, admin/people/[id].vue → /admin/people/:id.
# API routes (server/api) are not pages and are not listed. Run from the repo root.
set -eu
D=${VID_ROUTES_ROOT:-.}/app/pages
[ -d "$D" ] || { echo "inactive no app/pages directory"; exit 0; }
FILES=$(cd "$D" && find . -name '*.vue' | sort)
[ -n "$FILES" ] || { echo "inactive no page under app/pages"; exit 0; }
printf '%s\n' "$FILES" | sed -E -e 's#^\./##' -e 's#\.vue$##' -e 's#\[([^]]*)\]#:\1#g' -e 's#(^|/)index$##' \
  | awk '{ print "ok /" $0 }' | sed 's#^ok //*#ok /#'
