#!/bin/sh
# Purpose: RULE-004's denominator — every site in the requests module that sets or guard-reads a request's state.
# A mutation goes through transition(<req>, '<from>', '<to>') → `<site> <from>><to>`; the insert of a new request
# (`state: 'pending'`) → `<site> pending`; a guard read `state === '<s>'` → `<site> <s>`; any other write of state → `<site> ?><s>`,
# which the census convicts as undeclared (D-031).
set -eu
R=${VID_ROOT:-.}; D=$R/server/domain/requests
[ -d "$D" ] && grep -rqE "state" "$D" --include='*.ts' 2>/dev/null || { echo "inactive no request state is built yet"; exit 0; }
grep -rnE "transition\([^,]+,[[:space:]]*'[a-z]+',[[:space:]]*'[a-z]+'\)|state[[:space:]]*(===|!==)[[:space:]]*'[a-z]+'|state:[[:space:]]*'[a-z]+'" "$D" --include='*.ts' | while IFS= read -r l; do
  site=$(printf '%s' "$l" | cut -d: -f1,2); site=${site#"$R"/}
  case "$l" in
    *transition\(*) printf '%s %s\n' "$site" "$(printf '%s' "$l" | sed -n "s/.*transition([^,]*,[[:space:]]*'\([a-z]*\)',[[:space:]]*'\([a-z]*\)').*/\1>\2/p")" ;;
    *"state: 'pending'"*) echo "$site pending" ;;
    *===*|*!==*) echo "$site $(printf '%s' "$l" | sed -n "s/.*state[[:space:]]*[!=]==[[:space:]]*'\([a-z]*\)'.*/\1/p")" ;;
    *) echo "$site ?>$(printf '%s' "$l" | sed -n "s/.*state:[[:space:]]*'\([a-z]*\)'.*/\1/p")" ;;
  esac
done
