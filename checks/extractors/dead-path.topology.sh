#!/bin/sh
# Purpose: the topology census (v0.9.3 3.4, vid-skeleton Part 2): every Nitro scheduled task (nuxt.config.ts
# scheduledTasks) and task definition (defineTask under server/tasks) joined to a registered task. TimeAway declares
# none (it runs one web process); the extractor says so until the first one exists.
set -eu
R=${VID_ROOT:-.}
SCHED=$(grep -hoE "scheduledTasks" "$R/nuxt.config.ts" 2>/dev/null || true)
TASKS=$(grep -rlE "defineTask\(" "$R/server" --include='*.ts' 2>/dev/null || true)
if [ -z "$SCHED" ] && [ -z "$TASKS" ]; then echo "inactive no routing or schedule declared"; exit 0; fi
for n in $(sed -n "s/.*['\"]\([a-z0-9:_-]*\)['\"][[:space:]]*\]/\1/p" "$R/nuxt.config.ts" 2>/dev/null); do
  if [ -f "$R/server/tasks/$(printf '%s' "$n" | tr ':' '/').ts" ]; then echo "ok schedule:$n"; else echo "orphan schedule:$n names unregistered task $n"; fi
done
[ -z "$TASKS" ] || for t in $TASKS; do echo "ok task:$t"; done
