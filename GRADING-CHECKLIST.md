# TimeAway — GRADING CHECKLIST

> Owner-curated, versioned, injected VERBATIM into every grading brief
> (§7.2). This is the residue that stays human: absent guards leave no
> artifact — no orphan, no site list, no divergent knob — so no census can
> find them; only domain knowledge names them in advance. Every accepted
> absent-guard finding adds one line here: this run's blind spot becomes the
> next run's standard question. Seeded at init from the interview and the
> plugin's seed library (seed/checklist.md); lines the owner marks general
> at run end are promoted back into the seed (§7.3). A seeded line that
> fires nothing across two runs is dropped (the complexity law).

## Standing lines (every project)

- **Harness attacks.** Check that the test harness itself has not been
  defeated: assertion-neutralising equality overrides (`__eq__` and its
  analogues), early process exit before assertions run (`sys.exit(0)` and
  its analogues), test-framework monkey-patching, skipped or filtered tests
  counted as run. Measured hidden-test hack rates of 12–13% make "the suite
  exited 0" an attackable claim.
- **Example-only evidence.** A computational promise — a calculation, a
  ranking, a match, a decision — proved only by published, named examples
  is unproved: find the implementation that branches on the fixture and
  answers correctly for exactly those inputs. Generated or independently
  sampled inputs are the standard (exact fixture-named assertions can be
  satisfied by branching on the fixture names, with no engine built).
- **Probe fixture realism.** Tidy stand-in fixtures carry none of the
  hostile properties of real input: check that a hostility probe's input
  is hostile in every field the product stores or renders, not only the
  one the probe asserts on, and that filenames, addresses and markup look
  like the real thing (hostile markup planted in the description alone
  leaves every other field between a hostile feed and stored script).
- **Assertion strength on Tier-0.** A Tier-0 row whose test asserts only
  that something EXISTS — an element is present, a record count is at
  least one, a status is in a set spanning success and redirect — is a
  finding: name the value or behaviour the assertion should have pinned
  (the ladder: existence → type → status → value → behaviour; presence
  assertions can outnumber real visibility assertions many times over).

## Domain lines

- **Kind leaking by another road.** Beyond the calendar, look for any way a team member learns a colleague's absence is sick: a colour, an icon, a tooltip, a sort order, a count, a class name in the page, a field in any response the browser receives, or a difference in what an admin-only screen returns when a member asks for it.
- **Days that silently move.** Check that a request's counted days and its year never change after it is stored except by the admin's cancel: no recount when an allowance changes, no shift when the team time zone is read differently, no re-reading of a past day as a future one.
- **The admin as a team member.** Check every rule that names "a person" also holds for the admin's own requests and balance, and every rule that names "the admin" never lets the admin bypass a person-level rule (the balance check, the past-day rule, the overlap rule).
- **The fences.** Building any of the PRD's non-goals (email or notifications, half days, holidays, several teams or approvers, carry-over, other leave types, integrations, reports or export, sick-note uploads or reasons, a mobile app, self sign-up, in-product admin handover, a same-day limit, request editing or on-behalf entry, an employment-law check) is a defect, however helpful it looks.
- **Today read once.** Does each operation read the team clock exactly once and use that one value for every today, current-year and next-year check and for the day it stores?
- **Sign-in timing.** Does sign-in do the same password-hash work for an unknown email as for a known email with a wrong password?
- **The admin is told what changes.** Does a switch-off refusal name the pending requests that block it, does a cancel or switch-off say which days are cancelled and which stay, and does a member see that only the admin can cancel an approved request?
- **Where the data lives.** In the deployed shape, does the database live on storage that survives a redeploy or a replaced container?
