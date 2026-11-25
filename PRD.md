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

One source: the owner's seed, the owner's interview answers and the
owner's rulings at the pauses, all in the answer ledger. No conflicts
between them. Where the seed was silent, ViD's decisions are recorded in
the answer ledger as model_proposed.

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

```vid-prd
REQ-001 | functional | T1 | A signed-in person sends a request for themselves with a kind, vacation or sick, and a first and last day; nobody, the admin included, sends a request for another person; only the Monday to Friday days in the range are counted as requested days, and the new request starts pending. | fail-if: (1) a request is created with a kind other than vacation or sick; (2) a Saturday or Sunday inside the range is counted as a requested day or shown as away; (3) a range containing no Monday to Friday day is accepted; (4) a range whose last day is before its first day is accepted; (5) a new request starts in any state other than pending; (6) a request is created for any person other than the signed-in sender, whatever the sender sends | serves: G1 — whole working days are the only unit the team takes off, so every count and every calendar day rests on this | authority: provisional | confirms_via: owner-decision/no | source: seed, A-017, A-026 | covers: DIM-day-counting, DIM-lifecycle | phase: pilot | feature: FEAT-01 | plain: A person asks for days off for themselves as vacation or sick by first and last day, and only Monday to Friday days count.
REQ-002 | functional | T0 | A vacation request is refused when its counted days exceed the person's allowance for that year minus the vacation days already approved or pending in that year, and the refusal shows that year's days left with that year's pending vacation days beside it; sick requests are never checked against or taken from the allowance. | fail-if: (1) a vacation request whose counted days exceed the allowance minus the approved and pending vacation days of its year is accepted; (2) a vacation request within that number is refused; (3) the refusal does not show that year's days left together with that year's pending vacation days; (4) a sick request is refused for lack of allowance or changes the days left; (5) two vacation requests sent at the same moment are both accepted although together they exceed the days left | serves: G1 and G2 — a balance that can be overdrawn is not a balance; refusing at the door keeps every number right without the admin checking sums | authority: authoritative | source: seed, A-001, A-002, A-004 | covers: DIM-balance-accounting | phase: pilot | feature: FEAT-01 | plain: A vacation request that asks for more days than are left, counting pending ones, is refused and shows days left and pending days; sick days never use allowance.
REQ-003 | functional | T1 | A request that shares a day with a day still in effect of the same person's pending or approved request is refused, whatever the kinds of the two requests; the days of a partly cancelled approved request from its cancel day on are not in effect. | fail-if: (1) a person ends up with two pending or approved requests that share a day in effect; (2) a request is refused because it shares a day only with the person's own rejected or cancelled request, or with the cancelled days of a partly cancelled one; (3) a request is refused because it shares a day with another person's request | serves: G1 and G3 — one day is one absence, so balances and the calendar never count a day twice | authority: provisional | confirms_via: owner-decision/no | source: A-014, A-030 | covers: DIM-data-integrity/dedup | phase: pilot | feature: FEAT-01 | plain: A person cannot have two live requests on the same day; a request that overlaps their pending or approved one is refused.
REQ-004 | functional | T1 | Which days may be requested: a vacation request may not include a day before today, a sick request may; every request lies within the current or the next calendar year and may not cross 31 December; today is decided in the team's one time zone. | fail-if: (1) a vacation request that includes a day before today is accepted; (2) a sick request is refused because its days are before today; (3) a request with a day before 1 January of the current year is accepted; (4) a request with a day after 31 December of the next year is accepted; (5) a request whose first and last days fall in different years is accepted; (6) a request is accepted or refused differently from how it would be if today, the current year and the next year were all read from the date in the team's time zone at the moment it is sent | serves: G1 — sick days are often told after the fact, vacation is planned ahead, and the yearly allowance only works if each request belongs to one year | authority: provisional | confirms_via: owner-decision/no | source: A-003, A-004, A-019, A-020 | covers: DIM-request-window, DIM-leave-year | phase: pilot | feature: FEAT-01 | plain: Vacation cannot be for past days, sick can; requests stay within this year or next and never cross 31 December.
REQ-005 | functional | T1 | A person can cancel their own request while it is pending; it becomes cancelled, its days stop counting as pending, and it can never be decided afterwards; a person cannot cancel their own approved, rejected or cancelled request. | fail-if: (1) a person cannot cancel their own pending request; (2) a cancelled request's days still count as pending or still block a new request for those days; (3) a cancelled request can later be approved or rejected; (4) a person cancels their own approved, rejected or cancelled request | serves: G1 — plans change before the admin answers, and the person should not need the admin to withdraw an ask | authority: authoritative | source: seed, A-007 | covers: DIM-lifecycle, DIM-core-loop-continuity | phase: pilot | feature: FEAT-01 | plain: A person can cancel their own request only while it is still pending, and it then stops counting.
REQ-006 | ux_flow | T1 | A person's own requests page lists every request they have sent, newest first, each with its kind, first and last day, counted days, state, who decided it and when, who cancelled it and when and from which day, and the admin's rejection note if any; with no requests it says so and offers to send one; it shows no other person's requests. | fail-if: (1) a request the person sent is missing from the page; (2) a listed request lacks its kind, its days, its count or its state; (3) a decided request does not show who decided it and when; (4) a rejected request with a note does not show the note; (5) the empty page shows a bare list with no message and no way to send a request; (6) the page shows any other person's request; (7) a cancelled or partly cancelled request does not show who cancelled it, when, and from which day | serves: G1 — the person always knows where each ask stands without asking the admin | authority: provisional | confirms_via: owner-decision/no | source: seed, A-015, A-023, A-030 | covers: DIM-core-loop-continuity, DIM-absence-visibility | phase: pilot | feature: FEAT-02 | plain: Each person sees all their own requests with their state, who decided or cancelled them and when, and any rejection note, and nobody else's.
REQ-007 | functional | T1 | A person sees their vacation days left for the current year and for the next year, each as the allowance minus the approved vacation days counted in that year, with the pending vacation days of that year shown beside it; a negative number is shown as negative. | fail-if: (1) either year's days left is missing; (2) a days-left number differs from the allowance minus that year's approved vacation days; (3) pending days are subtracted from the days-left number instead of shown beside it; (4) a year's pending vacation days are missing or wrong; (5) a negative balance is shown as zero or hidden | serves: G1 — the person plans time off against a number they can trust, for this year and next | authority: provisional | confirms_via: owner-decision/no | source: seed, A-002, A-018, A-020, A-027 | covers: DIM-balance-accounting, DIM-leave-year | phase: pilot | feature: FEAT-02 | plain: Each person sees vacation days left for this year and next, counting approved days, with pending days shown beside each.
REQ-008 | ux_flow | T1 | The admin has a pending requests page listing every pending request of every person, oldest first, each with the person's name, kind, first and last day and counted days, and for vacation that person's days left in its year; from it the admin approves a request, or rejects it with an optional note of at most 200 characters; with nothing pending it says so. | fail-if: (1) a pending request of any person, the admin included, is missing from the page; (2) the list is not ordered oldest first; (3) a vacation request is shown without the person's days left in its year; (4) a request cannot be approved or rejected from the page; (5) a rejection note longer than 200 characters is accepted, or a rejection without a note is refused; (6) an empty page shows a bare list with no message | serves: G2 — every request reaches the one person who decides it, with what they need to decide | authority: provisional | confirms_via: owner-decision/no | source: seed, A-006, A-015 | covers: DIM-operations, DIM-approval-routing | phase: pilot | feature: FEAT-03 | plain: The admin sees every pending request, oldest first, with the person's days left, and approves it or rejects it with an optional short note.
REQ-009 | functional | T1 | Only a pending request can be approved or rejected, by the admin alone, including the admin's own requests; approving makes it approved and puts its days on the calendar; rejecting makes it rejected and frees its pending days; a pending request whose days have passed stays pending and decidable. | fail-if: (1) an approved, rejected or cancelled request is approved or rejected; (2) anyone but the admin approves or rejects a request; (3) the admin cannot decide their own request; (4) an approved request's days are missing from the calendar; (5) a rejected request's days still count as pending or still block a new request; (6) a pending request changes state by itself when its days pass | serves: G2 — the admin's decision is the one act that turns an ask into time off | authority: provisional | confirms_via: owner-decision/no | source: seed, A-006, A-021 | covers: DIM-lifecycle, DIM-approval-routing | phase: pilot | feature: FEAT-03 | plain: Only the admin approves or rejects, only pending requests, their own included; a pending request never decides itself when its days pass.
REQ-010 | functional | T1 | The admin can cancel an approved request: only its Monday to Friday days from today on are cancelled, returning those vacation days to the allowance and taking them off the calendar; its days before today stay approved, counted and on the calendar; a request with no Monday to Friday day from today on cannot be cancelled. | fail-if: (1) a day before today is returned to the allowance or taken off the calendar; (2) a day from today on stays counted or stays on the calendar after the cancel; (3) anyone but the admin cancels an approved request; (4) an approved request whose Monday to Friday days are all before today is changed by a cancel | serves: G2 — plans change after approval, and the record must still show the days actually taken | authority: authoritative | source: A-007 | covers: DIM-approval-routing, DIM-balance-accounting, DIM-lifecycle | phase: pilot | feature: FEAT-03 | plain: The admin can cancel an approved request; only days from today on are given back and leave the calendar, past days stay.
INV-001 | invariant | T0 | For every person and year, the vacation days left shown anywhere equal that person's allowance for that year minus the counted days in effect of their approved vacation requests in that year, after every approval, rejection, cancellation, partial cancellation, account switch-off and allowance change; the pending page's figure of what an approval would leave is a forecast, not the days left, and equals this value after that approval. | serves: G2 — the promise that every balance is always right, across every action that touches it | authority: authoritative | source: seed, A-002, A-007, A-022, A-030 | covers: DIM-balance-accounting | cross-cutting: own requests page, pending page, people page, request refusal | spans: REQ-002, REQ-007, REQ-008, REQ-009, REQ-010, REQ-011, REQ-016, REQ-019, REQ-020, REQ-022 | phase: pilot | feature: FEAT-04 | plain: Days left always equal the allowance minus approved vacation days of that year, on every page and after every change.
REQ-011 | functional | T1 | The admin sets each person's yearly vacation allowance as a whole number of days, zero or more; a change applies at once to the current and later years, never changes an approved request, and may leave a negative balance; a person who joins mid-year gets the full number set. | fail-if: (1) an allowance that is negative or not a whole number is accepted; (2) a changed allowance does not change the current year's days left at once; (3) a changed allowance changes, cancels or shortens an approved request; (4) lowering an allowance below the approved days is refused; (5) a mid-year joiner's allowance is reduced in proportion to the date | serves: G2 — the admin keeps each person's entitlement right as circumstances change | authority: provisional | confirms_via: owner-decision/no | source: seed, A-018 | covers: DIM-balance-accounting, DIM-member-lifecycle | phase: pilot | feature: FEAT-04 | plain: The admin sets each person's yearly allowance in whole days; a change applies at once and never touches approved requests.
REQ-012 | ux_flow | T1 | Every signed-in person can open a month calendar for any month, moving to the previous and next month; for each Monday to Friday day it lists by name the people with an approved request covering that day, and nothing pending, rejected or cancelled; past approved days of switched-off accounts still show. | fail-if: (1) a signed-in person cannot open the calendar or move to another month; (2) a person with an approved day is missing from that day; (3) a pending, rejected or cancelled day appears; (4) a Saturday or Sunday shows anyone as away; (5) a switched-off account's past approved days disappear from past months | serves: G3 — anyone planning work can see at a glance who is out | authority: provisional | confirms_via: owner-decision/no | source: seed, A-017, A-022, A-029 | covers: DIM-absence-visibility, DIM-core-loop-continuity | phase: pilot | feature: FEAT-05 | plain: Everyone sees a month calendar of who is away on each weekday, built from approved requests only, for any month.
INV-002 | invariant | T0 | Whether an absence is vacation or sick is never shown or sent to anyone other than the admin and the person themselves: not on the calendar, not on any page, not in any data the product sends to another person's browser.| serves: G3 — a colleague's sickness is their own business; the team only needs to know they are away | authority: authoritative | source: seed, A-005 | covers: DIM-absence-visibility, DIM-sick-data | cross-cutting: calendar, every page, data sent to the browser | spans: REQ-006, REQ-008, REQ-012 | phase: pilot | feature: FEAT-05 | plain: Only the admin and the person themselves can ever learn whether an absence is vacation or sick; everyone else sees only away.
REQ-013 | functional | T1 | The admin creates an account with a display name, an email, a first password and an allowance; an email belongs to at most one account; at most 30 accounts are switched on at once, so creating a 31st is refused; there is no page where anyone signs themselves up. | fail-if: (1) an account is created without a name, an email, a password or an allowance; (2) two accounts share an email, compared without regard to letter case; (3) an account is created or switched on while 30 are already switched on; (4) anyone creates an account without being signed in as the admin | serves: G4 — the team is a closed group of known people the admin adds by hand | authority: provisional | confirms_via: owner-decision/no | source: seed, A-025, A-029 | covers: DIM-identity/tiers, DIM-data-integrity/record_identity, DIM-member-lifecycle | phase: pilot | feature: FEAT-06 | plain: Only the admin creates accounts, each with a name, email, password and allowance; one account per email, and at most 30 switched on.
REQ-014 | functional | T0 | Every page and every action requires being signed in with an account's email and password; a switched-off account cannot sign in, and any session it holds ends at once when it is switched off; signing out ends the session. | fail-if: (1) someone who is not signed in sees any page's content or any data other than the sign-in page, or causes any action's effect; (2) a wrong password signs in; (3) a switched-off account signs in; (4) a session of an account keeps working after the account is switched off; (5) a session keeps working after signing out | serves: G4 — the team's absences are only for the team, and a leaver loses access the moment the admin says so | authority: authoritative | source: seed, A-008 | covers: DIM-identity/signin_reauth, DIM-authorization | cross-cutting: every page, every action | phase: pilot | feature: FEAT-06 | plain: Everything needs signing in with email and password; a switched-off account cannot sign in and loses any open session at once.
REQ-015 | functional | T1 | The admin can set a new password for any other account; every person, the admin included, changes their own password after giving their current one; after either change the old password no longer signs in, and every other open session of that account ends. | fail-if: (1) the admin cannot set a new password for an account; (2) a person's own password is changed through their session by a change that does not carry their correct current password; (3) the old password still signs in after a change; (4) anyone but the admin sets another person's password; (5) a session other than the changer's keeps working after a password set or change; (6) the admin sets their own password without giving the current one | serves: G4 — with no email, a forgotten password is fixed by the admin and a person keeps their own password private | authority: authoritative | source: A-008, A-034 | covers: DIM-identity/signin_reauth | phase: pilot | feature: FEAT-06 | plain: The admin can set anyone else a new password, everyone changes their own after typing the current one, and other open sessions then end.
REQ-016 | functional | T1 | The admin can switch an ordinary account off and back on, never the admin's own account; switching off is refused while the account holds a pending request with a Monday to Friday day before today; switching off cancels the account's pending requests and the days from today on of its approved requests, which leave the calendar, while its days before today stay; switching back on restores sign-in and restores no cancelled request. | fail-if: (1) the admin account can be switched off; (2) a switched-off account keeps a pending request; (3) a switched-off account keeps an approved day from today on, or that day stays on the calendar; (4) a switched-off account loses an approved day before today; (5) switching back on brings back a cancelled request or day; (6) an account switched back on, where the limit on switched-on accounts allowed it, cannot sign in; (7) an account is switched off while it holds a pending request with a Monday to Friday day before today | serves: G4 — a leaver's future absences stop and their history stays, without deleting anyone | authority: authoritative | source: A-008, A-013, A-022, A-033 | covers: DIM-member-lifecycle, DIM-lifecycle | phase: pilot | feature: FEAT-06 | plain: The admin can switch an account off and on; switching off waits for past pending requests to be decided, cancels future days, and never applies to the admin.
INV-003 | invariant | T0 | Only the admin approves, rejects, cancels approved requests, sets allowances, creates and renames accounts, sets another person's password and switches accounts; a person acts only on their own requests and sees only their own requests and days left, apart from the calendar's away entries, which carry no kind; a refused attempt changes nothing. | serves: G2 and G4 — one person decides and runs the team, and everyone else's records are theirs alone | authority: authoritative | source: seed, A-005, A-007, A-008 | covers: DIM-authorization, DIM-approval-routing, DIM-absence-visibility | cross-cutting: every admin action, every person's own pages | spans: REQ-001, REQ-005, REQ-006, REQ-007, REQ-008, REQ-009, REQ-010, REQ-011, REQ-012, REQ-013, REQ-015, REQ-016, REQ-020, REQ-021 | phase: pilot | feature: FEAT-06 | plain: Only the admin can decide, cancel approved time, set allowances or run accounts; everyone else acts on and sees only their own requests and the calendar.
REQ-017 | data_entity | T1 | A request holds the person, the kind, its first and last day as sent, its state (pending, approved, rejected or cancelled), when it was sent, who decided it and when, who cancelled it and when and the Monday to Friday day its cancel takes effect from, and the admin's rejection note if any; it holds no free-text field filled by the person, so no health detail is ever entered. | fail-if: (1) a stored request lacks any of the named fields its state calls for; (2) a request's state is anything other than the four named; (3) a request offers or stores any free text from the person; (4) a decision or cancel does not record who and when; (5) a cancel overwrites who decided the request, or its first and last day as sent | serves: G1 and G2 — every request's history can be told, and a sick request carries nothing but the fact of absence | authority: provisional | confirms_via: owner-decision/no | source: A-015, A-023, A-024, A-030 | covers: DIM-data-integrity/required_fields, DIM-data-integrity/provenance, DIM-sick-data, DIM-lifecycle | phase: pilot | feature: FEAT-03 | plain: A request holds only who, which kind, which days, its state, and who decided or cancelled it and when; a person never types a reason.
REQ-018 | data_entity | T2 | Every allowance change, name change, password set and account switch records who did it and when. | fail-if: (1) an allowance change, a name change, a password set or an account switch is stored with no record of who did it and when | serves: G2 and G4 — a disputed balance or a lost access can be traced to the act that caused it | authority: provisional | confirms_via: owner-decision/no | source: A-023, A-029 | covers: DIM-data-integrity/provenance | phase: pilot | feature: FEAT-04 | plain: Each allowance change, name change, password set and account switch records who did it and when.
CON-001 | constraint | T1 | There is exactly one admin account, created when the product is set up; inside the product admin rights cannot be given to anyone else; a locked-out or departed admin is recovered by hand in the database by whoever runs the server. | authority: authoritative | source: A-013 | covers: DIM-identity/tiers | feature: FEAT-06
CON-002 | constraint | T1 | No email address is ever checked or confirmed; the admin's entry is trusted as given. | authority: authoritative | source: seed | covers: DIM-identity/verification | feature: FEAT-06
CON-003 | constraint | T1 | The team has one time zone, set when the product is set up, that decides what today is and every date; the product is in English only. | authority: provisional | confirms_via: owner-decision/no | source: A-019 | covers: DIM-request-window
NG-001 | non_goal | - | No email or notification of any kind: a person learns a decision by looking at their own page. | authority: authoritative | source: seed
NG-002 | non_goal | - | No half days: every request is in whole working days. | authority: authoritative | source: seed
NG-003 | non_goal | - | No public holidays and no other work patterns: every Monday to Friday day counts for everyone. | authority: authoritative | source: seed
NG-004 | non_goal | - | No several teams and no several approvers: one team, one admin. | authority: authoritative | source: seed
NG-005 | non_goal | - | No carry-over: unused days of a year are not moved to the next. | authority: authoritative | source: seed
NG-006 | non_goal | - | No leave types other than vacation and sick. | authority: authoritative | source: seed
NG-007 | non_goal | - | No integrations, no reports and no export. | authority: authoritative | source: seed
NG-008 | non_goal | - | No sick-note uploads. | authority: authoritative | source: seed
NG-009 | non_goal | - | No mobile app. | authority: authoritative | source: seed
NG-010 | non_goal | - | No self sign-up and no in-product handover or recovery of the admin. | authority: authoritative | source: seed, A-013
NG-011 | non_goal | - | No limit on how many people may be away on the same day, and no editing of a request or entering one on someone else's behalf. | authority: provisional | confirms_via: owner-decision/no | source: A-016, A-026
NG-012 | non_goal | - | No check of allowances against employment law: the product records the team's own policy. | authority: authoritative | source: A-028
REQ-019 | functional | T1 | When the admin cancels an approved request that has Monday to Friday days before today, or switches off its account, the request stays approved with its days in effect ending the day before the cancel, keeps its first and last day as sent, and records the cancel day and who cancelled; the person's page shows its cancelled days as cancelled; an approved request with no Monday to Friday day before today becomes cancelled instead. | fail-if: (1) a partly cancelled request becomes cancelled or rejected; (2) a partly cancelled request still counts or shows a day from the cancel day on as approved; (3) the cancel date or who cancelled is not recorded; (4) the person's page does not show the cancelled days as cancelled; (5) an approved request with no Monday to Friday day before today stays approved after a cancel; (6) the request's original first and last day can no longer be told after the cancel | serves: G2 — the record keeps both what was taken and what was given back, so the balance and the history agree | authority: authoritative | source: A-030 | covers: DIM-lifecycle, DIM-data-integrity/provenance, DIM-balance-accounting | phase: pilot | feature: FEAT-03 | plain: A partly cancelled approved request stays approved up to the day before the cancel, records who cancelled it and when, and shows the cancelled days.
REQ-020 | ux_flow | T1 | The admin has a people page listing every account with its name, email, whether it is switched on, its allowance and its days left for the current and the next year; from it the admin creates accounts, changes a name, sets a new password, changes an allowance and switches an account off or on. | fail-if: (1) an account is missing from the page; (2) a listed account lacks its name, email, switched-on state, allowance or either year's days left; (3) any of the five account actions cannot be started from the page; (4) anyone but the admin sees any account's email, switched-on state, allowance or days left that the page lists, by the page or by any data the product sends them, or starts any of the page's account actions | serves: G2 and G4 — the one person who runs the team sees everyone's standing in one place and acts on it | authority: provisional | confirms_via: owner-decision/no | source: A-031, A-029 | covers: DIM-operations, DIM-member-lifecycle | phase: pilot | feature: FEAT-06 | plain: The admin has one people page showing every account's name, email, on or off, allowance and days left, and runs every account action from it.
REQ-021 | ux_flow | T1 | From the people page the admin opens any person's requests page, listing all of that person's requests as the person's own page does, with a cancel action on each approved request that still has a Monday to Friday day from today on, and on no other request. | fail-if: (1) the admin cannot open a person's requests page from the people page; (2) a request of that person is missing; (3) an approved request with a Monday to Friday day from today on has no cancel action; (4) a cancel action appears on a pending, rejected or cancelled request or on an approved request with no Monday to Friday day from today on; (5) anyone but the admin sees another person's requests, by a page or by any data the product sends them, or cancels another person's request | serves: G2 — the admin can find the approved request a change of plans calls for | authority: authoritative | source: A-031 | covers: DIM-operations, DIM-approval-routing | phase: pilot | feature: FEAT-03 | plain: The admin can open any person's requests and cancel approved ones that still have days to come.
REQ-022 | functional | T1 | The admin may approve a pending vacation request even when the approval would leave the person's days left for its year below zero; before approving, the pending page shows, labelled as such, the days left the approval would leave. | fail-if: (1) an approval is refused because it would leave the days left below zero; (2) the pending page does not show the days left the approval would leave; (3) the shown figure differs from the days left after the approval | serves: G2 — a vacation already asked for is not stranded by a later allowance change, and the admin sees the consequence before deciding | authority: authoritative | source: A-032 | covers: DIM-balance-accounting, DIM-approval-routing | phase: pilot | feature: FEAT-03 | plain: The admin may approve a vacation even if it leaves the days left below zero, and sees the resulting number before approving.
REQ-023 | data_entity | T1 | An account holds its display name, its email, unique without regard to letter case, its password, whether it is switched on, whether it is the admin, and the allowance in force for each calendar year, so a year keeps the allowance it had when a later change applies only from the current year on. | fail-if: (1) an account lacks any of the named fields; (2) changing an allowance changes the allowance recorded for a year before the current one; (3) a days-left figure for an earlier year is worked out from a later year's allowance | serves: G2 and G4 — the account carries everything the balance and the sign-in rules read, year by year | authority: provisional | confirms_via: owner-decision/no | source: seed, A-013, A-018, A-025, A-029 | covers: DIM-identity/tiers, DIM-member-lifecycle | phase: pilot | feature: FEAT-06 | plain: An account holds the name, email, password, whether it is on, whether it is the admin, and each year's allowance.
```

## Answer ledger

```vid-prd-answers
A-001 | human | 2026-11-24 | Q: When a vacation request asks for more days than the person has left, what happens? | A: accepted as recommended: the request cannot be sent; it is refused and the days left are shown | settles: thesis, MECH-02 | importance: priority
A-002 | human | 2026-11-24 | Q: Do days in a pending vacation request count as already used? | A: accepted as recommended: for new requests yes, a person cannot request vacation days beyond the allowance minus approved minus pending vacation days; the remaining balance shown counts approved days, with pending days shown beside it | settles: thesis, MECH-02, MECH-04 | importance: priority
A-003 | human | 2026-11-24 | Q: What is the allowance year, and what about a request that crosses it? | A: accepted as recommended: the calendar year, 1 January to 31 December; a request may not cross 31 December, so the person sends two requests | settles: thesis, MECH-07
A-004 | human | 2026-11-24 | Q: Sick days: approval, limit, past days? | A: accepted as recommended: sick requests go through the same admin approval as vacation, have no limit and are never taken from the allowance; sick requests may cover past days, vacation requests may not | settles: thesis, MECH-01 | importance: priority
A-005 | human | 2026-11-24 | Q: On the shared calendar, does everyone see whether someone is away for vacation or for sickness? | A: accepted as recommended: everyone sees only away; only the admin and the person themselves see whether it is vacation or sick | settles: thesis, MECH-09 | importance: priority
A-006 | human | 2026-11-24 | Q: Does the admin also take time off, and who decides the admin's own requests? | A: accepted as recommended: the admin is also a team member with an allowance and decides their own requests like anyone else's | settles: thesis, MECH-05
A-007 | human | 2026-11-24 | Q: Once a request is approved, can it be undone, and what happens to days already taken? | A: accepted as recommended, with the critic's repair accepted: only the admin can cancel an approved request; cancelling removes only its days from today on, returning those vacation days to the allowance and taking them off the calendar; days already passed stay approved, counted and on the calendar | settles: thesis, MECH-06 | importance: priority
A-008 | human | 2026-11-24 | Q: With no email, how are forgotten passwords and people who leave handled? | A: accepted as recommended: the admin sets a new password for a person; a person can change their own password; the admin can switch an account off, after which it cannot sign in and its past requests stay | settles: thesis, MECH-11 | importance: priority
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
A-022 | human | 2026-11-24 | Q: What does switching an account off do to its requests? | A: accepted as recommended, with the critic's repair accepted: its pending requests are cancelled; its approved requests lose only their days from today on, which leave the calendar; days already passed stay approved and on past months of the calendar; the admin can switch the account back on | settles: thesis, MECH-11 | importance: priority
A-023 | model_proposed | 2026-11-24 | Q: What is recorded about each decision and change? | A: every request, approval, rejection, cancellation, allowance change, password set and account switch records who did it and when; the person sees who decided each of their requests and when | settles: thesis | shown: pause-1 1327191064
A-024 | model_proposed | 2026-11-24 | Q: Does a request carry a note or reason from the person? | A: no; a request holds only the person, the kind, the first and last day and its state; there is no free-text field on a request, so no health detail is ever entered | settles: thesis | shown: pause-1 2080371881
A-025 | model_proposed | 2026-11-24 | Q: What happens at the 31st person? | A: at most 30 accounts that are switched on; creating or switching on a 31st is refused | settles: thesis, MECH-10 | shown: pause-1 2698999380
A-026 | model_proposed | 2026-11-24 | Q: Can the admin enter a request on someone's behalf, or edit one? | A: no; only the person sends their own requests, and nobody edits a request; to change days a person cancels a pending request and sends a new one, or asks the admin to cancel an approved one | settles: thesis | shown: pause-1 1475471055
A-027 | human | 2026-11-24 | Q: Next year's days can be asked for; which balance does a person see? | A: accepted as recommended: whenever next year's days can be requested, the person sees both years' balances, each with its pending days beside it | settles: thesis, MECH-04
A-028 | human | 2026-11-24 | Q: The contract sitting: which qualities are struck, and how are the case-by-case ones ruled? | A: struck: contact consent, feedback intake, trust badges, notifications, success thresholds, measuring events, security bar, privacy, speed and uptime floor, accessibility, and backups with error logging and support; search findability and several languages and time zones ruled out; a same-day absence limit, payroll export and an employment-law check not added; the 14 remaining qualities kept | settles: contract
A-029 | model_proposed | 2026-11-24 | Q: What name identifies a person on the calendar and in lists? | A: each account carries a display name the admin enters when creating it and can change later; the calendar and the admin's lists show that name | settles: REQ-012, REQ-013, REQ-020, REQ-023 | shown: pause-2 695386818
A-030 | human | 2026-11-24 | Q: When the admin cancels an approved request with days both before and after today, what does the request become? | A: accepted as recommended: it stays one approved request, shortened to end the day before the cancel, with the cancel date and who cancelled it recorded and the cancelled days shown as cancelled on the person's page; a request with no day before today becomes cancelled; the same when an account is switched off | settles: REQ-010, REQ-016, REQ-017, REQ-006 | importance: priority
A-031 | human | 2026-11-24 | Q: Where does the admin find someone's approved request to cancel it, and where does the admin manage people? | A: accepted as recommended: one people page listing every account with name, email, switched on or off, allowance and both years' days left, from which the admin creates accounts, sets passwords, changes allowances and switches accounts; and from each person, a page of that person's requests with a cancel action on approved requests that still have days from today on | settles: REQ-010, REQ-011, REQ-013, REQ-015, REQ-016
A-032 | human | 2026-11-24 | Q: If the admin has lowered an allowance since a vacation request was sent, may the admin still approve it, leaving the balance below zero? | A: accepted as recommended: yes, the admin may approve it, and the page shows the days left the approval would leave, below zero if so | settles: REQ-009, REQ-008
A-033 | human | 2026-11-24 | Q: Switching off a leaver cancels their pending requests, including past sick days or taken vacation never decided; what should happen? | A: accepted as recommended: switching an account off is refused while it holds a pending request with a Monday to Friday day before today; the admin decides those first | settles: REQ-016
A-034 | human | 2026-11-24 | Q: When a password is set or changed, do other open sessions of that account keep working? | A: accepted as recommended: setting or changing a password ends every other open session of that account | settles: REQ-015 | unchanged: REQ-014
A-035 | human | 2026-11-24 | Q: Only sick days can be asked for in the past, so a colleague may infer sickness from an absence appearing on past calendar days; is that acceptable? | A: accepted as recommended: accepted as a known limit; the calendar keeps showing only away, and nothing else changes | settles: INV-002 | unchanged: INV-002, REQ-004, REQ-012 | importance: priority
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

### 2026-11-24 — pause 2 sitting

```vid-prd-findings
F-04 | audit | blocking | DIM-lifecycle, REQ-010, REQ-016, REQ-017 | accepted A-030 | evidence: a partly cancelled approved request had no defined state, range or record; marking it cancelled broke the balance, overwriting its last day lost the cancel act; the owner ruled it stays approved, shortened, with the cancel recorded
F-05 | audit | blocking | DIM-operations, REQ-010, REQ-011, REQ-013, REQ-015, REQ-016 | accepted A-031 | evidence: no admin surface named for finding another person's approved request or for account work, so cancel and account actions had nowhere to live; the owner ruled a people page and a per-person requests page
F-06 | audit | advisory | DIM-balance-accounting, REQ-009, REQ-011 | accepted A-032 | evidence: approval after a lowered allowance could leave a negative balance with no rule for or against; the owner ruled approval is allowed and the resulting days left are shown
```

### 2026-11-24 — pause 3 sitting

```vid-prd-findings
F-07 | lens | advisory | REQ-004 | repaired | evidence: arms: 1 retained, 2 retained, 3 retained, 4 retained, 5 retained, 6 strengthened — now: (6) a request is accepted or refused differently from how it would be if today, the current year and the next year were all read from the date in the team's time zone at the moment it is sent
F-08 | lens | advisory | REQ-014 | repaired | evidence: arms: 1 strengthened, 2 retained, 3 retained, 4 retained, 5 retained — now: (1) someone who is not signed in sees any page's content or any data other than the sign-in page, or causes any action's effect
F-09 | lens | advisory | REQ-015 | repaired | evidence: arms: 1 retained, 2 strengthened, 3 retained, 4 retained — now: (2) a person's own password is changed through their session by a change that does not carry their correct current password
F-10 | lens | advisory | REQ-020 | repaired | evidence: arms: 1 retained, 2 retained, 3 retained, 4 strengthened — now: (4) anyone but the admin sees any account's email, switched-on state, allowance or days left that the page lists, by the page or by any data the product sends them, or starts any of the page's account actions
F-11 | lens | advisory | REQ-021 | repaired | evidence: arms: 1 retained, 2 retained, 3 retained, 4 retained, 5 strengthened — now: (5) anyone but the admin sees another person's requests, by a page or by any data the product sends them, or cancels another person's request
F-12 | review | blocking | REQ-002, INV-001 | repaired | evidence: round 1 — the refusal's days left conflicted with the approved-only figure when pending days exist; the refusal now shows days left with pending days beside it (A-002)
F-13 | review | blocking | REQ-017, REQ-019, REQ-006, REQ-003 | repaired | evidence: round 1 — the request record could not hold a partial cancel without losing the range, the decider or the balance; it now keeps the days as sent, the cancel day and separate decided and cancelled records, and overlap counts only days in effect
F-14 | review | blocking | INV-003, REQ-012 | repaired | evidence: round 1 — sees only their own requests contradicted the team calendar; the calendar's away entries are now excepted
F-15 | review | blocking | INV-001 | repaired | evidence: round 1 — the balance invariant missed approval, switch-off, partial cancel, the people page and the forecast, and carried no cross-cutting; spans, events and surfaces added
F-16 | review | advisory | REQ-013, REQ-020, A-029 | repaired | evidence: round 1 — the name can be changed per A-029 but no item carried it; rename added to the people page and to the change record
F-17 | review | advisory | REQ-010, REQ-019, REQ-021 | repaired | evidence: round 1 — day meant any calendar day, leaving weekend remnants and empty cancels; now Monday to Friday days
F-18 | review | advisory | REQ-016, REQ-013 | repaired | evidence: round 1 — the switch-back-on sign-in arm ignored the 30-account limit; qualified by the limit
F-19 | review | advisory | REQ-015, REQ-014 | accepted A-034 | evidence: round 1 — a password set left other open sessions working; the owner ruled that a set or change ends every other session
F-20 | review | advisory | INV-002, REQ-004, REQ-012 | accepted A-035 | evidence: round 1 — only sick may be past, so a past-dated absence hints at sickness; the owner accepted it as a known limit
F-21 | review | advisory | DIM-identity, DIM-member-lifecycle, REQ-011 | repaired | evidence: round 1 — no account record and no per-year allowance; account data entity added with each year's allowance
F-22 | review | blocking | INV-001, REQ-022 | repaired | evidence: round 2 — the would-leave figure read as days left against the invariant; now a labelled forecast equal to the value after approval
F-23 | review | blocking | INV-003, REQ-001 | repaired | evidence: round 2 — sending a request in another person's name was unguarded; nobody, the admin included, sends for another, and the guard spans sending
F-24 | review | blocking | REQ-015 | repaired | evidence: round 2 — the admin could set their own password without the current one; the admin now changes their own like anyone
F-25 | review | blocking | REQ-016, A-022 | accepted A-033 | evidence: round 2 — switch-off cancelled real past pending absences; the owner ruled switch-off is refused while a past pending request remains
```

review: whole, round 3, 19 findings

### 2026-11-24 — strength pass

```vid-prd-findings
F-26 | strength | blocking | INVENTORY.md:ROW-002, INVENTORY.md:ROW-003, INVENTORY.md:ROW-026 | repaired | evidence: round 1 — a count dropping the last day and refusing one-day ranges passed; counted-days row added
F-27 | strength | advisory | INVENTORY.md:ROW-012, INVENTORY.md:ROW-013 | repaired | evidence: round 1 — a weekend-only overlap refused; row added that it is accepted
F-28 | strength | blocking | INVENTORY.md:ROW-020 | repaired | evidence: round 1 — today from the container clock passed when zones agreed; team zone far from container, controlled clock
F-29 | strength | advisory | INVENTORY.md:ROW-025 | repaired | evidence: round 1 — newest-first order unchecked; order row added
F-30 | strength | advisory | INVENTORY.md:ROW-007, INVENTORY.md:ROW-008, INVENTORY.md:ROW-033, INVENTORY.md:ROW-035 | repaired | evidence: round 1 — one running balance passed with single-year cases; cross-year cases added
F-31 | strength | blocking | INVENTORY.md:ROW-048, INVENTORY.md:ROW-049, INVENTORY.md:ROW-052, INVENTORY.md:ROW-057 | repaired | evidence: round 1 — no way to set today in tests; test clock and moved-clock cases added
F-32 | strength | advisory | INVENTORY.md:ROW-049, INVENTORY.md:ROW-050 | repaired | evidence: round 1 — off-by-one at today; yesterday, today, tomorrow case
F-33 | strength | advisory | INVENTORY.md:ROW-052 | repaired | evidence: round 1 — a cancel with only weekend days left; Wednesday to Sunday case
F-34 | strength | advisory | INVENTORY.md:ROW-038 | repaired | evidence: round 1 — oldest first keyed on first day; sent-order case
F-35 | strength | advisory | INVENTORY.md:ROW-039 | repaired | evidence: round 1 — days left shown for the wrong year; next-year case
F-36 | strength | advisory | INVENTORY.md:ROW-041 | repaired | evidence: round 1 — the 200 limit at the boundary and in bytes; server-side cases
F-37 | strength | advisory | INVENTORY.md:ROW-040, INVENTORY.md:ROW-043 | repaired | evidence: round 1 — approve acting on the wrong row, simultaneous decisions; cases added
F-38 | strength | advisory | INVENTORY.md:ROW-044 | repaired | evidence: round 1 — a member approving their own request; case added
F-39 | strength | advisory | INVENTORY.md:ROW-046, INVENTORY.md:ROW-059 | repaired | evidence: round 1 — month-boundary and sick days missing from the calendar; cases added
F-40 | strength | advisory | INVENTORY.md:ROW-053, INVENTORY.md:ROW-054, INVENTORY.md:ROW-058, INVENTORY.md:ROW-062 | repaired | evidence: round 1 — arms narrower than their requirement; cases added
F-41 | strength | blocking | INVENTORY.md:ROW-065 | repaired | evidence: round 1 — the 30 limit counting switched-off accounts; boundary cases
F-42 | strength | blocking | INVENTORY.md:ROW-070 | repaired | evidence: round 1 — sessions revived by switch-on; replay case
F-43 | strength | blocking | INVENTORY.md:ROW-071 | repaired | evidence: round 1 — sign-out clearing only the browser cookie; replay case
F-44 | strength | blocking | INVENTORY.md:ROW-072, INVENTORY.md:ROW-076, INVENTORY.md:ROW-077 | repaired | evidence: round 1 — admin-only paths tested as a member; actor corrected, admin-set case
F-45 | strength | blocking | INVENTORY.md:ROW-079, INVENTORY.md:ROW-084 | repaired | evidence: round 1 — over-strict switch-off refusal; future-only and weekend-only cases
F-46 | strength | blocking | INVENTORY.md:ROW-080, INVENTORY.md:ROW-089, INVENTORY.md:ROW-091, INVENTORY.md:ROW-092, INVENTORY.md:ROW-093 | repaired | evidence: round 1 — switch-off re-cancelling a partly cancelled request; row added
F-47 | strength | blocking | INVENTORY.md:ROW-091, INVENTORY.md:ROW-092, INVENTORY.md:ROW-093, INVENTORY.md:ROW-094, INVENTORY.md:ROW-095, INVENTORY.md:ROW-096 | repaired | evidence: round 1 — partial cancel tested under one trigger only; both triggers
F-48 | strength | blocking | INVENTORY.md:ROW-088, INVENTORY.md:ROW-089, INVENTORY.md:ROW-090, INVENTORY.md:ROW-110 | repaired | evidence: round 1 — admin acts tested as a member; actor and per-act cases
F-49 | strength | blocking | INVENTORY.md:ROW-109, INVENTORY.md:ROW-110, INVENTORY.md:ROW-111 | repaired | evidence: round 1 — no per-year allowance history observable; clock case
F-50 | strength | blocking | INVENTORY.md:ROW-100 | repaired | evidence: round 1 — the row forbade a member their own days left; reworded to other accounts
F-51 | strength | blocking | INVENTORY.md:ROW-108 | repaired | evidence: round 1 — forecast wrong with two pending or next year; cases
F-52 | strength | blocking | INVENTORY.md:ROW-103, INVENTORY.md:ROW-104 | repaired | evidence: round 1 — cancel action on partly cancelled or weekend-only requests; cases
F-53 | strength | advisory | INVENTORY.md:ROW-067, INVENTORY.md:ROW-100, INVENTORY.md:ROW-105 | repaired | evidence: round 1 — hand-written route lists; route folder enumeration
F-54 | strength | advisory | INVENTORY.md:ROW-105 | repaired | evidence: round 1 — calendar response shape; case
F-55 | strength | advisory | INVENTORY.md:ROW-066 | repaired | evidence: round 1 — denial row tested as admin; member and anonymous
F-56 | strength | advisory | INVENTORY.md:ROW-063, INVENTORY.md:ROW-064 | repaired | evidence: round 1 — blank fields and switched-off duplicate; cases
F-57 | strength | advisory | INVENTORY.md:ROW-087 | repaired | evidence: round 1 — free-text keys stored; case
F-58 | strength | advisory | INVENTORY.md:ROW-095, INVENTORY.md:ROW-097 | repaired | evidence: round 1 — weekend-only past part; switched-off and admin listed
F-59 | strength | blocking | INVENTORY.md:ROW-198, INVENTORY.md:ROW-143 | repaired | evidence: round 1 — cancel day undefined for whole cancels; defined and row added
F-60 | strength | advisory | INVENTORY.md:ROW-153 | repaired | evidence: round 1 — oracle from stored rows; reference model
F-61 | strength | advisory | INVENTORY.md:ROW-133, INVENTORY.md:ROW-137, INVENTORY.md:ROW-146, INVENTORY.md:ROW-153 | repaired | evidence: round 1 — time reads bypassing the clock; clock-reads rule added
F-62 | strength | advisory | INVENTORY.md:ROW-158 | repaired | evidence: round 1 — weekday helper shifted consistently; independent oracle
F-63 | strength | advisory | INVENTORY.md:ROW-151, INVENTORY.md:ROW-203 | repaired | evidence: round 1 — lazy versus eager year records; allowance stored as changes by starting year
F-64 | strength | advisory | INVENTORY.md:ROW-144 | repaired | evidence: round 1 — switch-on and concurrent creates at the limit; cases
F-65 | strength | advisory | INVENTORY.md:ROW-204 | repaired | evidence: round 1 — which name shows after rename; current name by id
F-66 | strength | advisory | INVENTORY.md:ROW-232, INVENTORY.md:ROW-233 | repaired | evidence: round 1 — trimmed passwords; cases
F-67 | strength | advisory | INVENTORY.md:ROW-237 | repaired | evidence: round 1 — space evasion of the bound; case
F-68 | strength | advisory | INVENTORY.md:ROW-216, INVENTORY.md:ROW-214 | repaired | evidence: round 1 — blank name on create, counting unit; cases
F-69 | strength | blocking | INVENTORY.md:ROW-118, INVENTORY.md:HOS-013, INVENTORY.md:RULE-003 | repaired | evidence: round 1 — admin reads outside the admin folder; route enumeration and extractor
F-70 | strength | blocking | INVENTORY.md:HOS-012, INVENTORY.md:RULE-002 | repaired | evidence: round 1 — kind leaking under another name or in page payload; fixture-pair comparison and extractor
F-71 | strength | blocking | INVENTORY.md:HOS-001, INVENTORY.md:HOS-002, INVENTORY.md:HOS-003 | repaired | evidence: round 1 — setups too easy to tell wrong balance checks apart; setups strengthened
F-72 | strength | blocking | INVENTORY.md:HOS-004 | repaired | evidence: round 1 — sick taken at approval; approve step added
F-73 | strength | advisory | INVENTORY.md:HOS-005 | repaired | evidence: round 1 — disable toggle not observable with a synchronous store; pause hook
F-74 | strength | advisory | INVENTORY.md:HOS-011 | repaired | evidence: round 1 — expected value used days as sent; days in effect
F-75 | strength | advisory | INVENTORY.md:ROW-129 | repaired | evidence: round 1 — property without a moving clock; merged into the stronger property row
F-76 | strength | advisory | INVENTORY.md:ROW-120 | repaired | evidence: round 1 — range inside one week; weekend-crossing range
F-77 | strength | advisory | INVENTORY.md:ROW-121 | repaired | evidence: round 1 — cancelled request kind unstated; vacation
F-78 | strength | advisory | INVENTORY.md:ROW-124 | repaired | evidence: round 1 — send order equal to date order; differing order
F-79 | strength | advisory | INVENTORY.md:ROW-122 | repaired | evidence: round 1 — clipped names counted visible; bounding boxes
F-80 | strength | blocking | INVENTORY.md:RULE-001 | repaired | evidence: round 1 — census by a literal name; extractor over every site
F-81 | strength | blocking | INVENTORY.md:RULE-002 | repaired | evidence: round 1 — census by the literal word kind; extractor over member responses
F-82 | strength | blocking | INVENTORY.md:RULE-003 | repaired | evidence: round 1 — census over one folder; extractor over admin operations
F-83 | strength | advisory | INVENTORY.md:ROW-020, INVENTORY.md:ROW-048, INVENTORY.md:ROW-133 | repaired | evidence: round 1 — clock stand-in undeclared; difference row and production refusal row
F-84 | strength | advisory | INVENTORY.md:ROW-235, INVENTORY.md:ROW-237 | repaired | evidence: round 1 — bound per account revealed account existence; keyed on submitted email
F-85 | strength | advisory | INVENTORY.md:ROW-048, INVENTORY.md:ROW-137 | repaired | evidence: round 1 — time-worded rows tied to a role; actor process
F-86 | strength | advisory | INVENTORY.md:ROW-072, INVENTORY.md:ROW-077, INVENTORY.md:ROW-088, INVENTORY.md:ROW-089, INVENTORY.md:ROW-090, INVENTORY.md:ROW-109, INVENTORY.md:ROW-110 | repaired | evidence: round 1 — actor member on admin acts; corrected
F-87 | strength | advisory | INVENTORY.md:ROW-046, INVENTORY.md:ROW-059, INVENTORY.md:ROW-176, INVENTORY.md:ROW-002, INVENTORY.md:ROW-061 | noted | evidence: round 1 — repeated obligations from overlapping arms; kept, one test may cite both
F-88 | strength | advisory | INVENTORY.md:ROW-125, INVENTORY.md:ROW-126, INVENTORY.md:ROW-174, INVENTORY.md:ROW-128, INVENTORY.md:ROW-170, INVENTORY.md:ROW-236, INVENTORY.md:ROW-164, INVENTORY.md:ROW-166, INVENTORY.md:ROW-195 | noted | evidence: round 1 — repeated control siblings; kept
F-89 | strength | blocking | INVENTORY.md:ROW-118, INVENTORY.md:ROW-058, INVENTORY.md:ROW-059 | repaired | evidence: round 2 — route sweep forbade the calendar; carve-out
F-90 | strength | blocking | INVENTORY.md:ROW-105, INVENTORY.md:HOS-012 | repaired | evidence: round 2 — rows disagreed on ids; one wording
F-91 | strength | blocking | INVENTORY.md:RULE-003 | repaired | evidence: round 2 — list pending and forecast missing; deny by default
F-92 | strength | blocking | INVENTORY.md:ROW-244 | repaired | evidence: round 2 — order case could not tell send from date order; case
F-93 | strength | blocking | INVENTORY.md:ROW-198, INVENTORY.md:ROW-089 | repaired | evidence: round 2 — decider fields per state unstated; spelled out
F-94 | strength | blocking | INVENTORY.md:ROW-095 | repaired | evidence: round 2 — two case lines; merged
F-95 | strength | blocking | INVENTORY.md:ROW-244 | repaired | evidence: round 3 — case could not tell newest-sent from date order; three-request case, ruled by the owner
F-96 | strength | blocking | INVENTORY.md:ROW-105 | repaired | evidence: round 3 — member acting on another request id untested; row added, ruled by the owner
F-97 | strength | blocking | INVENTORY.md:ROW-105, INVENTORY.md:ROW-118 | repaired | evidence: round 3 — two wordings of a calendar entry; one wording, ruled by the owner
F-98 | strength | blocking | INVENTORY.md:ROW-198 | repaired | evidence: round 3 — canceller fields unenforced; added, ruled by the owner
```

review: whole, round 3, 73 findings

### 2026-11-24 — strength pass after the owner's rulings

```vid-prd-findings
F-99 | strength | blocking | INVENTORY.md:ROW-148, INVENTORY.md:ROW-054, INVENTORY.md:ROW-271 | repaired | evidence: round 1 — rows contradicted the next-year exception (A-046); exception added
F-100 | strength | blocking | INVENTORY.md:ROW-249 | repaired | evidence: round 1 — a short look-back passed; 31 January case for early last year
F-101 | strength | blocking | INVENTORY.md:ROW-246 | repaired | evidence: round 1 — own cancel keyed on first day passed; weekend-only past case
F-102 | strength | blocking | INVENTORY.md:ROW-148 | repaired | evidence: round 2 — no case observed a year after next; moved-clock case added
F-103 | strength | blocking | INVENTORY.md:ROW-148 | repaired | evidence: round 3 — combined same-year sequence untested; case added on the owner ruling
F-104 | strength | blocking | INVENTORY.md:ROW-148 | repaired | evidence: round 3 — protection applied to next-year changes of earlier years; case added on the owner ruling
F-105 | strength | blocking | INVENTORY.md:ROW-148 | repaired | evidence: year-turn loop round 1 — clause on earlier years untested by the row; held by ROW-110 and ROW-111, clause moved there
F-106 | strength | blocking | INVENTORY.md:ROW-148 | repaired | evidence: year-turn loop round 1 — clause on the current year after a next-year change untested by the row; held by ROW-251, clause moved there
```

review: delta, round 2, 8 findings

### 2026-11-24 — final review

```vid-prd-findings
F-122 | final | blocking | DECISIONS.md:D-019, INVENTORY.md:ROW-151, REQ-011 | repaired | evidence: round 1 — "the latest change" read as most recently made would lose a next-year raise A-046 protects; D-025 replaces D-019 with the exact rule and ROW-151 reworded
F-123 | final | blocking | INVENTORY.md:ROW-175, INVENTORY.md:ROW-173, INVENTORY.md:ROW-105, INVENTORY.md:ROW-118, INVENTORY.md:ROW-179 | repaired | evidence: round 1 — the rows disagreed on an optional opaque account id in the calendar response; aligned
F-124 | final | blocking | INVENTORY.md:ROW-237, INVENTORY.md:ROW-238, DECISIONS.md:D-017 | repaired | evidence: round 1 — the sign-in bound had no numbers and D-017 said refused attempts were unrecorded; D-026 sets 5 attempts in 15 minutes and a 15-minute wait, replacing that part of D-017
F-125 | final | advisory | INVENTORY.md:ROW-121, REQ-025 | repaired | evidence: round 1 — the admin journey skipped the confirmation step; transitions carry it
F-126 | final | advisory | INVENTORY.md:ROW-031, REQ-006, DECISIONS.md:D-020 | repaired | evidence: round 1 — "from which day" undefined for whole cancels; the page shows the whole request cancelled
F-127 | final | advisory | INVENTORY.md:ROW-275, INVENTORY.md:ROW-276, INVENTORY.md:ROW-277, REQ-025 | repaired | evidence: round 1 — "each irreversible action" could not be measured; actions named per page
F-128 | final | advisory | GRADING-CHECKLIST.md, INVENTORY.md:ROW-113, INVENTORY.md:ROW-116, REQ-026 | repaired | evidence: round 1 — "about as long" unmeasurable and the shell rows ignored the forced password change; reworded
F-129 | final | blocking | DECISIONS.md:D-006, INVENTORY.md:ROW-175 | repaired | evidence: round 2 — D-006 still said names and days only; D-027 replaces it
```

review: final, round 3, 8 findings, read: PRD.md ARCHITECTURE.md DECISIONS.md BASELINE.md INVENTORY.md GRADING-CHECKLIST.md

## Ratifications

- 2026-11-24 — thesis+contract — f1f976d
- 2026-11-24 — gap answers — 32a451f
- 2026-11-24 — final — 79c4c23

## Appends

<!-- Append-only below this line. -->

### 2026-11-24 (questions raised by the test list's expert reviews)

RESOLVED: (OQ-1) A-036 — Sick days on 30 and 31 December can no longer be recorded once it is 1 January, because requests must stay within the current or next year; should sick requests for last year's days be allowed during January?

RESOLVED: (OQ-2) A-037 — Two people can have the same display name, so the calendar cannot tell them apart; should a display name already used by another switched-on account be refused?

RESOLVED: (OQ-3) A-038 — A person can cancel their own pending vacation after its days have passed, so leave actually taken disappears from the record; should cancelling one's own pending request be refused once it has a weekday before today?

RESOLVED: (OQ-4) A-039 — A person who falls sick during approved vacation cannot record those days as sick, since they overlap and past days cannot be cancelled; is that the team's policy for the first version?

RESOLVED: (OQ-5) A-040 — Approve, reject, cancel approved days and switch off cannot be undone; should each ask for a confirmation that says exactly what will change?

RESOLVED: (OQ-6) A-041 — A password the admin sets (the first one, or a reset) stays in use, so the admin could sign in as that person unseen; should the person be made to choose their own password at their next sign-in?

RESOLVED: (OQ-7) A-042 — A decision on days already past cannot be corrected (a wrongly approved or rejected past vacation); should the admin be able to correct it in the first version, or is it a known limit fixed by hand in the database?

RESOLVED: (OQ-8) A-043 — Any allowance change also changes the current year; should the admin be able to set next year's allowance on its own?

RESOLVED: (OQ-9) A-044 — A mistyped email cannot be corrected, so the person cannot sign in until a new account is made; should the admin be able to change an account's email?

RESOLVED: (OQ-10) A-045 — The change records hold who and when but not what changed, and nobody can read them in the product; should allowance and name changes record the old and new value and show them to the admin on the person's page?

### 2026-11-24 (test list sitting rulings)

```vid-prd-answers
A-036 | human | 2026-11-24 | Q: Sick days on 30 and 31 December cannot be recorded once it is 1 January; allow sick requests for last year's days during January? | A: accepted as recommended, asked on its own: during January a sick request may cover weekdays of the previous calendar year; vacation and every other request keep the limit of the current and next year | settles: REQ-004, OQ-1
A-037 | human | 2026-11-24 | Q: Two people can share a display name; refuse a name another switched-on account already uses? | A: accepted as recommended: a display name already used by another switched-on account, ignoring letter case, is refused at create, rename and switch-on | settles: REQ-024, OQ-2 | unchanged: REQ-013, REQ-020, REQ-016
A-038 | human | 2026-11-24 | Q: Refuse a person's cancel of their own pending request once it has a weekday before today? | A: accepted as recommended, asked on its own: a person cannot cancel their own pending request once it has a weekday before today; the admin approves or rejects it | settles: REQ-005, OQ-3
A-039 | human | 2026-11-24 | Q: Someone who falls sick during approved vacation cannot record those days as sick; acceptable for the first version? | A: accepted as recommended: a known limit for the first version; such days stay recorded as vacation | settles: OQ-4 | unchanged: REQ-003, REQ-010
A-040 | human | 2026-11-24 | Q: Should approve, reject, cancel approved days and switch off ask for a confirmation saying what will change? | A: accepted as recommended: each asks for a confirmation naming the person, the days and what will change, and nothing happens until it is confirmed | settles: REQ-025, OQ-5
A-041 | human | 2026-11-24 | Q: After the admin sets a password, must the person choose their own at next sign-in? | A: accepted as recommended: after the admin sets a password, at create or as a reset, the person must choose a new password at their next sign-in before reaching any other page | settles: REQ-026, OQ-6 | unchanged: REQ-015
A-042 | human | 2026-11-24 | Q: Allow the admin to correct a decision on days already past, or keep it as a known limit? | A: accepted as recommended: a known limit for the first version, fixed by hand in the database by whoever runs the server | settles: OQ-7 | unchanged: REQ-009, REQ-010
A-043 | human | 2026-11-24 | Q: Let the admin set an allowance that starts next year, leaving this year unchanged? | A: accepted as recommended, asked on its own: when changing an allowance the admin chooses whether it starts this year or next year; a change starting next year leaves this year's allowance and days left unchanged | settles: REQ-011, OQ-8
A-044 | human | 2026-11-24 | Q: Let the admin change an account's email? | A: accepted as recommended: the admin can change an account's email from the people page, unique and compared the same way as at create, and the change is recorded | settles: REQ-027, OQ-9 | unchanged: REQ-020 | importance: priority
A-045 | human | 2026-11-24 | Q: Record old and new values for allowance and name changes and show them to the admin? | A: accepted as recommended: allowance and name changes record the old and new value, and the admin sees each person's change history on that person's requests page | settles: REQ-018, REQ-028, OQ-10 | importance: priority
A-046 | human | 2026-11-24 | Q: The admin set next year's allowance to 30; later this year's is corrected to 26; what happens to next year's 30? | A: accepted as recommended: next year keeps its 30; a change starting this year applies to this year and to later years that have no allowance of their own set by a change starting next year, so a next-year allowance is never lost silently | settles: REQ-011
A-018 AMENDED | model_proposed | 2026-11-24 | Q: What happens when the admin changes an allowance, and what does a joiner get? | A: a changed allowance starts this year or next year as the admin chooses (A-043); lowering it below the days already approved is allowed and shows a negative balance; approved requests are never changed by it; a person who joins mid-year gets the full number the admin sets, with no proration | settles: thesis, MECH-07
A-020 AMENDED | model_proposed | 2026-11-24 | Q: How far ahead may a request go? | A: requests may cover days in the current calendar year and the next one, and during January a sick request may also cover weekdays of the previous year (A-036); each year's balance uses that year's allowance | settles: thesis, MECH-02
A-026 AMENDED | model_proposed | 2026-11-24 | Q: Can the admin enter a request on someone's behalf, or edit one? | A: no; only the person sends their own requests, and nobody edits a request; to change days a person cancels a pending request that has no weekday before today and sends a new one, or asks the admin to decide or cancel it | settles: thesis
A-047 | human | 2026-11-24 | Q: Add a failure test that a change starting this year also reaches later years, except a year already scheduled by a next-year change made this year? | A: accepted as recommended: yes, the test is added; a change starting this year reaches every later year except one scheduled by a next-year change made this year | settles: REQ-011
```

```vid-prd
REQ-004 AMENDED | functional | T1 | Which days may be requested: a vacation request may not include a day before today, a sick request may; every request lies within the current or the next calendar year, except that during January a sick request may cover weekdays of the previous calendar year; no request crosses 31 December; today is decided in the team's one time zone. | fail-if: (1) a vacation request that includes a day before today is accepted; (2) a sick request is refused because its days are before today; (3) a vacation request with a day before 1 January of the current year is accepted; (4) a request with a day after 31 December of the next year is accepted; (5) a request whose first and last days fall in different years is accepted; (6) a request is accepted or refused differently from how it would be if today, the current year and the next year were all read from the date in the team's time zone at the moment it is sent; (7) a sick request with a day before 1 January of the current year is accepted when sent outside January, or with a day before 1 January of the previous year at any time; (8) a sick request sent in January for weekdays of the previous year is refused because those days fall in the previous year | serves: G1 — sick days are often told after the fact, vacation is planned ahead, and the yearly allowance only works if each request belongs to one year | authority: provisional | confirms_via: owner-decision/no | source: A-003, A-004, A-019, A-020, A-036 | covers: DIM-request-window, DIM-leave-year | phase: pilot | feature: FEAT-01 | arms: 1 retained, 2 retained, 3 withdrawn A-036, 4 retained, 5 retained, 6 retained | plain: Vacation cannot be for past days, sick can; requests stay within this year or next, except sick days of last year during January.
REQ-005 AMENDED | functional | T1 | A person can cancel their own request while it is pending and has no weekday before today; it becomes cancelled, its days stop counting as pending, and it can never be decided afterwards; a person cannot cancel their own approved, rejected or cancelled request, nor a pending one that has a weekday before today, which the admin decides. | fail-if: (1) a person cannot cancel their own pending request that has no weekday before today; (2) a cancelled request's days still count as pending or still block a new request for those days; (3) a cancelled request can later be approved or rejected; (4) a person cancels their own approved, rejected or cancelled request; (5) a person cancels their own pending request that has a weekday before today | serves: G1 — plans change before the admin answers, and the person should not need the admin to withdraw an ask, while leave already taken never vanishes | authority: authoritative | source: seed, A-007, A-038 | covers: DIM-lifecycle, DIM-core-loop-continuity | phase: pilot | feature: FEAT-01 | arms: 1 withdrawn A-038, 2 retained, 3 retained, 4 retained | plain: A person can cancel their own pending request until it has a past weekday; after that only the admin decides it.
REQ-011 AMENDED | functional | T1 | The admin sets each person's yearly vacation allowance as a whole number of days, zero or more, choosing whether the change starts this year or next year; a change starting next year sets next year's allowance and every later year's and leaves this year unchanged; a change starting this year applies at once to the current year and to every later year, except a year whose allowance was set by a change starting next year made during the current year; no change alters an approved request, and a change may leave a negative balance; a person who joins mid-year gets the full number set. | fail-if: (1) an allowance that is negative or not a whole number is accepted; (2) a change chosen to start this year does not change the current year's days left at once; (3) a changed allowance changes, cancels or shortens an approved request; (4) lowering an allowance below the approved days is refused; (5) a mid-year joiner's allowance is reduced in proportion to the date; (6) a change chosen to start next year changes the current year's allowance or days left, or does not change next year's, or does not change the allowance of the years after next year that no later change has set; (7) a change starting this year alters the allowance of a year after the current one that was set by a change starting next year made during the current year; (8) a change chosen to start this year does not change the allowance of a year after the current one that no change starting next year made during the current year has set | serves: G2 — the admin keeps each person's entitlement right as circumstances change, including a raise from next January | authority: provisional | confirms_via: owner-decision/no | source: seed, A-018, A-043, A-046, A-047 | covers: DIM-balance-accounting, DIM-member-lifecycle | phase: pilot | feature: FEAT-04 | arms: 1 retained, 2 withdrawn A-043, 3 retained, 4 retained, 5 retained | plain: The admin sets each person's yearly allowance in whole days, starting this year or next; it never touches approved requests.
REQ-018 AMENDED | data_entity | T2 | Every allowance change, name change, email change, password set and account switch records who did it and when, and allowance and name changes also record the old and new value, allowance changes with the year they start. | fail-if: (1) an allowance change, a name change, a password set or an account switch is stored with no record of who did it and when; (2) an allowance or name change is stored without its old and new value; (3) an email change is stored with no record of who did it and when; (4) an allowance change is stored without the year it starts | serves: G2 and G4 — a disputed balance or a lost access can be traced to the act that caused it, and to what it changed | authority: provisional | confirms_via: owner-decision/no | source: A-023, A-029, A-044, A-045 | covers: DIM-data-integrity/provenance | phase: pilot | feature: FEAT-04 | arms: 1 retained | plain: Each account change records who did it and when, and allowance and name changes also keep the old and new value.
REQ-024 | functional | T1 | A display name already used by another switched-on account, compared without regard to letter case or surrounding spaces, is refused when an account is created, renamed or switched on. | fail-if: (1) two switched-on accounts hold the same display name, ignoring letter case and surrounding spaces; (2) a name used only by a switched-off account is refused | serves: G3 — the calendar names people unambiguously | authority: authoritative | source: A-037 | covers: DIM-data-integrity/dedup | phase: pilot | feature: FEAT-06 | plain: Two switched-on accounts can never share a display name, ignoring letter case.
REQ-025 | ux_flow | T1 | Before approving, rejecting, cancelling approved days or switching an account off, the admin is asked to confirm in a step that names the person, the days and what will change, including which days are cancelled and which stay; nothing changes until the admin confirms, and when the effect at the moment of confirming differs from what was shown, nothing changes and the confirmation is shown again. | fail-if: (1) any of the four actions takes effect without a confirmation step; (2) the confirmation does not name the person, the days or what will change; (3) a cancel or switch-off confirmation does not say which days are cancelled and which stay; (4) declining the confirmation changes anything; (5) a confirmation is applied although its effect at the moment of confirming differs from what it showed | serves: G2 — an irreversible decision is never made by a mis-tap | authority: authoritative | source: A-040 | covers: DIM-operations | cross-cutting: pending page, person's requests page, people page | phase: pilot | feature: FEAT-03 | plain: Approve, reject, cancel approved days and switch-off each ask the admin to confirm, saying exactly what will change.
REQ-026 | functional | T1 | After the admin sets a person's password, at account creation or as a reset, the person must choose a new password at their next sign-in before reaching any other page; until then only choosing a new password or signing out is available to that session. | fail-if: (1) a person signed in with a password the admin set reaches any page or action other than choosing a new password or signing out; (2) the new password may equal the one the admin set; (3) after choosing, the admin-set password still signs in | serves: G4 — only the person knows their own password, so nobody can act in their name unseen | authority: authoritative | source: A-041 | covers: DIM-identity/signin_reauth | phase: pilot | feature: FEAT-06 | plain: After the admin sets someone's password, that person must choose their own at next sign-in before doing anything else.
REQ-027 | functional | T1 | From the people page the admin can change an account's email; the new email must not belong to another account, compared as at creation, and the account then signs in only with the new email. | fail-if: (1) the admin cannot change an account's email; (2) the new email is accepted when another account holds it, ignoring letter case and surrounding spaces; (3) after the change the old email still signs in or the new one does not; (4) anyone but the admin changes an email | serves: G4 — a mistyped email is fixed without a second account splitting the person's history | authority: authoritative | source: A-044 | covers: DIM-member-lifecycle, DIM-data-integrity/record_identity | phase: pilot | feature: FEAT-06 | plain: The admin can correct an account's email from the people page, keeping emails unique.
REQ-028 | ux_flow | T1 | On a person's requests page the admin sees that person's allowance and name change history, each change with its old and new value, for allowances the year it starts, who made it and when, newest first. | fail-if: (1) an allowance or name change is missing from the history; (2) a listed change lacks its old value, new value, who or when; (3) anyone but the admin sees the history; (4) a listed allowance change lacks the year it starts | serves: G2 — a disputed balance can be answered from the product itself | authority: authoritative | source: A-045 | covers: DIM-operations | phase: pilot | feature: FEAT-04 | plain: The admin sees each person's allowance and name changes, with old and new values, who and when.
REQ-013 AMENDED | functional | T1 | The admin creates an account with a display name, an email, a first password and an allowance; an email belongs to at most one account, compared without regard to letter case or surrounding spaces; at most 30 accounts are switched on at once, so creating a 31st is refused; there is no page where anyone signs themselves up. | fail-if: (1) an account is created without a name, an email, a password or an allowance; (2) two accounts share an email, compared without regard to letter case or surrounding spaces; (3) an account is created or switched on while 30 are already switched on; (4) anyone creates an account without being signed in as the admin | serves: G4 — the team is a closed group of known people the admin adds by hand | authority: provisional | confirms_via: owner-decision/no | source: seed, A-025, A-029, A-044 | covers: DIM-identity/tiers, DIM-data-integrity/record_identity, DIM-member-lifecycle | phase: pilot | feature: FEAT-06 | arms: 1 retained, 2 strengthened, 3 retained, 4 retained | plain: Only the admin creates accounts, each with a name, email, password and allowance; one account per email, and at most 30 switched on.
REQ-020 AMENDED | ux_flow | T1 | The admin has a people page listing every account with its name, email, whether it is switched on, its allowance for the current and the next year and its days left for the current and the next year; from it the admin creates accounts, changes a name, changes an email, sets a new password, changes an allowance and switches an account off or on. | fail-if: (1) an account is missing from the page; (2) a listed account lacks its name, email, switched-on state, either year's allowance or either year's days left; (3) any of the six account actions cannot be started from the page; (4) anyone but the admin sees any account's email, switched-on state, allowance or days left that the page lists, by the page or by any data the product sends them, or starts any of the page's account actions | serves: G2 and G4 — the one person who runs the team sees everyone's standing in one place and acts on it | authority: provisional | confirms_via: owner-decision/no | source: A-031, A-029, A-043, A-044 | covers: DIM-operations, DIM-member-lifecycle | phase: pilot | feature: FEAT-06 | arms: 1 retained, 2 strengthened, 3 strengthened, 4 retained | plain: The admin has one people page showing every account's name, email, on or off, both years' allowance and days left, and runs every account action from it.
REQ-023 AMENDED | data_entity | T1 | An account holds its display name, its email, unique without regard to letter case or surrounding spaces, its password, whether it is switched on, whether it is the admin, and the allowance in force for each calendar year, so a year keeps the allowance it had when a later change applies only from a later year on. | fail-if: (1) an account lacks any of the named fields; (2) changing an allowance changes the allowance recorded for a year before the current one; (3) a days-left figure for an earlier year is worked out from a later year's allowance | serves: G2 and G4 — the account carries everything the balance and the sign-in rules read, year by year | authority: provisional | confirms_via: owner-decision/no | source: seed, A-013, A-018, A-025, A-029, A-043, A-044 | covers: DIM-identity/tiers, DIM-member-lifecycle | phase: pilot | feature: FEAT-06 | arms: 1 retained, 2 retained, 3 retained | plain: An account holds the name, email, password, whether it is on, whether it is the admin, and each year's allowance.
INV-003 AMENDED | invariant | T0 | Only the admin approves, rejects, cancels approved requests, sets allowances, creates and renames accounts, changes an account's email, sets another person's password, switches accounts and sees a person's change history; a person acts only on their own requests and sees only their own requests and days left, apart from the calendar's away entries, which carry no kind; a refused attempt changes nothing. | serves: G2 and G4 — one person decides and runs the team, and everyone else's records are theirs alone | authority: authoritative | source: seed, A-005, A-007, A-008, A-044, A-045 | covers: DIM-authorization, DIM-approval-routing, DIM-absence-visibility | cross-cutting: every admin action, every person's own pages | spans: REQ-001, REQ-005, REQ-006, REQ-007, REQ-008, REQ-009, REQ-010, REQ-011, REQ-012, REQ-013, REQ-015, REQ-016, REQ-020, REQ-021, REQ-027, REQ-028 | phase: pilot | feature: FEAT-06 | plain: Only the admin can decide, cancel approved time, set allowances or run accounts; everyone else acts on and sees only their own requests and the calendar.
```

```vid-prd-findings
F-107 | review | blocking | REQ-004, REQ-003 | accepted A-047 | evidence: round 1 — arm 8 unconditional against the overlap refusal; reworded
F-108 | review | blocking | REQ-011 | accepted A-046 | evidence: round 1 — this-year change against a next-year allowance; owner ruled
F-109 | review | advisory | REQ-016, REQ-024 | repaired | evidence: round 1 — switch-on under the name rule; named unchanged
F-110 | review | advisory | REQ-027, REQ-013, REQ-023 | repaired | evidence: round 1 — email compared differently at create; spaces added
F-111 | review | advisory | REQ-024 | repaired | evidence: round 1 — names differing by spaces; spaces added
F-112 | review | advisory | REQ-026 | repaired | evidence: round 1 — no sign-out on the forced change page; allowed
F-113 | review | advisory | REQ-025 | repaired | evidence: round 1 — effect changing between showing and confirming; arm added
F-114 | review | advisory | REQ-025 | repaired | evidence: round 1 — unmarked cross-cutting; surfaces named
F-115 | review | advisory | REQ-018, REQ-028 | repaired | evidence: round 1 — allowance records without their starting year; added
F-116 | review | advisory | REQ-020 | repaired | evidence: round 1 — one allowance shown after a next-year change; both years
F-117 | review | advisory | INV-003 | repaired | evidence: round 1 — email change and history not admin-only; amended
F-118 | review | advisory | A-020 | repaired | evidence: round 1 — January sick exception not restated; amended
F-119 | review | advisory | A-018, A-026 | repaired | evidence: round 1 — rulings not restated; amended
F-120 | review | blocking | REQ-011, A-046 | repaired | evidence: round 2 — arms 2 and 7 contradicted once the scheduled year became current; reworded
F-121 | review | blocking | REQ-011 | accepted A-047 | evidence: round 3 — no arm checked propagation to later years; arm 8 added on the owner ruling
```

review: delta, round 4, 15 findings

### 2026-11-24 (stage cut)

```vid-prd-answers
A-048 | human | 2026-11-24 | Q: how should the product be delivered — in which stages? | A: one stage, the whole product at once, with no technical stage 0 | settles: contract
```

review: delta, round 1, 0 findings

### 2026-11-24 (sign-in limit ruling)

```vid-prd-answers
A-049 | human | 2026-11-24 | Q: must the 5-wrong-attempt limit at sign-in and at the change-password form also hold against wrong attempts sent all at the same moment, not only one after another? | A: no limit is needed for attempts sent at the same moment; it is not necessary at this stage — the limit covers attempts sent one after another | settles: REQ-014 | unchanged: REQ-014, REQ-015
```

```vid-prd-findings
F-130 | review | advisory | A-049, REQ-014 | repaired | evidence: round 1 — A-049 settled REQ-014 without amending it or listing it unchanged; the bound lives in D-026, D-033 and ROW-237/238, not in REQ-014's arms; repaired: unchanged: REQ-014, REQ-015 added (the A-034 pattern)
```

review: delta, round 2, 1 findings

### 2026-11-25 (double-submit ruling)

VID-QUESTION: (OQ-11) Should the rule that a double click, reload or Back never repeats a submit, nor shows a refusal of the person's own first submit, also cover every submitting control other than the send-request form — Cancel on a person's own requests, the change-password form, the forced new-password choice, the sign-in form, the admin's approve, reject, cancel and switch-off confirmations, and the people-page actions (create, rename, change email, set password, set allowance, switch)?

```vid-prd-answers
A-050 | human | 2026-11-25 | Q: does the rule that a double click, reload or Back never repeats a submitted form, nor shows a refusal of the person's own first submit, cover every submitting control a person operates, or only the send-request form? | A: (c) record it as a known limit: only the send-request form is covered; every other submitting control stays open as OQ-11 | settles: REQ-003 | unchanged: REQ-003, REQ-005, REQ-009, REQ-014, REQ-015, REQ-020, REQ-025, REQ-026
```

```vid-prd-findings
F-131 | review | advisory | A-050 | repaired | evidence: round 1 — OQ-11 named only Cancel and the change-password form while the answer left every other submitting control uncovered; repaired: OQ-11 names every submitting control but the send-request form
F-132 | review | advisory | A-050 | repaired | evidence: round 1 — A-050 ruled on controls of REQ-005 and REQ-015 without listing them unchanged; repaired: unchanged names REQ-005, REQ-014, REQ-015, REQ-020, REQ-025, REQ-026 beside REQ-003 and REQ-009
F-133 | review | advisory | A-050 | repaired | evidence: round 1 — the heading's date (2026-11-25, UTC) disagreed with A-050's 2026-11-24; repaired: A-050 dated 2026-11-25, the UTC day the ruling was given
```

review: delta, round 2, 3 findings

### 2026-11-25 (sign-in answers and session renewal rulings)

```vid-prd-answers
A-051 | human | 2026-11-25 | Q: must a switched-off account's sign-in answer like a wrong password over repeated attempts too (its correct password counting toward the 15-minute wait), not only on a single attempt? | A: not necessary — the product is for the owner's personal use with controlled access; single attempts answer alike, and a switched-off account's correct password need not count toward the 15-minute wait | settles: REQ-014 | unchanged: REQ-014
A-052 | human | 2026-11-25 | Q: must the renewal of the session identifier at sign-in also make the identifier from before stop working? | A: not necessary — the product is for the owner's personal use with controlled access; a new identifier is issued at each sign-in | settles: REQ-014 | unchanged: REQ-014
```

review: delta, round 1, 0 findings
