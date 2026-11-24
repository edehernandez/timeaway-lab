#!/bin/sh
# Purpose: the results reader (vid-skeleton Part 2) — reads Playwright's JUnit report and prints one line per
# collected case: `case <path>::<name> <passed|failed|skipped|error> <seconds>`, the path as the inventory cites it
# (tests/invariants/<file>), the name's whitespace replaced by `_`. `inactive <reason>` when the report is absent.
set -eu
R=${1:-}
[ -n "$R" ] && [ -s "$R" ] || { echo "inactive no report at '${R}'"; exit 0; }
tr '\n' ' ' < "$R" | sed 's#<testcase #\n<testcase #g' | awk '
  /^<testcase / {
    tag = $0; sub(/>.*/, "", tag)
    name = tag; sub(/.* name="/, "", name); sub(/".*/, "", name)
    cls = tag; if (cls ~ / classname="/) { sub(/.* classname="/, "", cls); sub(/".*/, "", cls) } else cls = ""
    t = tag; if (t ~ / time="/) { sub(/.* time="/, "", t); sub(/".*/, "", t) } else t = 0
    body = $0; sub(/<\/testcase>.*/, "", body); if (tag ~ /\/$/) body = tag
    st = "passed"
    if (body ~ /<skipped/) st = "skipped"
    if (body ~ /<failure/) st = "failed"
    if (body ~ /<error/) st = "error"
    if (cls !~ /^tests\/invariants\//) cls = "tests/invariants/" cls
    gsub(/&quot;/, "\"", name); gsub(/&amp;/, "\\&", name); gsub(/&lt;/, "<", name); gsub(/&gt;/, ">", name)
    gsub(/[ \t]+/, "_", name)
    print "case " cls "::" name " " st " " t
  }'
