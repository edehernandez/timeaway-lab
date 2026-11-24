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

```vid-prd
REQ-001 | functional | T1 | A signed-in person sends a request for themselves with a kind, vacation or sick, and a first and last day; only the Monday to Friday days in the range are counted as requested days, and the new request starts pending. | fail-if: (1) a request is created with a kind other than vacation or sick; (2) a Saturday or Sunday inside the range is counted as a requested day or shown as away; (3) a range containing no Monday to Friday day is accepted; (4) a range whose last day is before its first day is accepted; (5) a new request starts in any state other than pending | serves: G1 — whole working days are the only unit the team takes off, so every count and every calendar day rests on this | authority: provisional | confirms_via: owner-decision/no | source: seed, A-017 | covers: DIM-day-counting, DIM-lifecycle | phase: pilot | feature: FEAT-01 | plain: A person asks for days off as vacation or sick by first and last day, and only Monday to Friday days count.
REQ-002 | functional | T0 | A vacation request is refused when its counted days exceed the person's allowance for that year minus the vacation days already approved or pending in that year, and the refusal shows the days left; sick requests are never checked against or taken from the allowance. | fail-if: (1) a vacation request whose counted days exceed the allowance minus the approved and pending vacation days of its year is accepted; (2) a vacation request within that number is refused; (3) the refusal does not show the days left; (4) a sick request is refused for lack of allowance or changes the days left; (5) two vacation requests sent at the same moment are both accepted although together they exceed the days left | serves: G1 and G2 — a balance that can be overdrawn is not a balance; refusing at the door keeps every number right without the admin checking sums | authority: authoritative | source: seed, A-001, A-002, A-004 | covers: DIM-balance-accounting | phase: pilot | feature: FEAT-01 | plain: A vacation request that asks for more days than are left, counting pending ones, is refused and shows the days left; sick days never use allowance.
REQ-003 | functional | T1 | A request that shares a day with the same person's pending or approved request is refused, whatever the kinds of the two requests. | fail-if: (1) a person ends up with two pending or approved requests that share a day; (2) a request is refused because it shares a day only with the person's own rejected or cancelled request; (3) a request is refused because it shares a day with another person's request | serves: G1 and G3 — one day is one absence, so balances and the calendar never count a day twice | authority: provisional | confirms_via: owner-decision/no | source: A-014 | covers: DIM-data-integrity/dedup | phase: pilot | feature: FEAT-01 | plain: A person cannot have two live requests on the same day; a request that overlaps their pending or approved one is refused.
REQ-004 | functional | T1 | Which days may be requested: a vacation request may not include a day before today, a sick request may; every request lies within the current or the next calendar year and may not cross 31 December; today is decided in the team's one time zone. | fail-if: (1) a vacation request that includes a day before today is accepted; (2) a sick request is refused because its days are before today; (3) a request with a day before 1 January of the current year is accepted; (4) a request with a day after 31 December of the next year is accepted; (5) a request whose first and last days fall in different years is accepted; (6) whether a day is before today is decided in any time zone other than the team's | serves: G1 — sick days are often told after the fact, vacation is planned ahead, and the yearly allowance only works if each request belongs to one year | authority: provisional | confirms_via: owner-decision/no | source: A-003, A-004, A-019, A-020 | covers: DIM-request-window, DIM-leave-year | phase: pilot | feature: FEAT-01 | plain: Vacation cannot be for past days, sick can; requests stay within this year or next and never cross 31 December.
REQ-005 | functional | T1 | A person can cancel their own request while it is pending; it becomes cancelled, its days stop counting as pending, and it can never be decided afterwards; a person cannot cancel their own approved, rejected or cancelled request. | fail-if: (1) a person cannot cancel their own pending request; (2) a cancelled request's days still count as pending or still block a new request for those days; (3) a cancelled request can later be approved or rejected; (4) a person cancels their own approved, rejected or cancelled request | serves: G1 — plans change before the admin answers, and the person should not need the admin to withdraw an ask | authority: authoritative | source: seed, A-007 | covers: DIM-lifecycle, DIM-core-loop-continuity | phase: pilot | feature: FEAT-01 | plain: A person can cancel their own request only while it is still pending, and it then stops counting.
REQ-006 | ux_flow | T1 | A person's own requests page lists every request they have sent, newest first, each with its kind, first and last day, counted days, state, who decided or cancelled it and when, and the admin's rejection note if any; with no requests it says so and offers to send one; it shows no other person's requests. | fail-if: (1) a request the person sent is missing from the page; (2) a listed request lacks its kind, its days, its count or its state; (3) a decided request does not show who decided it and when; (4) a rejected request with a note does not show the note; (5) the empty page shows a bare list with no message and no way to send a request; (6) the page shows any other person's request | serves: G1 — the person always knows where each ask stands without asking the admin | authority: provisional | confirms_via: owner-decision/no | source: seed, A-015, A-023 | covers: DIM-core-loop-continuity, DIM-absence-visibility | phase: pilot | feature: FEAT-02 | plain: Each person sees all their own requests with their state, who decided them and when, and any rejection note, and nobody else's.
REQ-007 | functional | T1 | A person sees their vacation days left for the current year and for the next year, each as the allowance minus the approved vacation days counted in that year, with the pending vacation days of that year shown beside it; a negative number is shown as negative. | fail-if: (1) either year's days left is missing; (2) a days-left number differs from the allowance minus that year's approved vacation days; (3) pending days are subtracted from the days-left number instead of shown beside it; (4) a year's pending vacation days are missing or wrong; (5) a negative balance is shown as zero or hidden | serves: G1 — the person plans time off against a number they can trust, for this year and next | authority: provisional | confirms_via: owner-decision/no | source: seed, A-002, A-018, A-020, A-027 | covers: DIM-balance-accounting, DIM-leave-year | phase: pilot | feature: FEAT-02 | plain: Each person sees vacation days left for this year and next, counting approved days, with pending days shown beside each.
REQ-008 | ux_flow | T1 | The admin has a pending requests page listing every pending request of every person, oldest first, each with the person's name, kind, first and last day and counted days, and for vacation that person's days left in its year; from it the admin approves a request, or rejects it with an optional note of at most 200 characters; with nothing pending it says so. | fail-if: (1) a pending request of any person, the admin included, is missing from the page; (2) the list is not ordered oldest first; (3) a vacation request is shown without the person's days left in its year; (4) a request cannot be approved or rejected from the page; (5) a rejection note longer than 200 characters is accepted, or a rejection without a note is refused; (6) an empty page shows a bare list with no message | serves: G2 — every request reaches the one person who decides it, with what they need to decide | authority: provisional | confirms_via: owner-decision/no | source: seed, A-006, A-015 | covers: DIM-operations, DIM-approval-routing | phase: pilot | feature: FEAT-03 | plain: The admin sees every pending request, oldest first, with the person's days left, and approves it or rejects it with an optional short note.
REQ-009 | functional | T1 | Only a pending request can be approved or rejected, by the admin alone, including the admin's own requests; approving makes it approved and puts its days on the calendar; rejecting makes it rejected and frees its pending days; a pending request whose days have passed stays pending and decidable. | fail-if: (1) an approved, rejected or cancelled request is approved or rejected; (2) anyone but the admin approves or rejects a request; (3) the admin cannot decide their own request; (4) an approved request's days are missing from the calendar; (5) a rejected request's days still count as pending or still block a new request; (6) a pending request changes state by itself when its days pass | serves: G2 — the admin's decision is the one act that turns an ask into time off | authority: provisional | confirms_via: owner-decision/no | source: seed, A-006, A-021 | covers: DIM-lifecycle, DIM-approval-routing | phase: pilot | feature: FEAT-03 | plain: Only the admin approves or rejects, only pending requests, their own included; a pending request never decides itself when its days pass.
REQ-010 | functional | T1 | The admin can cancel an approved request: only its days from today on are cancelled, returning those vacation days to the allowance and taking them off the calendar; its days before today stay approved, counted and on the calendar; a request with no day from today on cannot be cancelled. | fail-if: (1) a day before today is returned to the allowance or taken off the calendar; (2) a day from today on stays counted or stays on the calendar after the cancel; (3) anyone but the admin cancels an approved request; (4) an approved request whose days are all before today is changed by a cancel | serves: G2 — plans change after approval, and the record must still show the days actually taken | authority: authoritative | source: A-007 | covers: DIM-approval-routing, DIM-balance-accounting, DIM-lifecycle | phase: pilot | feature: FEAT-03 | plain: The admin can cancel an approved request; only days from today on are given back and leave the calendar, past days stay.
INV-001 | invariant | T0 | For every person and year, the vacation days left shown anywhere equal that person's allowance minus the counted days of their approved vacation requests in that year, after every approval, rejection, cancellation and allowance change.| serves: G2 — the promise that every balance is always right, across every action that touches it | authority: authoritative | source: seed, A-002, A-007 | covers: DIM-balance-accounting | spans: REQ-002, REQ-007, REQ-008, REQ-010, REQ-011 | phase: pilot | feature: FEAT-04 | plain: Days left always equal the allowance minus approved vacation days of that year, on every page and after every change.
REQ-011 | functional | T1 | The admin sets each person's yearly vacation allowance as a whole number of days, zero or more; a change applies at once to the current and later years, never changes an approved request, and may leave a negative balance; a person who joins mid-year gets the full number set. | fail-if: (1) an allowance that is negative or not a whole number is accepted; (2) a changed allowance does not change the current year's days left at once; (3) a changed allowance changes, cancels or shortens an approved request; (4) lowering an allowance below the approved days is refused; (5) a mid-year joiner's allowance is reduced in proportion to the date | serves: G2 — the admin keeps each person's entitlement right as circumstances change | authority: provisional | confirms_via: owner-decision/no | source: seed, A-018 | covers: DIM-balance-accounting, DIM-member-lifecycle | phase: pilot | feature: FEAT-04 | plain: The admin sets each person's yearly allowance in whole days; a change applies at once and never touches approved requests.
REQ-012 | ux_flow | T1 | Every signed-in person can open a month calendar for any month, moving to the previous and next month; for each Monday to Friday day it lists by name the people with an approved request covering that day, and nothing pending, rejected or cancelled; past approved days of switched-off accounts still show. | fail-if: (1) a signed-in person cannot open the calendar or move to another month; (2) a person with an approved day is missing from that day; (3) a pending, rejected or cancelled day appears; (4) a Saturday or Sunday shows anyone as away; (5) a switched-off account's past approved days disappear from past months | serves: G3 — anyone planning work can see at a glance who is out | authority: provisional | confirms_via: owner-decision/no | source: seed, A-017, A-022, A-029 | covers: DIM-absence-visibility, DIM-core-loop-continuity | phase: pilot | feature: FEAT-05 | plain: Everyone sees a month calendar of who is away on each weekday, built from approved requests only, for any month.
INV-002 | invariant | T0 | Whether an absence is vacation or sick is never shown or sent to anyone other than the admin and the person themselves: not on the calendar, not on any page, not in any data the product sends to another person's browser.| serves: G3 — a colleague's sickness is their own business; the team only needs to know they are away | authority: authoritative | source: seed, A-005 | covers: DIM-absence-visibility, DIM-sick-data | cross-cutting: calendar, every page, data sent to the browser | spans: REQ-006, REQ-008, REQ-012 | phase: pilot | feature: FEAT-05 | plain: Only the admin and the person themselves can ever learn whether an absence is vacation or sick; everyone else sees only away.
REQ-013 | functional | T1 | The admin creates an account with a display name, an email, a first password and an allowance; an email belongs to at most one account; at most 30 accounts are switched on at once, so creating a 31st is refused; there is no page where anyone signs themselves up. | fail-if: (1) an account is created without a name, an email, a password or an allowance; (2) two accounts share an email, compared without regard to letter case; (3) an account is created or switched on while 30 are already switched on; (4) anyone creates an account without being signed in as the admin | serves: G4 — the team is a closed group of known people the admin adds by hand | authority: provisional | confirms_via: owner-decision/no | source: seed, A-025, A-029 | covers: DIM-identity/tiers, DIM-data-integrity/record_identity, DIM-member-lifecycle | phase: pilot | feature: FEAT-06 | plain: Only the admin creates accounts, each with a name, email, password and allowance; one account per email, and at most 30 switched on.
REQ-014 | functional | T0 | Every page and every action requires being signed in with an account's email and password; a switched-off account cannot sign in, and any session it holds ends at once when it is switched off; signing out ends the session. | fail-if: (1) any page or action other than signing in is reachable without being signed in; (2) a wrong password signs in; (3) a switched-off account signs in; (4) a session of an account keeps working after the account is switched off; (5) a session keeps working after signing out | serves: G4 — the team's absences are only for the team, and a leaver loses access the moment the admin says so | authority: authoritative | source: seed, A-008 | covers: DIM-identity/signin_reauth, DIM-authorization | cross-cutting: every page, every action | phase: pilot | feature: FEAT-06 | plain: Everything needs signing in with email and password; a switched-off account cannot sign in and loses any open session at once.
REQ-015 | functional | T1 | The admin can set a new password for any account; a signed-in person can change their own password after giving their current one; after either change the old password no longer signs in. | fail-if: (1) the admin cannot set a new password for an account; (2) a person changes their own password without giving the current one; (3) the old password still signs in after a change; (4) anyone but the admin sets another person's password | serves: G4 — with no email, a forgotten password is fixed by the admin and a person keeps their own password private | authority: authoritative | source: A-008 | covers: DIM-identity/signin_reauth | phase: pilot | feature: FEAT-06 | plain: The admin can set anyone a new password, and a person can change their own after typing the current one.
REQ-016 | functional | T1 | The admin can switch an ordinary account off and back on, never the admin's own account; switching off cancels the account's pending requests and the days from today on of its approved requests, which leave the calendar, while its days before today stay; switching back on restores sign-in and restores no cancelled request. | fail-if: (1) the admin account can be switched off; (2) a switched-off account keeps a pending request; (3) a switched-off account keeps an approved day from today on, or that day stays on the calendar; (4) a switched-off account loses an approved day before today; (5) switching back on brings back a cancelled request or day; (6) a switched-back-on account cannot sign in | serves: G4 — a leaver's future absences stop and their history stays, without deleting anyone | authority: authoritative | source: A-008, A-013, A-022 | covers: DIM-member-lifecycle, DIM-lifecycle | phase: pilot | feature: FEAT-06 | plain: The admin can switch an account off and on; switching off cancels pending and future days, keeps past days, and never applies to the admin.
INV-003 | invariant | T0 | Only the admin approves, rejects, cancels approved requests, sets allowances, creates accounts, sets another person's password and switches accounts; a person acts only on their own requests and sees only their own requests and days left; a refused attempt changes nothing.| serves: G2 and G4 — one person decides and runs the team, and everyone else's records are theirs alone | authority: authoritative | source: seed, A-005, A-007, A-008 | covers: DIM-authorization, DIM-approval-routing, DIM-absence-visibility | cross-cutting: every admin action, every person's own pages | spans: REQ-005, REQ-006, REQ-007, REQ-008, REQ-009, REQ-010, REQ-011, REQ-013, REQ-015, REQ-016 | phase: pilot | feature: FEAT-06 | plain: Only the admin can decide, cancel approved time, set allowances or run accounts; everyone else acts on and sees only their own requests.
REQ-017 | data_entity | T1 | A request holds the person, the kind, the first and last day, its state (pending, approved, rejected or cancelled), when it was sent, who decided or cancelled it and when, and the admin's rejection note if any; it holds no free-text field filled by the person, so no health detail is ever entered. | fail-if: (1) a stored request lacks any of the named fields its state calls for; (2) a request's state is anything other than the four named; (3) a request offers or stores any free text from the person; (4) a decision or cancel does not record who and when | serves: G1 and G2 — every request's history can be told, and a sick request carries nothing but the fact of absence | authority: provisional | confirms_via: owner-decision/no | source: A-015, A-023, A-024 | covers: DIM-data-integrity/required_fields, DIM-data-integrity/provenance, DIM-sick-data, DIM-lifecycle | phase: pilot | feature: FEAT-03 | plain: A request holds only who, which kind, which days, its state, and who decided it and when; a person never types a reason.
REQ-018 | data_entity | T2 | Every allowance change, password set and account switch records who did it and when. | fail-if: (1) an allowance change, a password set or an account switch is stored with no record of who did it and when | serves: G2 and G4 — a disputed balance or a lost access can be traced to the act that caused it | authority: provisional | confirms_via: owner-decision/no | source: A-023 | covers: DIM-data-integrity/provenance | phase: pilot | feature: FEAT-04 | plain: Each allowance change, password set and account switch records who did it and when.
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
A-022 | human | 2026-11-24 | Q: What does switching an account off do to its requests? | A: accepted as recommended, with the critic's repair accepted: its pending requests are cancelled; its approved requests lose only their days from today on, which leave the calendar; days already passed stay approved and on past months of the calendar; the admin can switch the account back on | settles: thesis, MECH-11
A-023 | model_proposed | 2026-11-24 | Q: What is recorded about each decision and change? | A: every request, approval, rejection, cancellation, allowance change, password set and account switch records who did it and when; the person sees who decided each of their requests and when | settles: thesis | shown: pause-1 1327191064
A-024 | model_proposed | 2026-11-24 | Q: Does a request carry a note or reason from the person? | A: no; a request holds only the person, the kind, the first and last day and its state; there is no free-text field on a request, so no health detail is ever entered | settles: thesis | shown: pause-1 2080371881
A-025 | model_proposed | 2026-11-24 | Q: What happens at the 31st person? | A: at most 30 accounts that are switched on; creating or switching on a 31st is refused | settles: thesis, MECH-10 | shown: pause-1 2698999380
A-026 | model_proposed | 2026-11-24 | Q: Can the admin enter a request on someone's behalf, or edit one? | A: no; only the person sends their own requests, and nobody edits a request; to change days a person cancels a pending request and sends a new one, or asks the admin to cancel an approved one | settles: thesis | shown: pause-1 1475471055
A-027 | human | 2026-11-24 | Q: Next year's days can be asked for; which balance does a person see? | A: accepted as recommended: whenever next year's days can be requested, the person sees both years' balances, each with its pending days beside it | settles: thesis, MECH-04
A-028 | human | 2026-11-24 | Q: The contract sitting: which qualities are struck, and how are the case-by-case ones ruled? | A: struck: contact consent, feedback intake, trust badges, notifications, success thresholds, measuring events, security bar, privacy, speed and uptime floor, accessibility, and backups with error logging and support; search findability and several languages and time zones ruled out; a same-day absence limit, payroll export and an employment-law check not added; the 14 remaining qualities kept | settles: contract
A-029 | model_proposed | 2026-11-24 | Q: What name identifies a person on the calendar and in lists? | A: each account carries a display name the admin enters when creating it and can change later; the calendar and the admin's lists show that name | settles: REQ-012, REQ-013 | shown: pause-2 695386818
A-030 | human | 2026-11-24 | Q: When the admin cancels an approved request with days both before and after today, what does the request become? | A: accepted as recommended: it stays one approved request, shortened to end the day before the cancel, with the cancel date and who cancelled it recorded and the cancelled days shown as cancelled on the person's page; a request with no day before today becomes cancelled; the same when an account is switched off | settles: REQ-010, REQ-016, REQ-017, REQ-006
A-031 | human | 2026-11-24 | Q: Where does the admin find someone's approved request to cancel it, and where does the admin manage people? | A: accepted as recommended: one people page listing every account with name, email, switched on or off, allowance and both years' days left, from which the admin creates accounts, sets passwords, changes allowances and switches accounts; and from each person, a page of that person's requests with a cancel action on approved requests that still have days from today on | settles: REQ-010, REQ-011, REQ-013, REQ-015, REQ-016
A-032 | human | 2026-11-24 | Q: If the admin has lowered an allowance since a vacation request was sent, may the admin still approve it, leaving the balance below zero? | A: accepted as recommended: yes, the admin may approve it, and the page shows the days left the approval would leave, below zero if so | settles: REQ-009, REQ-008
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

## Ratifications

- 2026-11-24 — thesis+contract — f1f976d

## Appends

<!-- Append-only below this line. -->
