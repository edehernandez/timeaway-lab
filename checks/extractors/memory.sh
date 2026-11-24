#!/bin/sh
# Purpose: the memory reader (vid-skeleton Part 2) — one line, `free-mb <n>` from the host (macOS vm_stat, Linux
# /proc/meminfo MemAvailable), or `inactive <reason>`. The observer reports it; it never enforces.
set -eu
if [ -r /proc/meminfo ]; then
  awk '/^MemAvailable:/ { printf "free-mb %d\n", $2 / 1024; f = 1 } END { if (!f) print "inactive no MemAvailable in /proc/meminfo" }' /proc/meminfo
elif command -v vm_stat >/dev/null 2>&1; then
  vm_stat | awk '/page size of/ { ps = $8 } /^Pages (free|inactive|speculative)/ { gsub(/\./, "", $NF); p += $NF }
    END { if (ps) printf "free-mb %d\n", p * ps / 1048576; else print "inactive vm_stat gave no page size" }'
else
  echo "inactive the host exposes no free memory this reader knows"
fi
