# TimeAway — PRD
grammar: 0.26.11.1.2

> **Precedence rule:** the base of this file (everything above `## Appends`)
> is immutable after final ratification. All change is appended under
> `## Appends`. Later appends win over the base and over earlier appends.
> Authority order within the record: Seed and human answers > ratified
> thesis > sources > model proposals.

## Seed

one team of up to 30 people. The admin creates accounts with email and password. People request whole working days (Monday to Friday) as vacation or sick. Vacation comes out of a yearly allowance set per person. The admin approves or rejects, and a person can cancel while the request is still pending. Each person sees their own requests and their remaining days. Everyone sees a month calendar of who is away, showing approved time off only. Cut out: email, half days, public holidays, several teams or approvers, carry-over, other leave types, integrations, reports, sick-note uploads and a mobile app.

## Thesis

### Product summary

TimeAway is a small web application for one team of up to 30 people to ask
for, decide and see time off. A person asks for one or more whole working
days, Monday to Friday, as vacation or as sick. Vacation is taken from a
yearly allowance the admin sets for each person, per calendar year; sick
days take nothing from it and have no limit. The one admin approves or
rejects each request, can cancel the days still to come of an approved one, and runs the accounts —
there is no sign-up and no email. Each person sees their own requests and
how many vacation days they have left; everyone sees a month calendar of
who is away, built from approved requests only, which says "away" and
never why.

### Primary users

The members of one team (at most 30 people) who take vacation and fall
sick, and the one admin — also a team member — who keeps everyone's
allowance right, decides the requests and creates and maintains the
accounts.

### MVP focus

- G1: A team member can ask for whole working days off as vacation or sick, and always knows the state of their own requests and how many vacation days they have left.
- G2: The admin decides every request and can correct a decision afterwards, so that each person's vacation balance is always right.
- G3: Everyone can see, for any month, who on the team is away on which days, without learning why.
- G4: The admin runs the team's accounts without email: creates them, sets new passwords and switches off people who leave.

### Explicitly not MVP

Cut by the owner in the seed and kept out: email of any kind, half days,
public holidays, several teams, several approvers, carry-over of unused
days, any leave type other than vacation and sick, integrations, reports,
sick-note uploads and a mobile app. Also out: in-product recovery of the admin account (recovered by hand in the database), self sign-up, notifications
of any kind (a person learns a decision by looking), and any check of the
allowance against employment law — the product records the team's own
policy.

### Required core flows

- A team member asks for days off and sees the request pending, then decided.
- A team member cancels a request while it is still pending.
- A team member reads their remaining vacation days for the year.
- The admin approves or rejects each pending request, and cancels an approved one when plans change.
- The admin sets each person's yearly allowance.
- Anyone opens the month calendar and sees who is away.
- The admin creates an account, sets a new password, and switches off a leaver.

### Value logic

A team this size usually runs time off through chat messages and a
spreadsheet: requests get lost, balances drift and nobody is sure who is
out next week. TimeAway keeps one record the team trusts — every request
has a state, every balance is computed from approved days, and the
calendar shows only what was actually approved — while keeping a sick
colleague's reason private. The team returns to it whenever someone plans
time off or wonders who is around.

### Evidence basis

One source: the owner's seed and the owner's interview answers (A-001 to
A-012). No conflicts between them. Where the seed was silent, ViD's
decisions are recorded in the answer ledger as model_proposed.

## Actors and journeys

### Team member

1. Plans a holiday with family, or wakes up sick (off_screen)
2. Signs in and asks for the days, choosing vacation or sick
3. Sees the request pending and the vacation days it would use
4. Waits for the admin, possibly cancelling if plans change (off_screen)
5. Sees the request approved or rejected, and the remaining days updated
6. Looks at the month calendar to see who else is away that week

### Admin

1. Sets up the team: creates each account with an email, a first password and an allowance
2. Hands each person their first password in person or by chat (off_screen)
3. Opens the pending requests and approves or rejects each one
4. Learns that someone's plans changed and cancels an approved request
5. When a person forgets their password, sets a new one and tells them (off_screen)
6. When someone leaves the team, switches their account off

## Mechanisms

```vid-prd-mechanisms
MECH-01 | G1 | A person asks for a range of days by first and last day and a kind, vacation or sick, and only the Monday-to-Friday days in the range count as requested days. | stated: seed "People request whole working days (Monday to Friday) as vacation or sick"
MECH-02 | G1 | A vacation request is refused when its days exceed the person's allowance for that year minus the vacation days already approved or pending in that year. | stated: answer A-002
MECH-03 | G1 | A person can cancel their own request only while it is pending. | stated: seed "a person can cancel while the request is still pending"
MECH-04 | G1 | Each person has a page of their own requests with their state, and the vacation days left for this year and, whenever next year's days can be requested, for next year too, each with its pending days beside it. | stated: answer A-027
MECH-05 | G2 | The admin sees every pending request and approves or rejects it. | stated: seed "The admin approves or rejects"
MECH-06 | G2 | The admin can cancel an approved request, which cancels only its days from today on, returning those vacation days to the allowance and taking them off the calendar. | stated: answer A-007
MECH-07 | G2 | The admin sets each person's yearly vacation allowance, which applies per calendar year. | stated: seed "Vacation comes out of a yearly allowance set per person"
MECH-08 | G3 | A month calendar shows, for each working day, the people with an approved request covering it, and nothing pending, rejected or cancelled. | stated: seed "Everyone sees a month calendar of who is away, showing approved time off only"
MECH-09 | G3 | The calendar says "away" only; whether it is vacation or sick is shown only to the admin and the person themselves. | stated: answer A-005
MECH-10 | G4 | The admin creates each account with an email and a first password; nobody can sign up. | stated: seed "The admin creates accounts with email and password"
MECH-11 | G4 | The admin sets a new password for a person, a person changes their own, and the admin switches an account off so it can no longer sign in. | stated: answer A-008
MECH-12 | G4 | If the admin forgets their password or leaves, the admin account is recovered by hand in the database by whoever runs the server, outside the product. | stated: answer A-013
```

## Content contract

```vid-prd-contract
DIM-identity | Identity, accounts and access tiers | mechanism | required | covered_by: functional, data_entity, ux_flow, constraint | facets: tiers, signin_reauth, verification | status: covered
DIM-lifecycle | Entity time-lifecycle | mechanism | required | covered_by: functional, data_entity, invariant, constraint | status: covered
DIM-operations | Operational and admin surfaces | mechanism | required | covered_by: functional, ux_flow, data_entity | status: covered
DIM-authorization | Authorization: grants and denials | mechanism | required | covered_by: functional, nfr, invariant, constraint, data_entity, ux_flow | status: covered
DIM-data-integrity | Data identity, dedup and provenance recording | mechanism | required | covered_by: functional, data_entity, invariant, nfr, constraint | facets: record_identity, required_fields, dedup, provenance | status: covered
DIM-core-loop-continuity | Core-loop continuity | mechanism | required | covered_by: functional, ux_flow, data_entity | status: covered
DIM-absence-visibility | Who sees what about an absence | mechanism | required | covered_by: functional, invariant, ux_flow, constraint | prompt: without it a builder invents what colleagues see on the calendar and elsewhere (the kind, pending or rejected requests, balances, history), and sick status ends up visible to the whole team | status: covered
DIM-approval-routing | Who decides and who may change a decision | mechanism | required | covered_by: functional, invariant, constraint, ux_flow | prompt: without it a builder invents who approves the admin's own requests, whether a rejection carries a note, who may cancel approved leave, and whether the admin may enter leave on someone's behalf | status: covered
DIM-balance-accounting | How the vacation balance is computed | mechanism | required | covered_by: functional, invariant, data_entity | prompt: without it a builder invents when days are deducted, whether pending days count, whether over-balance or overlapping requests are blocked, and what happens when an allowance changes | status: covered
DIM-leave-year | The allowance year | mechanism | required | covered_by: functional, invariant, constraint, data_entity | prompt: without it a builder invents when the year starts and resets, how a request across the year end is charged, and whether next year's days can be asked for now | status: covered
DIM-day-counting | Which days count | mechanism | required | covered_by: functional, invariant, constraint | prompt: without it a builder invents whether weekends count, what a range of only weekend days does, and whether part-time patterns or holidays change the count | status: covered
DIM-request-window | Which dates may be requested | mechanism | required | covered_by: functional, invariant, constraint | prompt: without it a builder invents whether past or far-future days may be requested, which time zone decides what today is, and what happens to a pending request whose days pass | status: covered
DIM-member-lifecycle | People joining and leaving | mechanism | required | covered_by: functional, data_entity, invariant, ux_flow | prompt: without it a builder invents how the first admin exists, what a mid-year joiner's allowance is, and what switching an account off does to its requests, its calendar days and its sign-in | status: covered
DIM-sick-data | Sick records as sensitive data | nfr | required | covered_by: nfr, constraint, data_entity, invariant | prompt: without it a builder invents whether a sick request carries a free-text reason and who can read it, so health details end up stored and shown like vacation | status: covered
```

## Criticality tiers

- **T0** — must never break or leak.
- **T1** — core behavior; getting it wrong is a defect.
- **T2** — desirable; getting it wrong is a fix-round item.

## Items

```vid-prd-features
FEAT-01 | G1 | Asking for time off
FEAT-02 | G1 | My requests and remaining days
FEAT-03 | G2 | Deciding requests
FEAT-04 | G2 | Allowances
FEAT-05 | G3 | Team calendar
FEAT-06 | G4 | Accounts and sign-in
```

## Answer ledger

```vid-prd-answers
A-001 | human | 2026-11-24 | Q: When a vacation request asks for more days than the person has left, what happens? | A: accepted as recommended: the request cannot be sent; it is refused and the days left are shown | settles: thesis, MECH-02
A-002 | human | 2026-11-24 | Q: Do days in a pending vacation request count as already used? | A: accepted as recommended: for new requests yes, a person cannot request vacation days beyond the allowance minus approved minus pending vacation days; the remaining balance shown counts approved days, with pending days shown beside it | settles: thesis, MECH-02, MECH-04
A-003 | human | 2026-11-24 | Q: What is the allowance year, and what about a request that crosses it? | A: accepted as recommended: the calendar year, 1 January to 31 December; a request may not cross 31 December, so the person sends two requests | settles: thesis, MECH-07
A-004 | human | 2026-11-24 | Q: Sick days: approval, limit, past days? | A: accepted as recommended: sick requests go through the same admin approval as vacation, have no limit and are never taken from the allowance; sick requests may cover past days, vacation requests may not | settles: thesis, MECH-01
A-005 | human | 2026-11-24 | Q: On the shared calendar, does everyone see whether someone is away for vacation or for sickness? | A: accepted as recommended: everyone sees only away; only the admin and the person themselves see whether it is vacation or sick | settles: thesis, MECH-09
A-006 | human | 2026-11-24 | Q: Does the admin also take time off, and who decides the admin's own requests? | A: accepted as recommended: the admin is also a team member with an allowance and decides their own requests like anyone else's | settles: thesis, MECH-05
A-007 | human | 2026-11-24 | Q: Once a request is approved, can it be undone, and what happens to days already taken? | A: accepted as recommended, with the critic's repair accepted: only the admin can cancel an approved request; cancelling removes only its days from today on, returning those vacation days to the allowance and taking them off the calendar; days already passed stay approved, counted and on the calendar | settles: thesis, MECH-06
A-008 | human | 2026-11-24 | Q: With no email, how are forgotten passwords and people who leave handled? | A: accepted as recommended: the admin sets a new password for a person; a person can change their own password; the admin can switch an account off, after which it cannot sign in and its past requests stay | settles: thesis, MECH-11
A-009 | human | 2026-11-24 | Q: Scope challenge: may the first version ship without sick requests? | A: accepted as recommended: keep sick requests in the first version | settles: thesis
A-010 | human | 2026-11-24 | Q: Scope challenge: may the first version ship without the shared month calendar? | A: accepted as recommended: keep the shared month calendar in the first version | settles: thesis
A-011 | human | 2026-11-24 | Q: Scope challenge: may the first version ship without cancelling a pending request? | A: accepted as recommended: keep cancelling a pending request in the first version | settles: thesis
A-012 | human | 2026-11-24 | Q: Scope challenge: may the first version ship with one team-wide allowance instead of one per person? | A: accepted as recommended: keep a yearly allowance set per person in the first version | settles: thesis
A-013 | human | 2026-11-24 | Q: How many admins are there, how does the first one exist, and how is a locked-out or departed admin recovered? | A: exactly one admin account, created when the product is set up; inside the product the admin account cannot be switched off and admin rights cannot be given to anyone else; if the admin forgets their password or leaves, recovery is done by hand in the database by whoever runs the server, outside the product | settles: thesis, MECH-10, MECH-12
A-014 | model_proposed | 2026-11-24 | Q: May one person hold two requests that share a day? | A: no; a request that shares a day with the same person's pending or approved request is refused, whatever the kind | settles: thesis, MECH-01 | shown: pause-1 231230410
A-015 | model_proposed | 2026-11-24 | Q: Does a rejection carry a reason? | A: the admin may add an optional note of up to 200 characters when rejecting, shown only to the person and the admin | settles: thesis, MECH-05 | shown: pause-1 2898814589
A-016 | model_proposed | 2026-11-24 | Q: Is there a limit on how many people may be away on the same day? | A: no limit; the admin sees the calendar when deciding | settles: thesis | shown: pause-1 3273784065
A-017 | model_proposed | 2026-11-24 | Q: What counts in a range of days? | A: only Monday to Friday days count and appear on the calendar; Saturdays and Sundays inside the range are ignored; a range with no Monday-to-Friday day is refused; every person works Monday to Friday | settles: thesis, MECH-01 | shown: pause-1 1515507862
A-018 | model_proposed | 2026-11-24 | Q: What happens when the admin changes an allowance, and what does a joiner get? | A: a changed allowance applies at once to the current and later years; lowering it below the days already approved is allowed and shows a negative balance; approved requests are never changed by it; a person who joins mid-year gets the full number the admin sets, with no proration | settles: thesis, MECH-07 | shown: pause-1 1805515179
A-019 | model_proposed | 2026-11-24 | Q: Which time zone decides what today is, and which language? | A: one team time zone, set at setup, decides today and every date; the product is in English only | settles: thesis | shown: pause-1 55248637
A-020 | model_proposed | 2026-11-24 | Q: How far ahead may a request go? | A: requests may cover days in the current calendar year and the next one; next year's balance uses the same per-person allowance | settles: thesis, MECH-02 | shown: pause-1 815606021
A-021 | model_proposed | 2026-11-24 | Q: What happens to a pending request whose days have passed? | A: it stays pending until the admin approves or rejects it; nothing expires by itself | settles: thesis, MECH-05 | shown: pause-1 2570760857
A-022 | human | 2026-11-24 | Q: What does switching an account off do to its requests? | A: accepted as recommended, with the critic's repair accepted: its pending requests are cancelled; its approved requests lose only their days from today on, which leave the calendar; days already passed stay approved and on past months of the calendar; the admin can switch the account back on | settles: thesis, MECH-11
A-023 | model_proposed | 2026-11-24 | Q: What is recorded about each decision and change? | A: every request, approval, rejection, cancellation, allowance change, password set and account switch records who did it and when; the person sees who decided each of their requests and when | settles: thesis | shown: pause-1 1327191064
A-024 | model_proposed | 2026-11-24 | Q: Does a request carry a note or reason from the person? | A: no; a request holds only the person, the kind, the first and last day and its state; there is no free-text field on a request, so no health detail is ever entered | settles: thesis | shown: pause-1 2080371881
A-025 | model_proposed | 2026-11-24 | Q: What happens at the 31st person? | A: at most 30 accounts that are switched on; creating or switching on a 31st is refused | settles: thesis, MECH-10 | shown: pause-1 2698999380
A-026 | model_proposed | 2026-11-24 | Q: Can the admin enter a request on someone's behalf, or edit one? | A: no; only the person sends their own requests, and nobody edits a request; to change days a person cancels a pending request and sends a new one, or asks the admin to cancel an approved one | settles: thesis | shown: pause-1 1475471055
A-027 | human | 2026-11-24 | Q: Next year's days can be asked for; which balance does a person see? | A: accepted as recommended: whenever next year's days can be requested, the person sees both years' balances, each with its pending days beside it | settles: thesis, MECH-04
A-028 | human | 2026-11-24 | Q: The contract sitting: which qualities are struck, and how are the case-by-case ones ruled? | A: struck: contact consent, feedback intake, trust badges, notifications, success thresholds, measuring events, security bar, privacy, speed and uptime floor, accessibility, and backups with error logging and support; search findability and several languages and time zones ruled out; a same-day absence limit, payroll export and an employment-law check not added; the 14 remaining qualities kept | settles: contract
```

## Open decisions

(none yet)

## Findings

### 2026-11-24 — pause 1 sitting

```vid-prd-findings
F-01 | red-team | blocking | A-013 | accepted A-013 | evidence: with one admin, no email and no handover, a forgotten admin password or a departed admin would lock the product for good; the owner ruled one admin with recovery by hand in the database, outside the product
F-02 | red-team | blocking | MECH-06, A-007, A-022 | repaired | evidence: cancelling an approved, partly taken vacation returned taken days to the allowance and wiped them from past months, and switching off an account left a request spanning today undefined; now only days from today on are cancelled, in both cases
F-03 | red-team | advisory | MECH-04 | repaired | evidence: next year's days could be requested while only this year's balance was shown; now both years' balances are shown whenever next year can be requested
```

## Ratifications

## Appends

<!-- Append-only below this line. -->
