# TimeAway — TEST INVENTORY

> Ratified at init, same standing as PRD.md: the owner ratified these ROWS —
> what will be verified — before any code existed. Mechanically derived from
> three enumerable sets (PRD requirements + Fail-ifs; design pack @screen
> markers via the resolved design-join table; the scaffold's route table via
> the ratified routes extractor), plus the auth-state × surface axis and the
> genus-row proposals (origin: domain). Rows are generated, never authored;
> only exceptions are hand-touched. Additions during development are
> permitted, never silent — checks/inventory.sh fails a commit whose new
> route has no row here, and every change to this block is a law change:
> a standalone commit, nothing else in it (pre-commit, §4.1). Development is
> "make the ledger green": every row below was materialised as a failing
> ledger test at init (proved red — the red gate), or carries
> `owed: <reason>` until its test can exist.

## Row schema

    ROW-NNN | kind | subject | actor/state | marker | obligation | derived-from | test

- `kind` — `surface` · `journey` · `shell` · `behavior` · `reachability`
- `subject` — route (`/account`, in the scaffold's own literal form), screen
  id, or requirement id
- `actor/state` — `anonymous` · `candidate` · `operator:<role>` · `n/a` ·
  `(process)` (v0.9.3 3.2, R3: a machine journey or a trigger row — the
  product acting on what enters at an external input boundary, with no
  person at a browser)
- `marker` — the design pack marker this row binds to (`P03/expired`), or `n/a`
- `obligation` — one falsifiable sentence a fresh-context grader can check
- `derived-from` — `REQ-NNN` and/or a design marker; never "authored"
- a **journey** row's obligation carries the narrative followed by
  `transitions:` — one numbered item per transition, `<actor> at <state>
  · <entry control> · <action> · <next state> · <observable effect>`
  (v0.9.2 3.5, R8); an `(off_screen)` phase stays in the narrative and is
  no transition. The row is paid per transition, in a real browser,
  operating the real control; setup may reach the starting state through
  the API or a fixture and never performs a transition; the verdict pass
  returns one verdict per transition and the row is KEPT only when every
  transition is.
- a **machine journey** (v0.9.3 3.2, R3) is a journey row with actor
  `(process)`: every external input boundary ARCHITECTURE.md declares
  (feeds, uploads, webhooks, scheduled pulls, inbound mail) × every
  observable consequence the PRD promises for what enters there
  (searchable, matched, notified, exported, expired, deleted); its
  `transitions:` are the stages as the PRD states them (enter · parse ·
  store · index · notify · expire), each with its observable effect; paid
  per stage at the boundary's real entry point, the external party played
  by the harness's fake (itself a `difference` row), never a browser.
- **the deployed population** (v0.9.3 3.3, R4): every row of kind
  `journey`, and every row whose actor is `(process)`, is paid by the close
  run's deployed pass — the product's declared processes running on the
  same image, nothing inline — and that report alone is its receipt (a row
  absent from it is red, whatever the inline report says). Scoped runs stay
  inline.
- `test` — path under tests/invariants/, or `owed: <reason>` (owed rows block
  completion — checks/inventory.sh --strict and checks/coverage.sh --strict).
  One owed reason has its own standing (v0.9.1 3.6): `owed: paid by /vid
  deploy gate <1|2|3> — <what the rung observes>` — a row whose obligation
  can only be observed through something the harness substitutes (a DIF
  row's paying step, a seam with `credentials: not-yet`, a deployed
  worker consuming a schedule). Reported as `deploy-owed`, outside the
  owed gaps; completion requires it present and named, never silently
  absent; it is paid only by that rung's evidence and stamped `| paid-at:
  gate-N <date> <deploy log row>` in a law commit. Any other shape in this
  field is a GAP, never silent — a typo'd path must not exit the evidence
  join.

  **Deferral is a closed vocabulary (v0.9.2 3.2, R3).** Under a block
  whose first line inside the fence is `grammar: 0.9.2` — or `grammar:
  0.9.3`, which carries every 0.9.2 rule — an owed reason
  reads `owed: <class> — <detail>`, the class one of the table below and
  the detail naming the missing dependency and its payment point; a legal
  word alone does not pass, and any other reason is a GAP at every commit
  (`unclassed deferral`, checks/inventory.sh). "Materialised when its
  surface exists", "lands with the screen's slice", "in the slice that
  builds the subject" are not classes: they describe a red test — a test
  against a missing route or marker IS a red test, and is written. A
  block without the line keeps the pre-0.9.2 reading (any reason,
  reported).

  | class | when it is legal | detail must name |
  |---|---|---|
  | `guard-first` | a hostility probe or control sibling whose guard does not exist yet | the protection row; paid in the slice that builds it |
  | `census-armed` | a rule row before any site exists; and a rule row during a sanctioned rule-shaped repair (every enumerated site being guarded — citing a test arms the census at once) | for the repair: `sites being guarded, fix <finding id>`; paid by the owed→path flip once every site is guarded |
  | `probe-capture` | a seam probe awaiting the capture | the seam id; paid before the first client line, or at deploy gate 2 (R15) |
  | `golden-set` | the row awaits its ratified golden set | the fixture path to be ratified |
  | `fixture-source` | a fixture from an external source not yet held | the source; when it is expected |
  | `prerequisite` | a fixture or interface contract the harness lacks (a test-author pass's `unwritable: missing prerequisite`) | what is missing; paid at which slice or boundary |
  | `spec-only` | a row ratified at a spec-only init whose test is not written yet (v0.26.10.9); develop's code skeleton writes it, or, in ticket mode, the ticket that carries it | exactly `first stage`; `ticket` for a row appended under ticket mode |
  | `owner-decision` | the existing visible-debt class | `OQ-n` |
  | `reverted` | **legacy** — written by 0.9.2's develop at the two-attempt bound; 0.9.3 never writes it (a row past the bound stays materialised and is held, below) and an upgraded project keeps the rows it has | the verdict's one-line reason, quoted |
  | `paid by /vid deploy gate <1\|2\|3>` | the v0.9.1 deploy-owed form above, verbatim | what the rung observes (its own `deploy-owed=N` and `paid-at:` semantics, never re-classed) |

  The par (v0.9.2 R4): checks/inventory.sh prints `par: rows=R
  materialised=N legitimate=K (by class) deploy-owed=D other=J` under the
  line, and the red gate fails while `J > 0` or `N + K + D ≠ R` — every
  row is materialised or legitimately deferred, and the count of
  legitimate deferrals is printed at the gate. A surface row may be
  deferred ONLY as `prerequisite` naming a harness fixture the state
  needs and the harness lacks; a missing route, a 404 or a missing
  marker is a failing case of the surface instrument, never a deferral.

**A row's verdicts (v0.9.3 3.6, 3.7; R8–R11).** Under `grammar: 0.9.3` a
materialised row is ledger-tested only when its cases pass in the current
receipt AND its latest verdict is KEPT (`checks/coverage.sh --strict`,
per row, whatever the row derives from). KEPT means the promise holds in
the product AND the test observes it. BREACHED carries its class:
`product` (the product violates the Fail-if), `test` (the test cannot
observe the promise — it asserts what was already true, stops before the
effect, binds the wrong boundary) or `harness` (the instrument failed); a
row whose transitions differ takes `product` if any transition's latest
breach is, else `test`, else `harness`. A `test` or `harness` breach costs
no attempt and leaves the row `unverdicted` until a fresh verdict. Rounds,
attempts and holds are computed from the verdict events by
`checks/metrics.sh`, never written: two `product` rounds since the row's
latest KEPT, reissue or amendment hold it (`reason=bound`), two `test`
rounds likewise (`reason=test`), two `harness` rounds with no harness
repair between them (`reason=harness`). A held row stays materialised —
this field unchanged, no law commit — counts `breached`, is left out of
the automatic claim and waits for the owner; an owner answer
(`reissued`), an amendment, or a KEPT from a fix's blind re-grade releases
it. An amended obligation, or a changed `fail-if:` of the item a row
derives from, wipes the row's verdicts and its attempt history
(`checks/hooks/post-commit` records `amended row=ID sha=<commit>`); a
verdict quoted before the amendment does not count.

Every row may carry optional trailing labeled fields, in any order:

- `| origin: REQ-NNN | domain | finding-NNN | derivation <date>` — provenance:
  which requirement, genus-row proposal, grade finding, or re-derivation
  sitting produced the row. `| origin: incorporation <date> D-NNN` — the decision line an incorporation (/vid:vid-incorporate) added; a rule row names its REQs after it.
- `| paid-at: gate-N <date> <deploy log row>` — on a deploy-owed row, the
  rung that paid it (v0.9.1 3.6); written by /vid deploy, never by a
  sandbox run.
- `| proved-red: <commit-sha>` — the commit at which the row's test was
  observed failing (§3.6). Init stamps it for materialised rows; a test added
  later records the parent commit where it was red. A row test with no
  proved-red has the same standing as `owed` — an unproved test is not
  evidence, and checks/inventory.sh counts it accordingly. The stamp is
  joined, not merely present (v0.8.1d): the sha must resolve, the cited
  file must exist at it, and the file there must name the row (its ROW id
  or its `derived-from` REQ id) — a sha at which the test was never red
  is a GAP. Cited test paths resolve against the commit under construction
  (the staged index, then HEAD), never the working tree: the rhythm is
  test (free ledger addition, observed red) → row (law commit, stamped with
  the parent) → code.
- `| golden: tests/invariants/<fixture>` and `| divergence: DIF-NNN` —
  on a row derived from a `derives: golden-set` item: the ratified golden
  set the row's test reads (one line per query: `query | must-appear |
  must-outrank | must-not-appear`, proposed by a fresh-context lens, never
  by the build or tuning context), and the difference row that legalises
  a model or engine divergence on that path. A named DIF must exist and
  carry a `paying-step:` (below) — checks/inventory.sh joins the two.

**Row shapes with no new class (v0.8.1d).** One row per independently
breakable promise of a requirement's complete block — the ROW is the
atomic unit, no sub-ids. A **trigger-existence row** (kind `behavior`,
subject the item, actor `(process)` under `grammar: 0.9.3` — so the
deployed pass pays it) for every time-worded Fail-if. A **volume row** per
list surface once a scale item exists. A **control sibling** of every
guard/never row — the allowed case demonstrably works, effect observed —
an ordinary ROW, `derived-from` the same REQ, obligation opening
`control of ROW-NNN: …`. **Property-form rows** through the public
surface: many-input datasets, and the four invariance relations —
reorder-invariance, rename-invariance of aggregates, repeat-idempotence,
unrelated-state-unchanged — each a falsifiable predicate over the
product's own outputs, never a reference implementation.

**Two tiers.** `tests/invariants/` is the ledger and the only tier rows
cite. `tests/scaffolding/` is the builder's non-law tier: implementation-
keyed instruments, never cited, never evidence, outside the coverage join,
proved-red, the extractors and the deletion tripwire; deletable without a
law commit; never run by the gate. Every fixture file under `tests/`
opens with a one-line `Provenance:` header — `hand-authored`, `captured
from <seam probe>`, or `generated by <generator path under tests/>` — so
a fixture whose expected value the system under test produced (circular)
is visible to the vacuity extractor.

## Census row classes (v0.7 — read by checks/census.sh)

    rule       | RULE-NNN | statement | census-command | tier | test
    difference | DIF-NNN  | knob | test-value | prod-value | why-safe [| paying-step: <rung> — <what re-runs against the real component>]
    exception  | EXC-NNN  | subject | census-class | why-rule-does-not-apply
    suppression| SUP-NNN  | subject | census-class | extractor-gap | fix-by

- A **rule** row's census command is its denominator — it enumerates every
  site the rule applies to; new code that adds a site is automatically in
  scope on the next run. Three forms: a ratified extractor path
  (`checks/extractors/invariant.<name>.sh`); two enumerations
  `<sites-cmd> :: <guarded-cmd>` (orphans = left minus right); or a single
  enumeration (a pure denominator the row's ledger test asserts over). The
  command may contain pipes; the statement field may not. An empty
  population is a FAILURE, never a pass (zero-denominator guard) — except
  while the rule's test is still `owed:`, when orphans AND an empty
  population report `pending` (ratified, not yet armed); materialising the
  test arms the census fail-closed.
- **State-machine variant (v0.8, §6.1).** A rule row whose statement field
  begins `state-machine <field>:` declares a transition table and is the
  landing spot for a lifecycle decision (publication status, alert
  lifecycle, consent):

      rule | RULE-NNN | state-machine <field>: draft>published published>archived | census-command | tier | test

  The declared transitions are the field's whole legal vocabulary
  (space-separated `from>to` pairs; a bare token declares a state with no
  transition, e.g. an initial state nothing transitions into). The census
  command enumerates every site that mutates or guard-reads the field,
  one line per site: `<site> <from>><to>` for a mutation, `<site> <state>`
  for a guard read. The engine convicts any site whose transition is not
  declared or whose state is outside the vocabulary — fail-closed, naming
  the site (grade brief instruction: find a state mutation outside the
  declared table). Zero-denominator, debt-awareness, and the population=1
  flag apply as for any rule row.
- A **difference** row is the only legal way for a knob to differ between
  test and prod. The census prints the full divergence table every run —
  the owner sees exactly what the green ledger did NOT validate. Every
  fake the harness substitutes is a divergence by construction — derived
  at materialisation, never waited for. A DIF that legalises a model or
  engine divergence on a golden-set item's path carries `paying-step:` —
  the deploy rung and the re-run that pays it (the golden set against
  the real component): a deferred test with a named step, never a
  permanent shrug. **The paying step `close run, profile=deployed`**
  (v0.9.3 3.3): a difference whose knob is the inline switch, a scheduler
  stand-in or the absent workers is paid by the close run's deployed pass,
  locally, and its deploy gate-2 sibling stays, narrowed to the platform
  half ("the platform's worker consumes it"); a knob whose real component
  exists only on the platform keeps `paying-step: staging`.
- An **exception** says the rule genuinely does not apply to this subject.
  Exceptions count toward the complexity law's ceremony threshold
  (CLAUDE.md §2): a rule whose exception list exceeds ~15–20% of its
  population is ceremony and is deleted.
- A **suppression** says the rule applies but the extractor cannot yet see
  the site — it never counts toward deletion and stands as a to-do against
  the extractor, printed every run. `census-class` in exception and
  suppression rows names the extractor class (`dead-path`, `divergence`,
  `reachability`, `vacuity`) for extractor orphans, and MUST name the
  specific `RULE-NNN` for a rule row's orphans — the class word is not a
  skeleton key across rules.

## Provider seam rows (v0.8 — read by checks/seams.sh)

    seam | SEAM-NNN | service | purpose | chosen: D-NNN | credentials: <held|not-yet|never> | probe: <owed | probed(YYYY-MM-DD) | unreachable-risk(reason)> | evidence: <contract-test path + captured-response path, or owed> | quirks: <one per ";", or "none yet"> [| module: <module id>]

- One row per EXTERNAL service the product depends on — payments, mail,
  feeds, search, auth, storage: anything on the other side of the network
  this repo does not own. Two discovery doors (§3.2): init's architecture
  step declares known seams (an external boundary without a row cannot be
  ratified), and checks/seams.sh rejects a staged outbound destination no
  row covers — discovery is mechanical, not remembered.
- **Born owing a probe** — same debt semantics as every other row. Two
  legal exits: pay it (`probe: probed(date)`) or declare
  `unreachable-risk(reason)` with the reason stated. Never silent coverage.
- **The probe (§3.3) comes before the first client line:** the smallest
  real calls that answer the questions — never discover a limit by
  exceeding it (that is load-testing someone else's service; where docs
  are silent, chunk conservatively). Observed shapes, error semantics, and
  identifier-namespace behavior are written into the contract tests the
  evidence field names; the captured response becomes those tests' sample
  data — the surviving, shape-scoped form of fixture provenance. Contract
  tests are ledger additions (free) and are how the probe is paid; the row
  flip `owed → probed(date)` is a law change, standalone.
- Routing per the two-channel rule: a technical quirk is logged in the
  quirks field and pinned by a contract test; a quirk touching product
  meaning ("empty response cannot be distinguished from a broken feed")
  goes to the owner as a product question, never a silent log line.
- Optional `| module: <module id>` names the module of ARCHITECTURE.md's
  module table that talks to the service (its Module column, a dotted
  label read as a path). The project viewer lists the service among that
  module's contracts; no court reads it.
- Optional trailing `| match: <tokens>` names the greppable tokens that
  identify code touching this seam (client-library import names,
  hostnames, space-separated). Absent, the service field is the match
  token. Pick tokens that will not legitimately occur otherwise — the
  vid-forbidden rule, applied here.
- checks/seams.sh (presence-gated, fail-closed): app-source additions
  matching an OWED seam's tokens are rejected naming the row (tests/ is
  exempt — contract tests are the probe's own artifact); a staged outbound
  destination covered by no seam row demands one before the code lands. A
  destination that is content, not an outbound call (a footer link), takes
  an exception row naming class `seam`.
- The grade brief carries this table with a standing instruction — find a
  behavior of this service the probe did not pin. vid-deploy's "one real
  action per provider seam" gate is these rows' re-verification, not a
  separate concept.

## Hostility rows (v0.8 §4 — read by checks/inventory.sh)

    hostility | HOS-NNN | attempt | protects: <RULE-NNN|REQ-NNN|ROW-NNN> | disable: <toggle> | test [| proved-red: <sha>]

- One row per **Tier-0 protection**, and for a Tier-0 requirement one per
  fail-if arm and, per arm, one per way in that reaches its subject (the
  bounded set, below): the sibling of a ratified Tier-0 rule
  row (`tier` = 0) or Tier-0 requirement, which *attempts the forbidden
  thing* against the locally running app through its real public surface,
  in the same Docker-only harness as every other ledger test. Reads confirm
  a guard is present and correct; only an attempt establishes that it
  holds. The measured class: a correct publication guard defeated by a
  different path erasing the state it read, and a rate-limit bound defeated
  by one rotated client-identity header — both present, both correct, both
  bypassed. The must-never-happen list, executed instead of trusted.
- `attempt` — one falsifiable sentence naming the forbidden thing the probe
  commits, never the guard it hopes to meet ("submit the same form twice
  concurrently, expect exactly one record", not "double-submit is guarded").
- `protects:` — the ratified protection this row is a sibling of: a
  Tier-0 rule row, a Tier-0 requirement, or a Tier-0 ROW (a ratified genus
  protection — the court resolves a ROW target to its REQ). Absent,
  the row is a sibling of nothing and is rejected.
- `disable:` — the named, reversible way that protection is turned OFF so
  the probe can be watched failing. Required; `none` and `n/a` are not
  values. It is a LOCAL mutation performed at materialisation and reverted
  in the same sitting (remove the guard clause, build without it) — never a
  runtime switch that ships. A guard with a production kill-switch is not a
  guard; the toggle is written down so the ritual can be re-run, not so the
  product can be unlocked.
- `test` — path under tests/invariants/, or `owed: <reason>`, as for any row.
- `proved-red:` is **mandatory** here, not optional as it is for a ROW row:
  a cited probe test with no proved-red is a GAP, not debt. A probe never
  observed failing is not evidence, and unlike an ordinary row it is
  evidence with the polarity that reassures.

### The bounded set

Derived mechanically from the ratified Tier-0 protections, never invented:
one probe per Tier-0 rule or invariant; for a Tier-0 requirement, one per
fail-if arm (as `checks/prd.sh` splits them) and, per arm, one per way in
that reaches its subject — the design's screens, each journey's entry
control, every input boundary ARCHITECTURE.md declares — the way in named
in the `attempt` sentence (0.26.10.29.4 phase 3, R3). checks/inventory.sh
prints `NOTE  REQ-n — <a> arms, <p> probes` for a requirement that fewer
rows protect than it has arms, counted as `arm-probes=<n>` on its
`inventory notes:` line; never owed. A fixed
list — explicitly not a fuzzer, not a scanner, no generated or open-ended
input exploration. Probes beyond the ratified protections are ceremony and
are deleted under the complexity law; the way to add one is to ratify the
protection it is the sibling of. The shapes these protections take,
stated as behavior so they carry to any stack:

- concurrent double-submit of the same action → exactly one record
- a replayed one-time link or token → exactly one effect, one timestamp
- a valid session for actor A requesting actor B's resource → refused, with
  an audit entry
- a transition attempted out of a state that forbids it (reject, then
  publish) → refused, whichever path sets the state
- a rotated client-identity header against a rate limit → the bound holds
- refresh mid-flow, expired-form resubmit, stale-state action → no double
  effect
- **dependency failure during the protected operation** (v0.8.1d): the
  seam the operation touches fails mid-way → the forbidden effect does
  not occur and the failure is recorded, never a silent success; the
  `disable:` toggle is the fail-closed handling itself (the measured
  class: an erasure that failed open when its store was down, whose probe
  counted residue through the pointer it had just blanked)
- **concurrency against the protected operation** (v0.8.1d): two
  simultaneous attempts → exactly one effect; the toggle is the
  serialisation guard

### The fail-first ritual (mandatory, §4.2)

A hostility probe passing proves nothing until it has been watched failing:
"refused" is equally green when the attempt was malformed and never reached
the guard at all. At materialisation, in one sitting, per probe:

1. **Prove the runner can go red** — invoke it with a selector naming a test
   that does not exist. Runners commonly exit 0 on a selection that matches
   nothing; wired that way, every probe below is a green that can never go
   red, which is worse than no probe at all. If it exits 0, fix the
   invocation before any probe is trusted.
2. **Disable** the protection by the row's own `disable:` toggle and run the
   probe. It MUST fail, and fail on its assertion about the forbidden effect
   — not on a connection error, a 404, or a fixture fault. A red for the
   wrong reason is the same false assurance in the other direction.
3. **Restore** the protection and run the probe. It MUST pass.
4. **Stamp** `proved-red: <sha>` — the commit at which step 2 was observed.

A probe with no verified failing state is REJECTED at materialisation: the
row stays `owed:` until the ritual is performed. checks/inventory.sh
enforces the mechanical half — a missing `protects:`, a missing or `none`
`disable:` toggle, and a cited test with no `proved-red` are GAPs that fail
the commit; a Tier-0 rule row with no hostility sibling is owed debt that
blocks completion (`--strict`); a ROW a hostility row's `protects:` names
by its ROW id, with no control sibling, is a NOTE, counted on its own line
(`inventory notes: control-siblings=<n>`) and never owed (0.26.10.29.3,
R5). The honesty of steps 1–3 is the builder's,
and the row is what the graders read.

Granularity is **screen × state** — the zero-results, expired, and error
variants are where gaps hide. Mandatory row classes, generated, not
judged: (1) every drawn screen × state, one surface row per applicable auth
state; (2) every requirement with a Fail-if, one behavior row; (3) **the
shell** in each auth state — header, footer, primary nav, error pages, empty
states; (4) reachability — every required surface reachable from an entry
point in its auth state, every default-navigation link resolves, a session
implies a sign-out control, no anonymous-only control shown authenticated or
vice versa; (5) every critical PRD journey end-to-end, one row each.

Browser-class rows (shell, reachability, journeys, the surface
instrument) are ledger tests in the engines the harness contract declares,
inside the container-only harness. **The sizing is law (v0.9.2 3.4,
R7):** ~5 shell rows + ~10 journey rows + one instrument for all screens
— written, for new projects, as a ledger test file per screen (its states
together, up to 5 rows a file; v0.9.8.1 R18), every file through the one
measure module, produced by the surface test-author pass
from the rows, the canvases and the measure module, one case per surface
row (screen × state × auth state), loading each state once per engine,
reading every load-bearing paint property in one evaluate, checking the
state's content, stray controls (the denominator: the whole page minus
the shell) and console errors, then the row's `pins:` hook on that same
loaded page. Surface rows cite their screen's file (its head carries the
row table); a surface test, or a pins hook, written by the builder is a
defect. Other new test files hold one row, or up to 5 related rows.

## Rows

```vid-inventory
grammar: 0.9.3
ROW-001 | behavior | REQ-001 | member | n/a | arm 1 must never happen: a request is created with a kind other than vacation or sick | REQ-001 | tests/invariants/REQ-001.request-kind-state-and-sender.spec.ts | origin: REQ-001 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-002 | behavior | REQ-001 | member | n/a | arm 2 must never happen: a Saturday or Sunday inside the range is counted as a requested day or shown as away | REQ-001 | tests/invariants/REQ-001.counted-weekdays.spec.ts | origin: REQ-001 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-003 | behavior | REQ-001 | member | n/a | arm 3 must never happen: a range containing no Monday to Friday day is accepted | REQ-001 | tests/invariants/REQ-001.counted-weekdays.spec.ts | origin: REQ-001 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-004 | behavior | REQ-001 | member | n/a | arm 4 must never happen: a range whose last day is before its first day is accepted | REQ-001 | tests/invariants/REQ-001.counted-weekdays.spec.ts | origin: REQ-001 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-005 | behavior | REQ-001 | member | n/a | arm 5 must never happen: a new request starts in any state other than pending | REQ-001 | tests/invariants/REQ-001.request-kind-state-and-sender.spec.ts | origin: REQ-001 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-006 | behavior | REQ-001 | member | n/a | arm 6 must never happen: a request is created for any person other than the signed-in sender, whatever the sender sends | REQ-001 | tests/invariants/REQ-001.request-kind-state-and-sender.spec.ts | origin: REQ-001 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-007 | behavior | REQ-002 | member | n/a | arm 1 must never happen: a vacation request whose counted days exceed the allowance minus the approved and pending vacation days of its year is accepted. Cases: this year used up by approved and pending vacation while next year is free, a next-year request within the allowance is accepted, and each year's figures move independently; and the reverse | REQ-002 | tests/invariants/REQ-002.vacation-allowance.spec.ts | origin: REQ-002 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-008 | behavior | REQ-002 | member | n/a | arm 2 must never happen: a vacation request within that number is refused | REQ-002 | tests/invariants/REQ-002.vacation-allowance.spec.ts | origin: REQ-002 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-009 | behavior | REQ-002 | member | n/a | arm 3 must never happen: the refusal does not show that year's days left together with that year's pending vacation days | REQ-002 | tests/invariants/REQ-002.vacation-allowance.spec.ts | origin: REQ-002 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-010 | behavior | REQ-002 | member | n/a | arm 4 must never happen: a sick request is refused for lack of allowance or changes the days left | REQ-002 | tests/invariants/REQ-002.sick-and-simultaneous.spec.ts | origin: REQ-002 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-011 | behavior | REQ-002 | member | n/a | arm 5 must never happen: two vacation requests sent at the same moment are both accepted although together they exceed the days left | REQ-002 | tests/invariants/REQ-002.sick-and-simultaneous.spec.ts | origin: REQ-002 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-012 | behavior | REQ-003 | member | n/a | arm 1 must never happen: a person ends up with two pending or approved requests that share a day in effect | REQ-003 | tests/invariants/REQ-003.overlapping-requests.spec.ts | origin: REQ-003 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-013 | behavior | REQ-003 | member | n/a | arm 2 must never happen: a request is refused because it shares a day only with the person's own rejected or cancelled request, or with the cancelled days of a partly cancelled one | REQ-003 | tests/invariants/REQ-003.overlapping-requests.spec.ts | origin: REQ-003 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-014 | behavior | REQ-003 | member | n/a | arm 3 must never happen: a request is refused because it shares a day with another person's request | REQ-003 | tests/invariants/REQ-003.overlapping-requests.spec.ts | origin: REQ-003 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-015 | behavior | REQ-004 | member | n/a | arm 1 must never happen: a vacation request that includes a day before today is accepted | REQ-004 | tests/invariants/REQ-004.request-window.spec.ts | origin: REQ-004 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-016 | behavior | REQ-004 | member | n/a | arm 2 must never happen: a sick request is refused because its days are before today | REQ-004 | tests/invariants/REQ-004.request-window.spec.ts | origin: REQ-004 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-017 | behavior | REQ-004 | member | n/a | arm 3 must never happen: a vacation request with a day before 1 January of the current year is accepted | REQ-004 | tests/invariants/REQ-004.request-window.spec.ts | origin: REQ-004 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-018 | behavior | REQ-004 | member | n/a | arm 4 must never happen: a request with a day after 31 December of the next year is accepted | REQ-004 | tests/invariants/REQ-004.request-window.spec.ts | origin: REQ-004 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-019 | behavior | REQ-004 | member | n/a | arm 5 must never happen: a request whose first and last days fall in different years is accepted | REQ-004 | tests/invariants/REQ-004.request-window.spec.ts | origin: REQ-004 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-020 | behavior | REQ-004 | member | n/a | arm 6 must never happen: a request is accepted or refused differently from how it would be if today, the current year and the next year were all read from the date in the team's time zone at the moment it is sent. Cases: the team zone set far from the server zone (UTC+14 against UTC) and the test clock set to instants where the two dates differ, on both sides of midnight and across 31 December to 1 January | REQ-004 | tests/invariants/REQ-004.team-zone-today.spec.ts | origin: REQ-004 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-021 | behavior | REQ-005 | member | n/a | arm 1 must never happen: a person cannot cancel their own pending request that has no weekday before today | REQ-005 | tests/invariants/REQ-005.own-cancel.spec.ts | origin: REQ-005 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-022 | behavior | REQ-005 | member | n/a | arm 2 must never happen: a cancelled request's days still count as pending or still block a new request for those days | REQ-005 | tests/invariants/REQ-005.own-cancel.spec.ts | origin: REQ-005 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-023 | behavior | REQ-005 | member | n/a | arm 3 must never happen: a cancelled request can later be approved or rejected | REQ-005 | tests/invariants/REQ-005.own-cancel.spec.ts | origin: REQ-005 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-024 | behavior | REQ-005 | member | n/a | arm 4 must never happen: a person cancels their own approved, rejected or cancelled request | REQ-005 | tests/invariants/REQ-005.cancel-limits.spec.ts | origin: REQ-005 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-025 | behavior | REQ-006 | member | n/a | arm 1 must never happen: a request the person sent is missing from the page | REQ-006 | tests/invariants/REQ-006.own-requests-list.spec.ts | origin: REQ-006 | proved-red: 6599fe6170a5d4f0b88d3f0f4a191960bea58ff0
ROW-026 | behavior | REQ-006 | member | n/a | arm 2 must never happen: a listed request lacks its kind, its days, its count or its state | REQ-006 | tests/invariants/REQ-006.own-requests-list.spec.ts | origin: REQ-006 | proved-red: 6599fe6170a5d4f0b88d3f0f4a191960bea58ff0
ROW-027 | behavior | REQ-006 | member | n/a | arm 3 must never happen: a decided request does not show who decided it and when | REQ-006 | tests/invariants/REQ-006.own-requests-decisions.spec.ts | origin: REQ-006 | proved-red: 6599fe6170a5d4f0b88d3f0f4a191960bea58ff0
ROW-028 | behavior | REQ-006 | member | n/a | arm 4 must never happen: a rejected request with a note does not show the note | REQ-006 | tests/invariants/REQ-006.own-requests-decisions.spec.ts | origin: REQ-006 | proved-red: 6599fe6170a5d4f0b88d3f0f4a191960bea58ff0
ROW-029 | behavior | REQ-006 | member | n/a | arm 5 must never happen: the empty page shows a bare list with no message and no way to send a request | REQ-006 | tests/invariants/REQ-006.own-requests-empty.spec.ts | origin: REQ-006 | proved-red: 6599fe6170a5d4f0b88d3f0f4a191960bea58ff0
ROW-030 | behavior | REQ-006 | member | n/a | arm 6 must never happen: the page shows any other person's request | REQ-006 | tests/invariants/REQ-006.own-requests-list.spec.ts | origin: REQ-006 | proved-red: 6599fe6170a5d4f0b88d3f0f4a191960bea58ff0
ROW-031 | behavior | REQ-006 | member | n/a | arm 7 must never happen: a cancelled or partly cancelled request does not show who cancelled it, when, and from which day. For a whole cancel, which records no cancel day, the page shows the whole request as cancelled with who and when | REQ-006 | tests/invariants/REQ-006.own-requests-decisions.spec.ts | origin: REQ-006 | proved-red: 6599fe6170a5d4f0b88d3f0f4a191960bea58ff0
ROW-032 | behavior | REQ-007 | member | n/a | arm 1 must never happen: either year's days left is missing | REQ-007 | tests/invariants/REQ-007.balance-both-years.spec.ts | origin: REQ-007 | proved-red: 6599fe6170a5d4f0b88d3f0f4a191960bea58ff0
ROW-033 | behavior | REQ-007 | member | n/a | arm 2 must never happen: a days-left number differs from the allowance minus that year's approved vacation days | REQ-007 | tests/invariants/REQ-007.balance-both-years.spec.ts | origin: REQ-007 | proved-red: 6599fe6170a5d4f0b88d3f0f4a191960bea58ff0
ROW-034 | behavior | REQ-007 | member | n/a | arm 3 must never happen: pending days are subtracted from the days-left number instead of shown beside it | REQ-007 | tests/invariants/REQ-007.balance-both-years.spec.ts | origin: REQ-007 | proved-red: 6599fe6170a5d4f0b88d3f0f4a191960bea58ff0
ROW-035 | behavior | REQ-007 | member | n/a | arm 4 must never happen: a year's pending vacation days are missing or wrong | REQ-007 | tests/invariants/REQ-007.balance-both-years.spec.ts | origin: REQ-007 | proved-red: 6599fe6170a5d4f0b88d3f0f4a191960bea58ff0
ROW-036 | behavior | REQ-007 | member | n/a | arm 5 must never happen: a negative balance is shown as zero or hidden | REQ-007 | tests/invariants/REQ-007.balance-both-years.spec.ts | origin: REQ-007 | proved-red: 6599fe6170a5d4f0b88d3f0f4a191960bea58ff0
ROW-037 | behavior | REQ-008 | operator:admin | n/a | arm 1 must never happen: a pending request of any person, the admin included, is missing from the page | REQ-008 | tests/invariants/REQ-008.pending-list.spec.ts | origin: REQ-008 | proved-red: 6599fe6170a5d4f0b88d3f0f4a191960bea58ff0
ROW-038 | behavior | REQ-008 | operator:admin | n/a | arm 2 must never happen: the list is not ordered oldest first. Cases: request A sent first for days in two weeks, request B sent later for tomorrow: A is listed before B | REQ-008 | tests/invariants/REQ-008.pending-list.spec.ts | origin: REQ-008 | proved-red: 6599fe6170a5d4f0b88d3f0f4a191960bea58ff0
ROW-039 | behavior | REQ-008 | operator:admin | n/a | arm 3 must never happen: a vacation request is shown without the person's days left in its year. Cases: a person with different current-year and next-year figures sends a next-year vacation: the page shows exactly that person's next-year days left, kept apart from the labelled forecast | REQ-008 | tests/invariants/REQ-008.pending-list.spec.ts | origin: REQ-008 | proved-red: 6599fe6170a5d4f0b88d3f0f4a191960bea58ff0
ROW-040 | behavior | REQ-008 | operator:admin | n/a | arm 4 must never happen: a request cannot be approved or rejected from the page. Cases: with several pending, approving the request in one row approves exactly that request and leaves every other unchanged | REQ-008 | tests/invariants/REQ-008.pending-page.spec.ts | origin: REQ-008 | proved-red: 6599fe6170a5d4f0b88d3f0f4a191960bea58ff0
ROW-041 | behavior | REQ-008 | operator:admin | n/a | arm 5 must never happen: a rejection note longer than 200 characters is accepted, or a rejection without a note is refused. Cases: through the server route, a 200-character note with non-ASCII characters is accepted and stored whole, and a 201-character note is refused with the request left pending | REQ-008 | tests/invariants/REQ-008.rejection-note.spec.ts | origin: REQ-008 | proved-red: 6599fe6170a5d4f0b88d3f0f4a191960bea58ff0
ROW-042 | behavior | REQ-008 | operator:admin | n/a | arm 6 must never happen: an empty page shows a bare list with no message | REQ-008 | tests/invariants/REQ-008.pending-page.spec.ts | origin: REQ-008 | proved-red: 6599fe6170a5d4f0b88d3f0f4a191960bea58ff0
ROW-043 | behavior | REQ-009 | operator:admin | n/a | arm 1 must never happen: an approved, rejected or cancelled request is approved or rejected. Cases: two decisions, or a person's cancel and a decision, sent at the same moment on one pending request: exactly one takes effect | REQ-009 | tests/invariants/REQ-009.only-pending-is-decided.spec.ts | origin: REQ-009 | proved-red: b500acc6e67286af92bf4ad165f1bb7994e837fb
ROW-044 | behavior | REQ-009 | member | n/a | arm 2 must never happen: anyone but the admin approves or rejects a request. Cases: as a member, approve and reject called directly on the server for their own pending request and for another person's: each refused, the request left pending | REQ-009 | tests/invariants/REQ-009.who-decides.spec.ts | origin: REQ-009 | proved-red: b500acc6e67286af92bf4ad165f1bb7994e837fb
ROW-045 | behavior | REQ-009 | operator:admin | n/a | arm 3 must never happen: the admin cannot decide their own request | REQ-009 | tests/invariants/REQ-009.who-decides.spec.ts | origin: REQ-009 | proved-red: b500acc6e67286af92bf4ad165f1bb7994e837fb
ROW-046 | behavior | REQ-009 | operator:admin | n/a | arm 4 must never happen: an approved request's days are missing from the calendar. Cases: an approved request spanning a month boundary appears on every one of its weekdays in both months, and an approved sick request appears as away | REQ-009 | tests/invariants/REQ-009.decision-effects.spec.ts | origin: REQ-009 | proved-red: b500acc6e67286af92bf4ad165f1bb7994e837fb
ROW-047 | behavior | REQ-009 | operator:admin | n/a | arm 5 must never happen: a rejected request's days still count as pending or still block a new request | REQ-009 | tests/invariants/REQ-009.decision-effects.spec.ts | origin: REQ-009 | proved-red: b500acc6e67286af92bf4ad165f1bb7994e837fb
ROW-048 | behavior | REQ-009 | (process) | n/a | arm 6 must never happen: a pending request changes state by itself when its days pass. Cases: the test clock moved past every day of a pending request, every page reloaded and the server restarted; the request is still pending and can still be approved or rejected | REQ-009 | tests/invariants/REQ-009.pending-never-decides-itself.spec.ts | origin: REQ-009 | proved-red: ff01734
ROW-049 | behavior | REQ-010 | operator:admin | n/a | arm 1 must never happen: a day before today is returned to the allowance or taken off the calendar. Cases: approved weekdays yesterday, today and tomorrow, cancelled at an instant where the team date differs from the UTC date: yesterday stays counted and on the calendar, today and tomorrow leave it; run across the test clock | REQ-010 | tests/invariants/REQ-010.admin-cancel.spec.ts | origin: REQ-010 | proved-red: b500acc6e67286af92bf4ad165f1bb7994e837fb
ROW-050 | behavior | REQ-010 | operator:admin | n/a | arm 2 must never happen: a day from today on stays counted or stays on the calendar after the cancel | REQ-010 | tests/invariants/REQ-010.admin-cancel.spec.ts | origin: REQ-010 | proved-red: b500acc6e67286af92bf4ad165f1bb7994e837fb
ROW-051 | behavior | REQ-010 | member | n/a | arm 3 must never happen: anyone but the admin cancels an approved request | REQ-010 | tests/invariants/REQ-010.admin-cancel.spec.ts | origin: REQ-010 | proved-red: b500acc6e67286af92bf4ad165f1bb7994e837fb
ROW-052 | behavior | REQ-010 | operator:admin | n/a | arm 4 must never happen: an approved request whose Monday to Friday days are all before today is changed by a cancel. Cases: an approved Wednesday to Sunday request with today the Saturday: the cancel is refused and nothing is recorded; run across the test clock | REQ-010 | tests/invariants/REQ-010.admin-cancel.spec.ts | origin: REQ-010 | proved-red: b500acc6e67286af92bf4ad165f1bb7994e837fb
ROW-053 | behavior | REQ-011 | operator:admin | n/a | arm 1 must never happen: an allowance that is negative or not a whole number is accepted. Cases: 0 is accepted; 10abc is refused | REQ-011 | tests/invariants/REQ-011.allowance-values.spec.ts | origin: REQ-011 | proved-red: b500acc6e67286af92bf4ad165f1bb7994e837fb
ROW-054 | behavior | REQ-011 | operator:admin | n/a | arm 2 must never happen: a change chosen to start this year does not change the current year's days left at once. Cases: after a change, next year's days left also reflects the new allowance, except a year whose allowance was set by a change starting next year made during the current year | REQ-011 | tests/invariants/REQ-011.allowance-years.spec.ts | origin: REQ-011 | proved-red: b500acc6e67286af92bf4ad165f1bb7994e837fb
ROW-055 | behavior | REQ-011 | operator:admin | n/a | arm 3 must never happen: a changed allowance changes, cancels or shortens an approved request | REQ-011 | tests/invariants/REQ-011.allowance-values.spec.ts | origin: REQ-011 | proved-red: b500acc6e67286af92bf4ad165f1bb7994e837fb
ROW-056 | behavior | REQ-011 | operator:admin | n/a | arm 4 must never happen: lowering an allowance below the approved days is refused | REQ-011 | tests/invariants/REQ-011.allowance-values.spec.ts | origin: REQ-011 | proved-red: b500acc6e67286af92bf4ad165f1bb7994e837fb
ROW-057 | behavior | REQ-011 | operator:admin | n/a | arm 5 must never happen: a mid-year joiner's allowance is reduced in proportion to the date. Cases: an allowance changed in early January of a moved test clock gives the full number set | REQ-011 | tests/invariants/REQ-011.allowance-values.spec.ts | origin: REQ-011 | proved-red: b500acc6e67286af92bf4ad165f1bb7994e837fb
ROW-058 | behavior | REQ-012 | member | n/a | arm 1 must never happen: a signed-in person cannot open the calendar or move to another month. Cases: a month two years back and a month beyond next year both open | REQ-012 | tests/invariants/REQ-012.calendar.spec.ts | origin: REQ-012 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-059 | behavior | REQ-012 | member | n/a | arm 2 must never happen: a person with an approved day is missing from that day. Cases: an approved request spanning a month boundary appears on every one of its weekdays in both months, and an approved sick request appears as away | REQ-012 | tests/invariants/REQ-012.calendar.spec.ts | origin: REQ-012 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-060 | behavior | REQ-012 | member | n/a | arm 3 must never happen: a pending, rejected or cancelled day appears | REQ-012 | tests/invariants/REQ-012.calendar.spec.ts | origin: REQ-012 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-061 | behavior | REQ-012 | member | n/a | arm 4 must never happen: a Saturday or Sunday shows anyone as away | REQ-012 | tests/invariants/REQ-012.calendar.spec.ts | origin: REQ-012 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-062 | behavior | REQ-012 | member | n/a | arm 5 must never happen: a switched-off account's past approved days disappear from past months. Cases: an approved sick day earlier in the current month stays on the calendar after the switch-off | REQ-012 | tests/invariants/REQ-012.calendar.spec.ts | origin: REQ-012 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-063 | behavior | REQ-013 | operator:admin | n/a | arm 1 must never happen: an account is created without a name, an email, a password or an allowance. Cases: an empty string and a whitespace-only string for each field are refused | REQ-013 | tests/invariants/REQ-013.create-account.spec.ts | origin: REQ-013 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-064 | behavior | REQ-013 | operator:admin | n/a | arm 2 must never happen: two accounts share an email, compared without regard to letter case or surrounding spaces. Cases: the existing holder of the email is switched off and differs only by letter case: refused | REQ-013 | tests/invariants/REQ-013.create-account.spec.ts | origin: REQ-013 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-065 | behavior | REQ-013 | operator:admin | n/a | arm 3 must never happen: an account is created or switched on while 30 are already switched on. Cases: with the admin and 28 others switched on and one switched off, creating one more succeeds; with 30 switched on, creating and switching on are both refused | REQ-013 | tests/invariants/REQ-013.thirty-switched-on.spec.ts | origin: REQ-013 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-066 | behavior | REQ-013 | member | n/a | arm 4 must never happen: anyone creates an account without being signed in as the admin. Cases: as a member and as an anonymous caller, a create is refused and the number of accounts is unchanged | REQ-013 | tests/invariants/REQ-013.create-account.spec.ts | origin: REQ-013 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-067 | behavior | REQ-014 | anonymous | n/a | arm 1 must never happen: someone who is not signed in sees any page's content or any data other than the sign-in page, or causes any action's effect. Cases: every address found from the server's route folder, not a hand-written list, refuses an anonymous caller | REQ-014 | tests/invariants/REQ-014.anonymous-every-route-refused.spec.ts | origin: REQ-014 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-068 | behavior | REQ-014 | member | n/a | arm 2 must never happen: a wrong password signs in | REQ-014 | tests/invariants/REQ-014.sign-in-refusals.spec.ts | origin: REQ-014 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-069 | behavior | REQ-014 | member | n/a | arm 3 must never happen: a switched-off account signs in | REQ-014 | tests/invariants/REQ-014.sign-in-refusals.spec.ts | origin: REQ-014 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-070 | behavior | REQ-014 | member | n/a | arm 4 must never happen: a session of an account keeps working after the account is switched off. Cases: switch off, then back on, then replay the old session cookie on a read and a write address: both refused, nothing changed | REQ-014 | tests/invariants/REQ-014.sessions-end.spec.ts | origin: REQ-014 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-071 | behavior | REQ-014 | member | n/a | arm 5 must never happen: a session keeps working after signing out. Cases: the cookie value saved before signing out and replayed afterwards to a read and a write address: both refused | REQ-014 | tests/invariants/REQ-014.sessions-end.spec.ts | origin: REQ-014 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-072 | behavior | REQ-015 | operator:admin | n/a | arm 1 must never happen: the admin cannot set a new password for an account | REQ-015 | tests/invariants/REQ-015.admin-sets-password.spec.ts | origin: REQ-015 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-073 | behavior | REQ-015 | member | n/a | arm 2 must never happen: a person's own password is changed through their session by a change that does not carry their correct current password | REQ-015 | tests/invariants/REQ-015.own-password-change.spec.ts | origin: REQ-015 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-074 | behavior | REQ-015 | member | n/a | arm 3 must never happen: the old password still signs in after a change | REQ-015 | tests/invariants/REQ-015.own-password-change.spec.ts | origin: REQ-015 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-075 | behavior | REQ-015 | member | n/a | arm 4 must never happen: anyone but the admin sets another person's password | REQ-015 | tests/invariants/REQ-015.admin-sets-password.spec.ts | origin: REQ-015 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-076 | behavior | REQ-015 | member | n/a | arm 5 must never happen: a session other than the changer's keeps working after a password set or change. Cases: a person's own change ends their other sessions but not the current one; an admin set ends every session of the target account | REQ-015 | tests/invariants/REQ-015.own-password-change.spec.ts | origin: REQ-015 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-077 | behavior | REQ-015 | operator:admin | n/a | arm 6 must never happen: the admin sets their own password without giving the current one | REQ-015 | tests/invariants/REQ-015.admin-sets-password.spec.ts | origin: REQ-015 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-078 | behavior | REQ-016 | operator:admin | n/a | arm 1 must never happen: the admin account can be switched off | REQ-016 | tests/invariants/REQ-016.switch-admin-and-back-on.spec.ts | origin: REQ-016 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-079 | behavior | REQ-016 | operator:admin | n/a | arm 2 must never happen: a switched-off account keeps a pending request. Cases: switching off an account whose only pending request has all its weekdays from today on succeeds and cancels it; and one whose past part is weekend days only | REQ-016 | tests/invariants/REQ-016.switch-off-pending.spec.ts | origin: REQ-016 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-080 | behavior | REQ-016 | operator:admin | n/a | arm 3 must never happen: a switched-off account keeps an approved day from today on, or that day stays on the calendar | REQ-016 | tests/invariants/REQ-016.switch-off-approved-days.spec.ts | origin: REQ-016 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-081 | behavior | REQ-016 | operator:admin | n/a | arm 4 must never happen: a switched-off account loses an approved day before today | REQ-016 | tests/invariants/REQ-016.switch-off-approved-days.spec.ts | origin: REQ-016 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-082 | behavior | REQ-016 | operator:admin | n/a | arm 5 must never happen: switching back on brings back a cancelled request or day | REQ-016 | tests/invariants/REQ-016.switch-admin-and-back-on.spec.ts | origin: REQ-016 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-083 | behavior | REQ-016 | operator:admin | n/a | arm 6 must never happen: an account switched back on, where the limit on switched-on accounts allowed it, cannot sign in | REQ-016 | tests/invariants/REQ-016.switch-admin-and-back-on.spec.ts | origin: REQ-016 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-084 | behavior | REQ-016 | operator:admin | n/a | arm 7 must never happen: an account is switched off while it holds a pending request with a Monday to Friday day before today. Cases: switching off an account whose only pending request has all its weekdays from today on succeeds and cancels it; and one whose past part is weekend days only | REQ-016 | tests/invariants/REQ-016.switch-off-pending.spec.ts | origin: REQ-016 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-085 | behavior | REQ-017 | member | n/a | arm 1 must never happen: a stored request lacks any of the named fields its state calls for | REQ-017 | tests/invariants/REQ-017.request-record.spec.ts | origin: REQ-017 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-086 | behavior | REQ-017 | member | n/a | arm 2 must never happen: a request's state is anything other than the four named | REQ-017 | tests/invariants/REQ-017.request-record.spec.ts | origin: REQ-017 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-087 | behavior | REQ-017 | member | n/a | arm 3 must never happen: a request offers or stores any free text from the person. Cases: a send carrying extra free-text keys (reason, note) stores none of them and no response echoes them | REQ-017 | tests/invariants/REQ-017.request-record.spec.ts | origin: REQ-017 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-088 | behavior | REQ-017 | operator:admin | n/a | arm 4 must never happen: a decision or cancel does not record who and when | REQ-017 | tests/invariants/REQ-017.request-record.spec.ts | origin: REQ-017 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-089 | behavior | REQ-017 | operator:admin | n/a | arm 5 must never happen: a cancel overwrites who decided the request, or its first and last day as sent. Cases: approve then cancel fully, and approve then cancel partly: who decided stays recorded | REQ-017 | tests/invariants/REQ-017.request-record.spec.ts | origin: REQ-017 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-090 | behavior | REQ-018 | operator:admin | n/a | arm 1 must never happen: an allowance change, a name change, a password set or an account switch is stored with no record of who did it and when. Cases: one case for each of allowance change, rename, password set, switch off and switch on | REQ-018 | tests/invariants/REQ-018.change-records-who-and-when.spec.ts | origin: REQ-018 | proved-red: ff01734
ROW-091 | behavior | REQ-019 | operator:admin | n/a | arm 1 must never happen: a partly cancelled request becomes cancelled or rejected. Cases: run under both the admin's cancel and a switch-off of the account | REQ-019 | tests/invariants/REQ-019.partial-cancel.spec.ts | origin: REQ-019 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-092 | behavior | REQ-019 | operator:admin | n/a | arm 2 must never happen: a partly cancelled request still counts or shows a day from the cancel day on as approved. Cases: run under both the admin's cancel and a switch-off of the account | REQ-019 | tests/invariants/REQ-019.partial-cancel.spec.ts | origin: REQ-019 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-093 | behavior | REQ-019 | operator:admin | n/a | arm 3 must never happen: the cancel date or who cancelled is not recorded. Cases: run under both the admin's cancel and a switch-off of the account | REQ-019 | tests/invariants/REQ-019.partial-cancel.spec.ts | origin: REQ-019 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-094 | behavior | REQ-019 | operator:admin | n/a | arm 4 must never happen: the person's page does not show the cancelled days as cancelled. Cases: run under both the admin's cancel and a switch-off of the account | REQ-019 | tests/invariants/REQ-019.partial-cancel.spec.ts | origin: REQ-019 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-095 | behavior | REQ-019 | operator:admin | n/a | arm 5 must never happen: an approved request with no Monday to Friday day before today stays approved after a cancel. Cases: run under both the admin's cancel and a switch-off of the account; a request whose only past days are a Saturday and Sunday and every weekday from today on becomes cancelled | REQ-019 | tests/invariants/REQ-019.whole-cancel.spec.ts | origin: REQ-019 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-096 | behavior | REQ-019 | operator:admin | n/a | arm 6 must never happen: the request's original first and last day can no longer be told after the cancel. Cases: run under both the admin's cancel and a switch-off of the account | REQ-019 | tests/invariants/REQ-019.partial-cancel.spec.ts | origin: REQ-019 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-097 | behavior | REQ-020 | operator:admin | n/a | arm 1 must never happen: an account is missing from the page. Cases: a switched-off account and the admin are both listed | REQ-020 | tests/invariants/REQ-020.people-page.spec.ts | origin: REQ-020 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-098 | behavior | REQ-020 | operator:admin | n/a | arm 2 must never happen: a listed account lacks its name, email, switched-on state, either year's allowance or either year's days left | REQ-020 | tests/invariants/REQ-020.people-page.spec.ts | origin: REQ-020 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-099 | behavior | REQ-020 | operator:admin | n/a | arm 3 must never happen: any of the six account actions (including changing an email) cannot be started from the page | REQ-020 | tests/invariants/REQ-020.people-page.spec.ts | origin: REQ-020 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-100 | behavior | REQ-020 | member | n/a | arm 4 must never happen: anyone but the admin sees any other account's email, switched-on state, allowance or days left that the page lists, by the page or by any data the product sends them, or starts any of the page's account actions. Cases: a member's own-page response carries no other account's email, allowance or days left | REQ-020 | tests/invariants/REQ-020.people-page.spec.ts | origin: REQ-020 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-101 | behavior | REQ-021 | operator:admin | n/a | arm 1 must never happen: the admin cannot open a person's requests page from the people page | REQ-021 | tests/invariants/REQ-021.person-requests.spec.ts | origin: REQ-021 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-102 | behavior | REQ-021 | operator:admin | n/a | arm 2 must never happen: a request of that person is missing | REQ-021 | tests/invariants/REQ-021.person-requests.spec.ts | origin: REQ-021 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-103 | behavior | REQ-021 | operator:admin | n/a | arm 3 must never happen: an approved request with a Monday to Friday day from today on has no cancel action | REQ-021 | tests/invariants/REQ-021.person-requests.spec.ts | origin: REQ-021 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-104 | behavior | REQ-021 | operator:admin | n/a | arm 4 must never happen: a cancel action appears on a pending, rejected or cancelled request or on an approved request with no Monday to Friday day from today on. Cases: no cancel action on an already partly cancelled request with no weekday in effect from today on, nor on a request whose only days from today on are a Saturday and Sunday | REQ-021 | tests/invariants/REQ-021.person-requests.spec.ts | origin: REQ-021 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-105 | behavior | REQ-021 | member | n/a | arm 5 must never happen: anyone but the admin sees another person's requests, by a page or by any data the product sends them, or cancels another person's request. Cases: the calendar response a member receives carries no kind, state, request id or range, only the person's name, an optional opaque account id, and the day, nothing else | REQ-021 | tests/invariants/REQ-021.person-requests.spec.ts | origin: REQ-021 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-106 | behavior | REQ-022 | operator:admin | n/a | arm 1 must never happen: an approval is refused because it would leave the days left below zero | REQ-022 | tests/invariants/REQ-022.approval-forecast.spec.ts | origin: REQ-022 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-107 | behavior | REQ-022 | operator:admin | n/a | arm 2 must never happen: the pending page does not show the days left the approval would leave | REQ-022 | tests/invariants/REQ-022.approval-forecast.spec.ts | origin: REQ-022 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-108 | behavior | REQ-022 | operator:admin | n/a | arm 3 must never happen: the shown figure differs from the days left after the approval. Cases: with two pending vacations in one year, the forecast for one equals the days left after approving that one alone; for a next-year request, the forecast uses next year's days left | REQ-022 | tests/invariants/REQ-022.approval-forecast.spec.ts | origin: REQ-022 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-109 | behavior | REQ-023 | operator:admin | n/a | arm 1 must never happen: an account lacks any of the named fields | REQ-023 | tests/invariants/REQ-023.account-record.spec.ts | origin: REQ-023 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-110 | behavior | REQ-023 | operator:admin | n/a | arm 2 must never happen: changing an allowance changes the allowance recorded for a year before the current one. Cases: through the domain surfaces with the test clock, in year Y set the allowance to 20, move to Y+1 and set 25: the allowance for Y is still 20 and Y's days left is worked out from 20 | REQ-023 | tests/invariants/REQ-023.account-record.spec.ts | origin: REQ-023 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-111 | behavior | REQ-023 | member | n/a | arm 3 must never happen: a days-left figure for an earlier year is worked out from a later year's allowance | REQ-023 | tests/invariants/REQ-023.account-record.spec.ts | origin: REQ-023 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-112 | shell | sign-in page | anonymous | n/a | Signed out, every address shows only the sign-in page: an email and password form, no navigation, no team data, and no link to any sign-up | REQ-014, REQ-013 | tests/invariants/REQ-014.signed-out-every-address.spec.ts | origin: REQ-014 | proved-red: f504e5a81aae6ed1b5fbe40b71017ba1ea3910b9
ROW-113 | shell | every page | member | n/a | Signed in as a team member who has chosen their own password, every page carries the same header with links to my requests, send a request, the team calendar, change my password and a sign-out control, and shows no admin link | REQ-006, REQ-012, REQ-015, REQ-014 | tests/invariants/REQ-014.signed-in-header-and-sign-out.spec.ts | origin: derivation 2026-11-24 | proved-red: 87c42908d43782f74dfc66d9f0b5d9695b901281
ROW-114 | shell | every page | operator:admin | n/a | Signed in as the admin, every page carries the member header plus links to pending requests and people, and a sign-out control | REQ-008, REQ-020, REQ-014 | tests/invariants/REQ-014.signed-in-header-and-sign-out.spec.ts | origin: derivation 2026-11-24 | proved-red: 87c42908d43782f74dfc66d9f0b5d9695b901281
ROW-115 | shell | unknown address | member | n/a | Signed in, an address that does not exist shows a not-found page inside the header with a link back to my requests, never a server error or a stack trace | REQ-006 | tests/invariants/REQ-014.signed-in-header-and-sign-out.spec.ts | origin: derivation 2026-11-24 | proved-red: 87c42908d43782f74dfc66d9f0b5d9695b901281
ROW-116 | reachability | member surfaces | member | n/a | From the page shown right after signing in, a team member who has chosen their own password reaches my requests, send a request, the team calendar and change my password through visible links, and every header link resolves to a page | REQ-006, REQ-001, REQ-012, REQ-015 | tests/invariants/REQ-006.reach-pages-by-links.spec.ts | origin: derivation 2026-11-24 | proved-red: 87c42908d43782f74dfc66d9f0b5d9695b901281
ROW-117 | reachability | admin surfaces | operator:admin | n/a | From the page shown right after signing in, the admin reaches pending requests, people, and from people each person's requests page, through visible links | REQ-008, REQ-020, REQ-021 | tests/invariants/REQ-006.reach-pages-by-links.spec.ts | origin: derivation 2026-11-24 | proved-red: 87c42908d43782f74dfc66d9f0b5d9695b901281
ROW-118 | reachability | admin surfaces | member | n/a | A team member sees no link or control to pending requests, people or another person's requests, and opening those addresses directly shows a refusal with no admin data. Cases: every address found from the server's route folder, admin reads included, refuses a member, or returns only the member's own data plus the calendar's away entries (the person's name, an optional opaque account id, and the day, nothing else) | INV-003, REQ-020, REQ-021 | tests/invariants/INV-003.member-refused-admin-addresses.spec.ts | origin: derivation 2026-11-24 | proved-red: 87c42908d43782f74dfc66d9f0b5d9695b901281
ROW-119 | reachability | sign-out | member | n/a | Every signed-in page shows a sign-out control; using it ends the session and the next page shown is the sign-in page | REQ-014 | tests/invariants/REQ-014.signed-in-header-and-sign-out.spec.ts | origin: REQ-014 | proved-red: 87c42908d43782f74dfc66d9f0b5d9695b901281
ROW-120 | journey | Team member | member | n/a | A team member plans a holiday (off_screen), asks for the days, sees them pending, waits (off_screen), sees the decision and the updated days left, then checks the calendar. transitions: 1. member at signed out, having already chosen their own password · sign-in form · signs in with email and password · my requests page · own requests and days left for this year and next shown; 2. member at my requests · send a request link · submits vacation from a first to a last weekday within days left · my requests page · the request listed pending with its counted days and pending days shown beside days left; 3. member at my requests · cancel control on the pending request · cancels it · my requests page · request shown cancelled and pending days back to zero; 4. member at my requests · send a request link · submits it again · my requests page · request listed pending; 5. member at my requests after the admin approved it · reloads · my requests page · request shown approved with who decided and when, days left reduced by its counted days; 6. member at my requests · team calendar link · opens the month of the request · calendar · own name listed as away on each counted weekday and on no weekend day. Cases: transition 2 uses a range crossing a weekend, Thursday to the next Tuesday, counted as 4, with the calendar empty on the Saturday and Sunday | REQ-001, REQ-002, REQ-005, REQ-006, REQ-007, REQ-012 | tests/invariants/REQ-001.journey-member-plans-a-holiday.spec.ts | origin: derivation 2026-11-24 | proved-red: 9f346517cd515c0593489e0ea4a129e69644a852
ROW-121 | journey | Admin | operator:admin | n/a | The admin sets up the team, hands out passwords (off_screen), decides requests, cancels an approved one when plans change, resets a forgotten password and switches off a leaver. transitions: 1. admin at people page · create account control · enters name, email, first password and allowance · people page · the account listed switched on with its allowance and days left; 2. admin at pending requests · approve control on a request, then the confirmation naming the person, the days and the effect · approves and confirms · pending requests · request gone from the list and on the calendar for its days; 3. admin at pending requests · reject control with a note, then the confirmation · rejects and confirms · pending requests · request gone; the person's page shows it rejected with the note; 4. admin at a person's requests page · cancel control on an approved request running across today, then the confirmation saying which days are cancelled and which stay · cancels and confirms · that page · the request shown approved up to the day before with the later days cancelled, days left restored by the cancelled days; 5. admin at people page · set password control · sets a new password · people page · the old password no longer signs in and the new one does; 6. admin at people page · switch off control on an account with no past pending request, then the confirmation · switches it off and confirms · people page · the account shown switched off; it cannot sign in and its future approved days leave the calendar. Cases: the request in transition 4 is vacation with a weekday before today and one from today on | REQ-008, REQ-009, REQ-010, REQ-013, REQ-015, REQ-016, REQ-019, REQ-020, REQ-021, REQ-025 | tests/invariants/REQ-008.journey-admin-runs-the-team.spec.ts | origin: derivation 2026-11-24 | proved-red: 9f346517cd515c0593489e0ea4a129e69644a852
ROW-122 | behavior | team calendar | member | n/a | Volume: with 30 switched-on accounts all away on the same weekday, the calendar for that month lists all 30 names on that day, readable without overlap or truncation that hides a name, and loads without error. Cases: each name lies inside its day cell's visible box | REQ-012, REQ-013 | tests/invariants/REQ-013.thirty-accounts-volume.spec.ts | origin: derivation 2026-11-24 | proved-red: 87c42908d43782f74dfc66d9f0b5d9695b901281
ROW-123 | behavior | people page | operator:admin | n/a | Volume: with 30 switched-on and some switched-off accounts, the people page lists every account with all its fields and every action, and loads without error | REQ-020, REQ-013 | tests/invariants/REQ-013.thirty-accounts-volume.spec.ts | origin: derivation 2026-11-24 | proved-red: 87c42908d43782f74dfc66d9f0b5d9695b901281
ROW-124 | behavior | pending requests page | operator:admin | n/a | Volume: with at least 3 pending requests from each of 30 accounts, the pending page lists every one, oldest first, with all its fields. Cases: requests sent in an order different from their first days' order are listed in send order | REQ-008 | tests/invariants/REQ-013.thirty-accounts-volume.spec.ts | origin: derivation 2026-11-24 | proved-red: 87c42908d43782f74dfc66d9f0b5d9695b901281
ROW-125 | behavior | INV-002 | operator:admin | n/a | control of RULE-002: the admin sees whether each request is vacation or sick on the pending page, a person's requests page and their own page | INV-002, REQ-008, REQ-021 | tests/invariants/INV-002.kind-shown-to-admin-and-self.spec.ts | origin: INV-002 | proved-red: 87c42908d43782f74dfc66d9f0b5d9695b901281
ROW-126 | behavior | INV-002 | member | n/a | control of RULE-002: a team member sees the kind of each of their own requests on their own page, while the calendar shows them only as away | INV-002, REQ-006 | tests/invariants/INV-002.kind-shown-to-admin-and-self.spec.ts | origin: INV-002 | proved-red: 87c42908d43782f74dfc66d9f0b5d9695b901281
ROW-127 | behavior | INV-003 | operator:admin | n/a | control of the admin-only rule: the admin performs each admin action (approve, reject, cancel approved, set allowance, create, rename, set another's password, switch off and on) and each takes effect | INV-003 | tests/invariants/INV-003.admin-actions-take-effect.spec.ts | origin: INV-003 | proved-red: 87c42908d43782f74dfc66d9f0b5d9695b901281
ROW-128 | behavior | REQ-014 | member | n/a | control of the sign-in guard: an account that is switched on signs in with its correct email and password, compared without regard to letter case of the email, and reaches its pages | REQ-014, REQ-013 | tests/invariants/REQ-014.sign-in-letter-case.spec.ts | origin: REQ-014 | proved-red: 87c42908d43782f74dfc66d9f0b5d9695b901281
ROW-130 | behavior | request days | member | n/a | A picked first and last day is stored, counted and shown as the same calendar day on every page whatever the server, browser and team time zones, including ranges across both daylight-saving changes | REQ-001, REQ-012, REQ-017 | tests/invariants/REQ-017.same-calendar-day-everywhere.spec.ts | origin: domain | proved-red: 6f057250d8734a752b5bdf2064a5052e01758840
ROW-131 | behavior | request days | member | n/a | An impossible date (30 February, a 31st in a 30-day month, month 13) is refused, never rolled over to another day; a real leap day such as 29 February 2028 is accepted and shown | REQ-001, REQ-004 | tests/invariants/REQ-001.strict-request-dates.spec.ts | origin: domain | proved-red: 6f057250d8734a752b5bdf2064a5052e01758840
ROW-132 | behavior | request days | member | n/a | Only one exact date format is accepted from a client; an ambiguous or loosely formatted date (03/04/2027, 2027-3-4) is refused with a plain message, never read by locale | REQ-001, REQ-017 | tests/invariants/REQ-001.strict-request-dates.spec.ts | origin: domain | proved-red: 6f057250d8734a752b5bdf2064a5052e01758840
ROW-133 | behavior | team clock | member | n/a | Every decision on today or the current year (send window, admin cancel, switch-off refusal and cut-off, the cancel action shown, the days-left years, the year an allowance change starts) uses the team time zone: checked at 23:30 and 00:30 team time in summer and winter time, and at New Year in both offset directions | REQ-004, REQ-010, REQ-011, REQ-016, REQ-021, REQ-007 | tests/invariants/REQ-004.team-clock-decisions.spec.ts | origin: domain | proved-red: 6f057250d8734a752b5bdf2064a5052e01758840
ROW-134 | behavior | team clock | member | n/a | A today, time zone or minimum date sent by the client is never trusted: a vacation for yesterday sent with a forged clock value and no date-picker minimum is refused and nothing is stored | REQ-004 | tests/invariants/REQ-004.client-clock-not-trusted.spec.ts | origin: domain | proved-red: 6f057250d8734a752b5bdf2064a5052e01758840
ROW-135 | behavior | team clock | member | n/a | control of ROW-134: a vacation request for today sent without any client clock value is accepted | REQ-004 | tests/invariants/REQ-004.client-clock-not-trusted.spec.ts | origin: domain | proved-red: 6f057250d8734a752b5bdf2064a5052e01758840
ROW-136 | behavior | team clock | operator:admin | n/a | Setup cannot finish without an explicitly chosen named time zone, never a silent default and never a fixed offset, refused by name (an offset spelling; the Etc/ zones; the UTC and GMT aliases UTC, UCT, GMT, GMT0, Greenwich, Universal and Zulu; the legacy fixed names EST, MST and HST), while a named geographic zone is accepted whether or not it observes daylight saving, America/Guatemala and America/Costa_Rica included (A-054); the chosen zone is shown to the admin afterwards, and a runtime without time-zone data refuses to start | CON-003, REQ-004 | tests/invariants/CON-003.named-zone-at-setup.spec.ts | origin: domain | proved-red: ff01734
ROW-137 | behavior | stored days | (process) | n/a | Stored request days, cancel days and the calendar do not change when the server process time zone changes or when time passes across midnight, a month end, New Year or a daylight-saving change | REQ-017, REQ-012 | tests/invariants/REQ-017.stored-days-stay-put.spec.ts | origin: domain | proved-red: ff01734
ROW-138 | behavior | date display | member | n/a | Every date the product shows uses one unambiguous format with the month as a word, and the calendar year: 29 to 31 December and 1 to 3 January show the right year | REQ-006, REQ-008, REQ-012 | tests/invariants/REQ-006.dates-shown.spec.ts | origin: domain | proved-red: 6f057250d8734a752b5bdf2064a5052e01758840
ROW-139 | behavior | sent and decided times | member | n/a | Sent, decided and cancelled times show the team-zone date, and lists sort them by the true moment, including across a daylight-saving fall-back | REQ-006, REQ-008, REQ-017 | tests/invariants/REQ-006.dates-shown.spec.ts | origin: domain | proved-red: 6f057250d8734a752b5bdf2064a5052e01758840
ROW-140 | behavior | date comparison | n/a | n/a | Overlap checks, month queries and year totals give the right answer for single-digit months and days (9 September against 10 October, the 9th against the 10th) | REQ-003, REQ-012, INV-001 | tests/invariants/REQ-003.single-digit-dates.spec.ts | origin: domain | proved-red: 6f057250d8734a752b5bdf2064a5052e01758840
ROW-141 | behavior | send window | member | n/a | The stated bounds are inclusive: a one-day request, a vacation starting today, a sick request for 1 January of the current year and a request ending 31 December of the next year are all accepted | REQ-001, REQ-004 | tests/invariants/REQ-004.inclusive-send-window.spec.ts | origin: domain | proved-red: 6f057250d8734a752b5bdf2064a5052e01758840
ROW-142 | behavior | send window | member | n/a | A sick request for future days, or one spanning past, today and future days, is accepted | REQ-004 | tests/invariants/REQ-004.inclusive-send-window.spec.ts | origin: domain | proved-red: 6f057250d8734a752b5bdf2064a5052e01758840
ROW-143 | behavior | before today | operator:admin | n/a | Before today means a counted weekday before today: an approved request sent Saturday to Friday and cancelled on the Monday becomes cancelled, a pending request whose only past day is a Saturday does not block switch-off, and a cancel made on a weekend takes effect from the next weekday. Cases: a whole cancel (a person's own pending cancel, a full admin cancel, a switch-off cancel) records no cancel day | REQ-010, REQ-016, REQ-019 | tests/invariants/REQ-019.before-today-weekdays.spec.ts | origin: domain | proved-red: 6f057250d8734a752b5bdf2064a5052e01758840
ROW-144 | behavior | 30-account limit | operator:admin | n/a | The limit of 30 counts switched-on accounts including the admin and never switched-off ones: with the admin and 29 others on, one more is refused; with 29 on and some off, creating or switching one on is accepted. Cases: switching one on with 30 switched on is refused; two creates, or a create and a switch-on, at the same moment with 29 switched on store exactly one | REQ-013 | tests/invariants/REQ-013.thirty-limit-cases.spec.ts | origin: domain | proved-red: 6f057250d8734a752b5bdf2064a5052e01758840
ROW-145 | behavior | allowance input | operator:admin | n/a | Allowance input is parsed strictly: forms like 1e2, 25.0, 025, a 20-digit number or negative zero are refused or stored exactly as the whole number meant, never a server error or a wrapped value | REQ-011, REQ-023 | tests/invariants/REQ-011.strict-allowance-input.spec.ts | origin: domain | proved-red: 6f057250d8734a752b5bdf2064a5052e01758840
ROW-146 | behavior | allowance years | member | n/a | After New Year in the team zone, with no admin action, both the new current year and the new next year have the allowance, both days-left figures show, and a vacation within the new next year is accepted | REQ-007, REQ-023, REQ-002 | tests/invariants/REQ-023.allowance-every-year.spec.ts | origin: domain | proved-red: 6f057250d8734a752b5bdf2064a5052e01758840
ROW-147 | behavior | allowance years | operator:admin | n/a | An account created in any month, December included, or switched back on after one or more New Years, has its allowance for the current and the next year | REQ-013, REQ-023, REQ-016 | tests/invariants/REQ-023.allowance-every-year.spec.ts | origin: domain | proved-red: 6f057250d8734a752b5bdf2064a5052e01758840
ROW-148 | behavior | allowance years | operator:admin | n/a | An allowance change starting this year updates the next year as well as the current year, except a year whose allowance was set by a change starting next year made during the current year; the current year after a next-year change and the years before the current one are held by their own rows. Cases: a change starting this year, and separately one starting next year, then the test clock moved to 1 January two years later: that year's days left use the changed allowance, and a next-year change is not undone by a this-year change made in the same year; next year set to 30 and this year corrected to 26 in year Y, clock moved to 1 January of Y+1: the year Y+2 uses 30; next year set to 30 in year Y, clock moved to Y+1, this year corrected to 26: the year Y+2 uses 26 | REQ-011, REQ-023 | tests/invariants/REQ-023.allowance-every-year.spec.ts | origin: domain | proved-red: 6f057250d8734a752b5bdf2064a5052e01758840
ROW-149 | behavior | year attribution | member | n/a | A request is charged to the year its days are in: in December, with this year used up and next year free, a next-year vacation is accepted; the reverse is refused; a December request approved in January changes only December's year | REQ-002, REQ-007, REQ-022 | tests/invariants/REQ-022.year-attribution.spec.ts | origin: domain | proved-red: 6f057250d8734a752b5bdf2064a5052e01758840
ROW-150 | behavior | last year's pending | operator:admin | n/a | A pending request for last year's days can be approved or rejected in January, is charged to its own year, and the pending page shows its days left and forecast from that year's allowance | REQ-009, REQ-022, REQ-008 | tests/invariants/REQ-022.year-attribution.spec.ts | origin: domain | proved-red: 6f057250d8734a752b5bdf2064a5052e01758840
ROW-151 | behavior | allowance records | n/a | n/a | The allowance for any year is, among the allowance changes starting at or before it, the one with the latest starting year, and among those the most recently made, so nothing has to be created when a year begins, a read never writes, and two changes at the same moment are both kept in order | REQ-023, INV-001 | tests/invariants/REQ-023.allowance-records.spec.ts | origin: domain | proved-red: 6f057250d8734a752b5bdf2064a5052e01758840
ROW-152 | behavior | allowance records | n/a | n/a | control of ROW-151: a single allowance change just after New Year writes that year's record once and days left reflect it | REQ-023, INV-001 | tests/invariants/REQ-023.allowance-records.spec.ts | origin: domain | proved-red: 6f057250d8734a752b5bdf2064a5052e01758840
ROW-153 | behavior | balance | member | n/a | Property: over generated sequences of sends, approvals, rejections, own cancels, partial cancels, switch-offs and back-ons and allowance changes, with the clock moved across month ends and New Year, every days-left figure equals an independent recount from the request records. Cases: the oracle is a reference model of the generated sequence (allowance per year, days approved and cancelled from the generated dates), never the stored rows; the generated steps include moving the team's today forward | INV-001 | tests/invariants/INV-001.balance-model-property.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-154 | behavior | balance | member | n/a | Every site that decides or forecasts from a balance (the send check, the refusal message, the pending forecast) uses days in effect: after a partial cancel or a switch-off and back-on, a vacation for exactly the days given back is accepted | REQ-002, REQ-022, INV-001 | tests/invariants/INV-001.days-in-effect-sites.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-155 | behavior | balance | member | n/a | control of ROW-154: before any cancel, a vacation for exactly the days left minus pending is accepted | REQ-002, REQ-022, INV-001 | tests/invariants/INV-001.days-in-effect-sites.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-156 | behavior | balance | member | n/a | A pending sick request never counts as pending vacation: with N days left and a sick request pending, a vacation of N days is accepted and the pending vacation figure stays 0 | REQ-002, REQ-007 | tests/invariants/INV-001.days-in-effect-sites.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-157 | behavior | partly cancelled | member | n/a | A partly cancelled request shows its in-effect and cancelled counts, and for each year the in-effect days of the listed approved vacation requests add up to the allowance minus days left | REQ-006, REQ-019, INV-001 | tests/invariants/INV-001.partly-cancelled-request.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-158 | behavior | day counting | member | n/a | Property: over independently generated ranges, the counted days of a request, the days charged to the balance and the days shown on the calendar are the same set of weekdays. Cases: an independent weekday oracle from known anchor dates, with server and team zones set away from UTC | REQ-001, REQ-012, INV-001 | tests/invariants/REQ-001.day-counting-property.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-159 | behavior | figures | member | n/a | Every days-left, pending or forecast figure, on every page and confirmation (the admin's person page and the approve confirmation included, A-055), is labelled with its year and says which it is | REQ-007, REQ-008, REQ-020, REQ-002, REQ-021, REQ-025, REQ-022, INV-001 | tests/invariants/INV-001.figure-labels.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-160 | behavior | pending page | operator:admin | n/a | After the admin decides one request of a person, the figures shown for that person's other pending requests are recomputed before the next decision | REQ-008, REQ-022 | tests/invariants/REQ-008.pending-figures-recomputed.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-161 | behavior | send | member | n/a | Two overlapping requests of any kind sent at the same moment by the same person store exactly one | REQ-003 | tests/invariants/REQ-003.simultaneous-sends.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-162 | behavior | send | member | n/a | control of ROW-161: two non-overlapping requests sent at the same moment are both stored | REQ-003 | tests/invariants/REQ-003.simultaneous-sends.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-163 | behavior | decide | operator:admin | n/a | A person's cancel and the admin's approval of the same pending request at the same moment end in one recorded outcome, and each side is shown what was recorded | REQ-005, REQ-009 | tests/invariants/REQ-009.simultaneous-decisions.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-164 | behavior | decide | operator:admin | n/a | control of ROW-163: an approval with no competing action is recorded and shown approved | REQ-005, REQ-009 | tests/invariants/REQ-009.simultaneous-decisions.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-165 | behavior | decide | operator:admin | n/a | Two decisions, or two cancels, on the same request at the same moment land once, with one decider and one cancel day | REQ-009, REQ-010 | tests/invariants/REQ-009.simultaneous-decisions.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-166 | behavior | decide | operator:admin | n/a | control of ROW-165: a single approval records exactly one decider and time | REQ-009, REQ-010 | tests/invariants/REQ-009.simultaneous-decisions.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-167 | behavior | switch-off | operator:admin | n/a | A send in flight while the account is switched off, or an approval in flight on its request, never leaves a pending request or an approved future day on the switched-off account | REQ-016 | tests/invariants/REQ-016.switch-off-in-flight.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-168 | behavior | switch-off | operator:admin | n/a | control of ROW-167: a request sent before the switch-off began is cancelled by it like any other | REQ-016 | tests/invariants/REQ-016.switch-off-in-flight.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-169 | behavior | sign-in | member | n/a | A sign-in in flight while the account is switched off or its password is set never produces a working session after the change | REQ-014, REQ-015 | tests/invariants/REQ-014.sign-in-in-flight.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-170 | behavior | sign-in | member | n/a | control of ROW-169: a sign-in with no competing change produces a working session | REQ-014, REQ-015 | tests/invariants/REQ-014.sign-in-in-flight.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-171 | behavior | account store | operator:admin | n/a | Two accounts never share an email, even when created at the same moment or differing only in letter case or surrounding spaces; the store itself enforces it | REQ-013 | tests/invariants/REQ-013.email-unique-in-the-store.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-172 | behavior | account store | operator:admin | n/a | control of ROW-171: two accounts with different emails created at the same moment are both stored | REQ-013 | tests/invariants/REQ-013.email-unique-in-the-store.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-173 | behavior | calendar | member | n/a | A sick and a vacation absence of other people are identical in the calendar's markup, data and order apart from the name and an optional opaque account id | INV-002 | tests/invariants/INV-002.calendar-kind-blind.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-174 | behavior | calendar | member | n/a | control of ROW-173: the admin and the person themselves see the kind on their own pages | INV-002 | tests/invariants/INV-002.calendar-kind-blind.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-175 | behavior | calendar | member | n/a | The calendar response sent to a member carries no pending, rejected or cancelled entries, no cancelled days of a partly cancelled request, and for other people no field beyond display name, an optional opaque account id and days away, with no request ids or request-shaped blocks | INV-002, REQ-012 | tests/invariants/INV-002.calendar-response-fields.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-176 | behavior | calendar | member | n/a | control of ROW-175: the calendar response carries every approved day of every person by name | INV-002, REQ-012 | tests/invariants/INV-002.calendar-response-fields.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-177 | behavior | listings | member | n/a | No filter, sort or query parameter on the calendar or any listing a member can call changes which other people's entries are returned by kind or state | INV-002, INV-003 | tests/invariants/INV-002.listing-parameters.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-178 | behavior | listings | member | n/a | control of ROW-177: moving between months still returns that month's approved days | INV-002, INV-003 | tests/invariants/INV-002.listing-parameters.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-179 | behavior | person references | member | n/a | Any reference to a person sent to someone other than the admin carries only an opaque account id and display name: no email, password value, admin flag or allowance | INV-003, REQ-020 | tests/invariants/INV-003.person-references.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-180 | behavior | person references | member | n/a | control of ROW-179: the admin's people page carries every listed field | INV-003, REQ-020 | tests/invariants/INV-003.person-references.spec.ts | origin: domain | proved-red: 0d6a999af60a147496f2860decc6673d2303dcf5
ROW-181 | behavior | urls and logs | n/a | n/a | The kind, rejection notes and passwords never appear in a URL or in any log line | INV-002, REQ-015 | tests/invariants/INV-002.no-kind-note-or-password-in-urls-or-logs.spec.ts | origin: domain | proved-red: 20f91aa
ROW-182 | behavior | member actions | member | n/a | Extra fields on a member's own action (an admin flag, an allowance, a state, a decider, another person) are ignored and change nothing | INV-003, REQ-001 | tests/invariants/INV-003.member-extra-fields.spec.ts | origin: domain | proved-red: 12c92127511f9e440d3af6890ddf02600b0df96b
ROW-183 | behavior | member actions | member | n/a | control of ROW-182: the same action with only its own fields takes effect | INV-003, REQ-001 | tests/invariants/INV-003.member-extra-fields.spec.ts | origin: domain | proved-red: 12c92127511f9e440d3af6890ddf02600b0df96b
ROW-184 | behavior | refused actions | member | n/a | A member's refused action on another person's request answers exactly as for a request that does not exist, revealing no state or kind | INV-003 | tests/invariants/INV-003.refused-on-anothers-request.spec.ts | origin: domain | proved-red: 12c92127511f9e440d3af6890ddf02600b0df96b
ROW-185 | behavior | refused actions | member | n/a | control of ROW-184: the same action on the member's own pending request takes effect | INV-003 | tests/invariants/INV-003.refused-on-anothers-request.spec.ts | origin: domain | proved-red: 12c92127511f9e440d3af6890ddf02600b0df96b
ROW-186 | behavior | one admin | operator:admin | n/a | Exactly one account is the admin after every action; no admin flag is accepted on create or rename, and the setup path refuses and changes nothing once setup is done | CON-001, INV-003 | tests/invariants/CON-001.one-admin.spec.ts | origin: domain | proved-red: ff01734
ROW-187 | behavior | one admin | operator:admin | n/a | control of ROW-186: setup on an empty database creates the one admin | CON-001, INV-003 | tests/invariants/CON-001.one-admin.spec.ts | origin: domain | proved-red: 12c92127511f9e440d3af6890ddf02600b0df96b
ROW-188 | behavior | admin as a person | operator:admin | n/a | The admin's own requests obey every sending rule (allowance, overlap, window, weekdays) exactly as anyone else's | REQ-001, REQ-002, REQ-003, REQ-004 | tests/invariants/REQ-001.admin-sends-by-the-rules.spec.ts | origin: domain | proved-red: 12c92127511f9e440d3af6890ddf02600b0df96b
ROW-189 | behavior | admin as a person | operator:admin | n/a | control of ROW-188: the admin sends a valid vacation within their days left and it is stored pending | REQ-001, REQ-002, REQ-003, REQ-004 | tests/invariants/REQ-001.admin-sends-by-the-rules.spec.ts | origin: domain | proved-red: 12c92127511f9e440d3af6890ddf02600b0df96b
ROW-190 | behavior | admin cancel | operator:admin | n/a | The admin's cancel action called on a pending, rejected or cancelled request changes nothing and is refused | REQ-010 | tests/invariants/REQ-010.admin-cancel-refused-states.spec.ts | origin: domain | proved-red: 12c92127511f9e440d3af6890ddf02600b0df96b
ROW-191 | behavior | admin cancel | operator:admin | n/a | control of ROW-190: the admin's cancel on an approved request with a future weekday takes effect | REQ-010 | tests/invariants/REQ-010.admin-cancel-refused-states.spec.ts | origin: domain | proved-red: 12c92127511f9e440d3af6890ddf02600b0df96b
ROW-192 | behavior | row actions | operator:admin | n/a | Every row action on the pending, people and person pages acts on the request or account shown in its row by id, even after the list changed since the page loaded | REQ-008, REQ-020, REQ-021 | tests/invariants/REQ-008.row-actions-by-id.spec.ts | origin: domain | proved-red: 12c92127511f9e440d3af6890ddf02600b0df96b
ROW-193 | behavior | person page | operator:admin | n/a | A person's requests page opened by the admin names that person (display name and email) at its top | REQ-021 | tests/invariants/REQ-021.person-page-names-person.spec.ts | origin: domain | proved-red: 12c92127511f9e440d3af6890ddf02600b0df96b
ROW-194 | behavior | request history | n/a | n/a | A request's person, kind, days as sent, sent time and decision record are never rewritten or deleted after they are written; the only later writes are its state change, its decision and its cancel record | REQ-017 | tests/invariants/REQ-017.request-history.spec.ts | origin: domain | proved-red: 12c92127511f9e440d3af6890ddf02600b0df96b
ROW-195 | behavior | request history | n/a | n/a | control of ROW-194: a decision writes the decider and time on a pending request | REQ-017 | tests/invariants/REQ-017.request-history.spec.ts | origin: domain | proved-red: 12c92127511f9e440d3af6890ddf02600b0df96b
ROW-196 | behavior | switch-off | operator:admin | n/a | Switching an account off never rewrites an approved request with no weekday from today on, and records the admin and the switch-off time as the canceller of what it cancels | REQ-016, REQ-019, REQ-017 | tests/invariants/REQ-016.switch-off-records.spec.ts | origin: domain | proved-red: 12c92127511f9e440d3af6890ddf02600b0df96b
ROW-197 | behavior | switch-off | operator:admin | n/a | control of ROW-196: switching off cancels a future approved weekday and records it | REQ-016, REQ-019, REQ-017 | tests/invariants/REQ-016.switch-off-records.spec.ts | origin: domain | proved-red: 12c92127511f9e440d3af6890ddf02600b0df96b
ROW-198 | behavior | record rules | n/a | n/a | Every stored request satisfies the record rules (first day not after last, one year, a cancel day only on a partly cancelled request, inside its range and on a weekday, decider fields matching its state (pending: no decider; approved or rejected: a decider; cancelled: a decider exactly when it was approved before the cancel; a cancel day only on an approved, partly cancelled request; who cancelled and when present exactly on cancelled and partly cancelled requests, checked for each way of cancelling: own pending cancel, admin cancel, switch-off), a person that exists), enforced by the store too | REQ-017, REQ-023 | tests/invariants/REQ-017.record-rules-in-the-store.spec.ts | origin: domain | proved-red: ff01734
ROW-199 | behavior | multi-record actions | operator:admin | n/a | A switch-off, partial cancel, password set or change, allowance change, approval or rejection is all-or-nothing: a failure part-way leaves no half-done state and shows no success | REQ-016, REQ-019, REQ-015, REQ-011, REQ-009 | tests/invariants/REQ-016.all-or-nothing-under-a-fault.spec.ts | origin: domain | proved-red: ff01734
ROW-200 | behavior | multi-record actions | operator:admin | n/a | control of ROW-199: the same action with no failure completes every part | REQ-016, REQ-019, REQ-015, REQ-011, REQ-009 | tests/invariants/REQ-016.multi-record-actions-complete.spec.ts | origin: domain | proved-red: 12c92127511f9e440d3af6890ddf02600b0df96b
ROW-201 | behavior | durability | operator:admin | n/a | A success shown to the user survives the server stopping right after it; a restart never re-seeds people, resets the admin or its password; a new release started on an existing database keeps every record and figure | REQ-017, REQ-023, CON-001 | tests/invariants/REQ-017.survives-restart.spec.ts | origin: domain | proved-red: 20f91aa
ROW-202 | behavior | durability | operator:admin | n/a | control of ROW-201: a restart with no pending change shows the same data | REQ-017, REQ-023, CON-001 | tests/invariants/REQ-017.survives-restart.spec.ts | origin: domain | proved-red: ff01734
ROW-203 | behavior | reads | n/a | n/a | Opening a page never changes a request or allowance record | INV-001, REQ-017 | tests/invariants/INV-001.opening-pages-changes-nothing.spec.ts | origin: domain | proved-red: 12c92127511f9e440d3af6890ddf02600b0df96b
ROW-204 | behavior | provenance | operator:admin | n/a | Who decided or cancelled a request still shows correctly after that account is renamed, switched off or recovered by hand in the database. Cases: the current display name is shown, the record keeping the account id | REQ-006, REQ-017 | tests/invariants/REQ-006.provenance-after-hand-recovery.spec.ts | origin: domain | proved-red: ff01734
ROW-205 | behavior | send form | member | n/a | The kind on the send form must be chosen; nothing is preselected and a send without a kind is refused | REQ-001 | tests/invariants/REQ-001.send-form-kind.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-206 | behavior | refusals | member | n/a | Every refusal says in plain words which rule refused it and keeps the values the person entered | REQ-002, REQ-003, REQ-004, REQ-013 | tests/invariants/REQ-002.refusals-in-plain-words.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-207 | behavior | success | member | n/a | A success message appears only for an outcome the server recorded; a refused, failed or overtaken action never shows success | REQ-005, REQ-009, REQ-010 | tests/invariants/REQ-005.success-and-stale-page.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-208 | behavior | repeat submits | member | n/a | A double click, reload or Back after a submitted send-request form never repeats the send and never shows a refusal of the user's own first submit; the other submitting controls are outside this row (A-050, ROW-287) | REQ-003, REQ-009 | tests/invariants/REQ-003.repeat-submits.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-209 | behavior | repeat submits | member | n/a | control of ROW-208: one submit records exactly one action and shows its success | REQ-003, REQ-009 | tests/invariants/REQ-003.repeat-submits.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-210 | behavior | phone width | member | n/a | Every page works at phone width (about 375 pixels) with no sideways page scroll, every control reachable, and 30 names on one calendar day all readable | REQ-012, REQ-008, REQ-020 | tests/invariants/REQ-012.phone-width.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-211 | behavior | fresh install | operator:admin | n/a | On a fresh install with only the setup admin and no requests, every page shows an orderly empty state, and the admin has a name and an allowance and can send their own request | REQ-006, REQ-008, REQ-012, REQ-020, CON-001 | tests/invariants/REQ-006.fresh-install.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-212 | behavior | calendar | member | n/a | The calendar opens on the current month in the team zone and marks today; every weekday sits under its true heading in every month, months needing six week rows and February in leap years are complete, days of neighbouring months shown in the grid are never blank when someone is away, and a request spanning a whole middle month shows in it | REQ-012 | tests/invariants/REQ-012.calendar-grid.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-213 | behavior | calendar | member | n/a | A malformed or out-of-range month or year in the calendar address gives an orderly page, and moving on from December reaches January of the next year | REQ-012 | tests/invariants/REQ-012.calendar-grid.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-214 | behavior | text | member | n/a | Names and notes in any script or with emoji survive every save and display; the 200 limit counts characters; long unbroken names, emails or notes never widen a page beyond the screen. Cases: the 200 limit counts Unicode code points and is tested with 200 characters outside the basic plane through the browser form | REQ-013, REQ-008, REQ-020 | tests/invariants/REQ-013.text-in-any-script.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-215 | behavior | email | member | n/a | An email is trimmed and compared without regard to letter case both when created and at sign-in, so a stray space or phone autocapital never locks a person out or creates a second account | REQ-013, REQ-014 | tests/invariants/REQ-013.email-case-and-blank-names.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-216 | behavior | rename | operator:admin | n/a | Creating or renaming an account with an empty or blank name (made only of spaces and invisible characters, in any mix — a zero-width space or word joiner, for example, A-056) is refused | REQ-013, REQ-020, REQ-023 | tests/invariants/REQ-013.email-case-and-blank-names.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-217 | behavior | session end | member | n/a | When a session ends (switch-off, password change, sign-out elsewhere) the open tab goes to the sign-in page with a plain line saying the session ended | REQ-014 | tests/invariants/REQ-014.session-end-tab-and-header.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-218 | behavior | header | member | n/a | The header shows the signed-in person's display name on every page | REQ-014 | tests/invariants/REQ-014.session-end-tab-and-header.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-219 | behavior | stale page | member | n/a | After an action is refused because the request changed, the page shown reflects the current state, not the stale one | REQ-005, REQ-009 | tests/invariants/REQ-005.success-and-stale-page.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-220 | behavior | password change | member | n/a | Changing one's own password ends every other session but keeps the changer signed in; the admin setting another's password keeps the admin signed in | REQ-015 | tests/invariants/REQ-015.password-sessions-and-exact-match.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-221 | behavior | reset links | anonymous | n/a | The sign-in page offers no forgot-password, reset or sign-up link, and no such route answers; it says the admin sets new passwords | REQ-014, NG-001, NG-010 | tests/invariants/REQ-014.no-reset-or-sign-up.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-222 | behavior | mutations | member | n/a | No state change happens from a request made by any origin other than the product's own (a page served from another port of the same host is outside this row, A-057), or from a plain link or address visit, while someone is signed in | INV-003, REQ-014 | tests/invariants/REQ-014.cross-site-and-link-mutations.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-223 | behavior | mutations | member | n/a | control of ROW-222: the same change made from the product's own form takes effect | INV-003, REQ-014 | tests/invariants/REQ-014.cross-site-and-link-mutations.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-224 | behavior | stored text | member | n/a | Stored text (names, emails, notes) never runs as markup on any page | INV-002, REQ-014 | tests/invariants/INV-002.stored-text-never-markup.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-225 | behavior | stored text | member | n/a | control of ROW-224: the same text is shown literally | INV-002, REQ-014 | tests/invariants/INV-002.stored-text-never-markup.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-226 | behavior | error pages | member | n/a | Error responses, including server failures and malformed parameters, never show a stack trace, query, file path or any record | INV-002, REQ-006 | tests/invariants/INV-002.error-pages-and-served-files.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-227 | behavior | browser cache | member | n/a | Signed-in pages are not stored by the browser and no team data remains in browser storage after sign-out, so Back on a shared computer shows nothing | REQ-014, INV-002 | tests/invariants/INV-002.cache-framing-third-parties.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-228 | behavior | framing | member | n/a | No page can be framed by another site | INV-003 | tests/invariants/INV-002.cache-framing-third-parties.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-229 | behavior | served files | anonymous | n/a | No address serves the database file, configuration, environment, backups, source maps or the version-control folder | INV-002, INV-003 | tests/invariants/INV-002.error-pages-and-served-files.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-230 | behavior | third parties | n/a | n/a | No page loads scripts, styles, fonts or trackers from another site, and no team data is sent to another site | INV-002 | tests/invariants/INV-002.cache-framing-third-parties.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-231 | behavior | passwords | operator:admin | n/a | A password is never readable: not stored readable, and absent from every response, log line and change record | REQ-015, REQ-023 | tests/invariants/REQ-015.password-not-stored-or-logged.spec.ts | origin: domain | proved-red: ff01734
ROW-232 | behavior | passwords | member | n/a | A blank password can never be set or sign in; a password round-trips exactly as typed, spaces and non-ASCII included. Cases: after setting a password with surrounding spaces, the trimmed form is refused; a password of only spaces counts as blank | REQ-015, REQ-013 | tests/invariants/REQ-015.password-sessions-and-exact-match.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-233 | behavior | passwords | member | n/a | control of ROW-232: a password with spaces and accents signs in exactly as set | REQ-015, REQ-013 | tests/invariants/REQ-015.password-sessions-and-exact-match.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-234 | behavior | passwords | operator:admin | n/a | Other people's password fields on the people page are never autofilled with the admin's own sign-in, and the browser is not offered to save them as the admin's | REQ-013, REQ-015 | tests/invariants/REQ-015.people-page-password-fields.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-235 | behavior | sign-in | anonymous | n/a | Sign-in answers identically, in message and shape, on a single attempt, for an unknown email, a wrong password and a switched-off account; a switched-off account's correct password need not count toward the wait (A-051) | REQ-014 | tests/invariants/REQ-014.sign-in-answers-and-attempt-bound.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-236 | behavior | sign-in | anonymous | n/a | control of ROW-235: a correct sign-in succeeds | REQ-014 | tests/invariants/REQ-014.sign-in-answers-and-attempt-bound.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-237 | behavior | sign-in | anonymous | n/a | Wrong-password attempts at sign-in and at the change-password form are bounded per account and cannot be evaded by changing a forwarded address header or the email's case, and the bound never locks an account permanently. Cases: surrounding spaces on the email do not evade the bound; the bound is keyed on the normalised submitted email whether or not an account exists, so known and unknown emails answer alike; the bound is 5 wrong attempts within 15 minutes per normalised email, followed by a 15-minute wait; the bound counts wrong attempts sent one after another, and attempts sent at the same moment are outside it at this stage (A-049) | REQ-014, REQ-015 | tests/invariants/REQ-014.sign-in-answers-and-attempt-bound.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-238 | behavior | sign-in | anonymous | n/a | control of ROW-237: after the 15-minute wait, the correct password signs in | REQ-014, REQ-015 | tests/invariants/REQ-014.sign-in-answers-and-attempt-bound.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-239 | behavior | sessions | member | n/a | A session is renewed at sign-in with a new identifier (the one from before need not stop working, A-052), stays ended after a switch-off even when the account is switched back on, and session identifiers cannot be guessed or forged with any default value | REQ-014 | tests/invariants/REQ-014.session-identifiers-and-cookie.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-240 | behavior | sessions | member | n/a | control of ROW-239: a fresh sign-in after switch-on works | REQ-014 | tests/invariants/REQ-014.session-identifiers-and-cookie.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-241 | behavior | cookie | member | n/a | The session cookie cannot be read by page scripts, is not sent to other sites, and never appears in a URL; the return address after sign-in never leads to another site | REQ-014 | tests/invariants/REQ-014.session-identifiers-and-cookie.spec.ts | origin: domain | proved-red: d80c27d0a147ea8b7014ac36d1887a81295468b1
ROW-242 | behavior | REQ-001 | member | n/a | The counted days equal the Monday to Friday days from the first to the last day, both included: Monday to Friday counts 5, Friday to Monday counts 2, and a single weekday with first day equal to last day is accepted and counts 1 | REQ-001 | tests/invariants/REQ-001.counted-weekdays.spec.ts | origin: derivation 2026-11-24 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-243 | behavior | REQ-003 | member | n/a | A request that shares only a Saturday or Sunday with the person's own pending or approved request is accepted | REQ-003, REQ-001 | tests/invariants/REQ-003.overlapping-requests.spec.ts | origin: derivation 2026-11-24 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-244 | behavior | REQ-006 | member | n/a | The own requests page lists requests from the most recently sent to the oldest. Cases: three requests sent in the order next month, then tomorrow, then two weeks out are listed two weeks out, tomorrow, next month | REQ-006 | tests/invariants/REQ-006.own-requests-list.spec.ts | origin: derivation 2026-11-24 | proved-red: 6599fe6170a5d4f0b88d3f0f4a191960bea58ff0
ROW-245 | behavior | REQ-016 | operator:admin | n/a | The admin partly cancels an approved request and days later switches the account off: the request keeps its first cancel day and canceller, and days left do not change | REQ-016, REQ-019 | tests/invariants/REQ-016.switch-off-approved-days.spec.ts | origin: derivation 2026-11-24 | proved-red: e432eb40567f66741a4fd602ec5305a130f659d4
ROW-246 | behavior | REQ-005 | member | n/a | A person cancels, on a weekend, their own pending request whose weekdays are all from today on, and it is stored cancelled with who and when, no cancel day and no error. Cases: on a Sunday, the person cancels their own pending request running from the Saturday just past to the following Friday; it is stored cancelled | REQ-005, REQ-017 | tests/invariants/REQ-005.cancel-limits.spec.ts | origin: derivation 2026-11-24 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-247 | behavior | team clock | n/a | n/a | The test clock override is honoured only in the test profile: a production start with the override set refuses to start | REQ-004, CON-003 | tests/invariants/REQ-004.clock-override-test-profile-only.spec.ts | origin: derivation 2026-11-24 | proved-red: ff01734
ROW-248 | behavior | REQ-004 | member | n/a | arm 7 must never happen: a sick request with a day before 1 January of the current year is accepted when sent outside January, or with a day before 1 January of the previous year at any time | REQ-004 | tests/invariants/REQ-004.sick-previous-year.spec.ts | origin: REQ-004 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-249 | behavior | REQ-004 | member | n/a | arm 8 must never happen: a sick request sent in January for weekdays of the previous year is refused because those days fall in the previous year. Cases: sent on 2 January in the team zone for 30 and 31 December, run across the test clock; and sent on 31 January in the team zone for a weekday in the first half of the previous year: accepted | REQ-004 | tests/invariants/REQ-004.sick-previous-year.spec.ts | origin: REQ-004 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-250 | behavior | REQ-005 | member | n/a | arm 5 must never happen: a person cancels their own pending request that has a weekday before today. Cases: run across the test clock; the refusal says the admin decides it | REQ-005 | tests/invariants/REQ-005.cancel-limits.spec.ts | origin: REQ-005 | proved-red: b3891d0bc8899f52e4d10e7b4048e07f155a735c
ROW-251 | behavior | REQ-011 | operator:admin | n/a | arm 6 must never happen: a change chosen to start next year changes the current year's allowance or days left, or does not change next year's, or does not change the allowance of the years after next year that no later change has set | REQ-011 | tests/invariants/REQ-011.allowance-years.spec.ts | origin: REQ-011 | proved-red: b500acc6e67286af92bf4ad165f1bb7994e837fb
ROW-252 | behavior | REQ-018 | operator:admin | n/a | arm 2 must never happen: an allowance or name change is stored without its old and new value | REQ-018 | tests/invariants/REQ-018.change-values.spec.ts | origin: REQ-018 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-253 | behavior | REQ-018 | operator:admin | n/a | arm 3 must never happen: an email change is stored with no record of who did it and when | REQ-018 | tests/invariants/REQ-018.change-records-who-and-when.spec.ts | origin: REQ-018 | proved-red: ff01734
ROW-254 | behavior | REQ-024 | operator:admin | n/a | arm 1 must never happen: two switched-on accounts hold the same display name, ignoring letter case and surrounding spaces. Cases: at create, at rename and at switch-on | REQ-024 | tests/invariants/REQ-024.display-name-unique.spec.ts | origin: REQ-024 | proved-red: 5256392dd2e0bcf95f36028a613dacf2e27a8e80
ROW-255 | behavior | REQ-024 | operator:admin | n/a | arm 2 must never happen: a name used only by a switched-off account is refused | REQ-024 | tests/invariants/REQ-024.display-name-unique.spec.ts | origin: REQ-024 | proved-red: 5256392dd2e0bcf95f36028a613dacf2e27a8e80
ROW-256 | behavior | REQ-025 | operator:admin | n/a | arm 1 must never happen: any of approve, reject, cancel approved days or switch off takes effect without a confirmation step | REQ-025 | tests/invariants/REQ-025.confirmation-step.spec.ts | origin: REQ-025 | proved-red: 5256392dd2e0bcf95f36028a613dacf2e27a8e80
ROW-257 | behavior | REQ-025 | operator:admin | n/a | arm 2 must never happen: the confirmation does not name the person, the days or what will change | REQ-025 | tests/invariants/REQ-025.confirmation-step.spec.ts | origin: REQ-025 | proved-red: 5256392dd2e0bcf95f36028a613dacf2e27a8e80
ROW-258 | behavior | REQ-025 | operator:admin | n/a | arm 3 must never happen: a cancel or switch-off confirmation does not say which days are cancelled and which stay | REQ-025 | tests/invariants/REQ-025.cancelled-and-staying-days.spec.ts | origin: REQ-025 | proved-red: 5256392dd2e0bcf95f36028a613dacf2e27a8e80
ROW-259 | behavior | REQ-025 | operator:admin | n/a | arm 4 must never happen: declining the confirmation changes anything | REQ-025 | tests/invariants/REQ-025.confirmation-step.spec.ts | origin: REQ-025 | proved-red: 5256392dd2e0bcf95f36028a613dacf2e27a8e80
ROW-260 | behavior | REQ-026 | member | n/a | arm 1 must never happen: a person signed in with a password the admin set reaches any page or action other than choosing a new password or signing out. Cases: after account creation and after a reset, through pages and direct addresses | REQ-026 | tests/invariants/REQ-026.forced-password-change.spec.ts | origin: REQ-026 | proved-red: 5256392dd2e0bcf95f36028a613dacf2e27a8e80
ROW-261 | behavior | REQ-026 | member | n/a | arm 2 must never happen: the new password may equal the one the admin set | REQ-026 | tests/invariants/REQ-026.forced-password-change.spec.ts | origin: REQ-026 | proved-red: 5256392dd2e0bcf95f36028a613dacf2e27a8e80
ROW-262 | behavior | REQ-026 | member | n/a | arm 3 must never happen: after choosing, the admin-set password still signs in | REQ-026 | tests/invariants/REQ-026.forced-password-change.spec.ts | origin: REQ-026 | proved-red: 5256392dd2e0bcf95f36028a613dacf2e27a8e80
ROW-263 | behavior | REQ-027 | operator:admin | n/a | arm 1 must never happen: the admin cannot change an account's email | REQ-027 | tests/invariants/REQ-027.change-email.spec.ts | origin: REQ-027 | proved-red: 5256392dd2e0bcf95f36028a613dacf2e27a8e80
ROW-264 | behavior | REQ-027 | operator:admin | n/a | arm 2 must never happen: the new email is accepted when another account holds it, ignoring letter case and surrounding spaces | REQ-027 | tests/invariants/REQ-027.change-email.spec.ts | origin: REQ-027 | proved-red: 5256392dd2e0bcf95f36028a613dacf2e27a8e80
ROW-265 | behavior | REQ-027 | operator:admin | n/a | arm 3 must never happen: after the change the old email still signs in or the new one does not | REQ-027 | tests/invariants/REQ-027.change-email.spec.ts | origin: REQ-027 | proved-red: 5256392dd2e0bcf95f36028a613dacf2e27a8e80
ROW-266 | behavior | REQ-027 | member | n/a | arm 4 must never happen: anyone but the admin changes an email | REQ-027 | tests/invariants/REQ-027.change-email.spec.ts | origin: REQ-027 | proved-red: 5256392dd2e0bcf95f36028a613dacf2e27a8e80
ROW-267 | behavior | REQ-028 | operator:admin | n/a | arm 1 must never happen: an allowance or name change is missing from the history | REQ-028 | tests/invariants/REQ-028.change-history.spec.ts | origin: REQ-028 | proved-red: 5256392dd2e0bcf95f36028a613dacf2e27a8e80
ROW-268 | behavior | REQ-028 | operator:admin | n/a | arm 2 must never happen: a listed change lacks its old value, new value, who or when | REQ-028 | tests/invariants/REQ-028.change-history.spec.ts | origin: REQ-028 | proved-red: 5256392dd2e0bcf95f36028a613dacf2e27a8e80
ROW-269 | behavior | REQ-028 | member | n/a | arm 3 must never happen: anyone but the admin sees the history, by a page or by any data sent to them | REQ-028 | tests/invariants/REQ-028.change-history.spec.ts | origin: REQ-028 | proved-red: 5256392dd2e0bcf95f36028a613dacf2e27a8e80
ROW-270 | behavior | member requests | member | n/a | As one member, cancelling or reading another member's request by its id through any member-callable address is refused, returns none of that member's data and changes nothing | INV-003, REQ-005, REQ-006 | tests/invariants/INV-003.other-members-request.spec.ts | origin: derivation 2026-11-24 | proved-red: 5256392dd2e0bcf95f36028a613dacf2e27a8e80
ROW-271 | behavior | REQ-011 | operator:admin | n/a | arm 7 must never happen: a change starting this year alters the allowance of a year after the current one that was set by a change starting next year made during the current year. Cases: a raise scheduled for next year survives a correction of this year, and once that year is current, it can itself be corrected | REQ-011 | tests/invariants/REQ-011.allowance-years.spec.ts | origin: REQ-011 | proved-red: b500acc6e67286af92bf4ad165f1bb7994e837fb
ROW-272 | behavior | REQ-018 | operator:admin | n/a | arm 4 must never happen: an allowance change is stored without the year it starts | REQ-018 | tests/invariants/REQ-018.change-values.spec.ts | origin: REQ-018 | proved-red: 9347562ac5c53a4f7b50929d5d3523ee5274a4c2
ROW-273 | behavior | REQ-025 | operator:admin | n/a | arm 5 must never happen: a confirmation is applied although its effect at the moment of confirming differs from what it showed. Cases: a cancel confirmation opened before midnight and confirmed after it, run across the test clock | REQ-025 | tests/invariants/REQ-025.cancelled-and-staying-days.spec.ts | origin: REQ-025 | proved-red: 5256392dd2e0bcf95f36028a613dacf2e27a8e80
ROW-274 | behavior | REQ-028 | operator:admin | n/a | arm 4 must never happen: a listed allowance change lacks the year it starts | REQ-028 | tests/invariants/REQ-028.change-history.spec.ts | origin: REQ-028 | proved-red: 5256392dd2e0bcf95f36028a613dacf2e27a8e80
ROW-275 | behavior | pending page | operator:admin | n/a | On the pending page, approve and reject each ask for the confirmation that names the person, the days and what will change, and nothing changes until it is confirmed | REQ-025 | tests/invariants/REQ-025.confirmation-pages.spec.ts | origin: REQ-025 | proved-red: 5256392dd2e0bcf95f36028a613dacf2e27a8e80
ROW-276 | behavior | person's requests page | operator:admin | n/a | On the person's requests page, cancelling approved days asks for the confirmation that names the person, the days cancelled and the days that stay, and nothing changes until it is confirmed | REQ-025 | tests/invariants/REQ-025.confirmation-pages.spec.ts | origin: REQ-025 | proved-red: 5256392dd2e0bcf95f36028a613dacf2e27a8e80
ROW-277 | behavior | people page | operator:admin | n/a | On the people page, switching an account off asks for the confirmation that names the person, the days that will be cancelled and those that stay, and nothing changes until it is confirmed | REQ-025 | tests/invariants/REQ-025.confirmation-pages.spec.ts | origin: REQ-025 | proved-red: 5256392dd2e0bcf95f36028a613dacf2e27a8e80
ROW-278 | behavior | REQ-011 | operator:admin | n/a | arm 8 must never happen: a change chosen to start this year does not change the allowance of a year after the current one that no change starting next year made during the current year has set. Cases: raise 25 to 28 starting this year; next year's allowance and days left become 28-based | REQ-011 | tests/invariants/REQ-011.allowance-years.spec.ts | origin: REQ-011 | proved-red: b500acc6e67286af92bf4ad165f1bb7994e837fb
ROW-279 | shell | /sign-in | anonymous | n/a | Signed out, the sign-in page shows an email field labelled Email, a password field labelled Password and a Sign in button, and no navigation to other pages | REQ-014 | tests/invariants/REQ-014.sign-in-form.spec.ts | origin: derivation 2026-11-24 | proved-red: f504e5a81aae6ed1b5fbe40b71017ba1ea3910b9
ROW-280 | reachability | / | member | n/a | Signed in as a team member who has chosen their own password, / is that person's own requests page: it loads inside the header and shows their requests, or a message that there are none with a way to send one | REQ-006 | tests/invariants/REQ-006.home-route.spec.ts | origin: derivation 2026-11-24 | proved-red: 576a0eb
ROW-281 | reachability | /requests/new | member | n/a | Signed in, /requests/new shows the send form: the kind (vacation or sick, nothing preselected), the first day and the last day, and a Send button | REQ-001 | tests/invariants/REQ-001.send-form-route.spec.ts | origin: derivation 2026-11-24 | proved-red: 576a0eb
ROW-282 | reachability | /calendar | member | n/a | Signed in, /calendar shows the month calendar of the team zone's current month | REQ-012 | tests/invariants/REQ-012.calendar-route.spec.ts | origin: derivation 2026-11-24 | proved-red: 576a0eb
ROW-283 | reachability | /password | member | n/a | Signed in, /password shows the form to change one's own password: the current password and the new password typed twice | REQ-015 | tests/invariants/REQ-015.password-route.spec.ts | origin: derivation 2026-11-24 | proved-red: 576a0eb
ROW-284 | reachability | /admin/pending | operator:admin | n/a | Signed in as the admin, /admin/pending shows the pending requests page | REQ-008 | tests/invariants/REQ-008.pending-route.spec.ts | origin: derivation 2026-11-24 | proved-red: 576a0eb
ROW-285 | reachability | /admin/people | operator:admin | n/a | Signed in as the admin, /admin/people shows the people page listing every account | REQ-020 | tests/invariants/REQ-020.people-route.spec.ts | origin: derivation 2026-11-24 | proved-red: 576a0eb
ROW-286 | reachability | /admin/people/:id | operator:admin | n/a | Signed in as the admin, /admin/people/:id shows that person's requests page, naming the person at its top | REQ-021 | tests/invariants/REQ-021.person-route.spec.ts | origin: derivation 2026-11-24 | proved-red: 576a0eb
ROW-287 | behavior | repeat submits | member | n/a | A double click, reload or Back after any submitted control other than the send-request form (Cancel on a person's own requests, the change-password form, the forced new-password choice, sign-in, the admin's confirmations and the people-page actions) never repeats the action and never shows a refusal of the user's own first submit | REQ-003, REQ-005, REQ-009, REQ-014, REQ-015, REQ-020, REQ-025, REQ-026 | owed: owner-decision — OQ-11 the double-submit rule's reach beyond the send-request form, left as a known limit by A-050 | origin: A-050
rule | RULE-001 | Every days-left, pending or forecast figure the product renders or returns is computed by the one balance function of the requests module; the extractor lists every route and page site that renders or returns such a figure, whatever its name, and the sites that take it from that function | checks/extractors/invariant.balance-sites.sh | 0 | tests/invariants/RULE-001.every-figure-is-the-one-balance.spec.ts | proved-red: 9ac19a8
rule | RULE-002 | No response or server-rendered page sent to a non-admin viewer carries another person's kind of absence under any name or shape; the extractor lists every server route and page whose response reaches a non-admin, and the ledger test asserts over each one's actual response | checks/extractors/invariant.member-responses.sh | 0 | tests/invariants/RULE-002.no-colleagues-kind-in-any-answer.spec.ts | proved-red: 9ac19a8
rule | RULE-003 | Every server route that calls any operation of the accounts or requests modules not marked member-callable (deny by default: approve, reject, admin cancel, list pending, the forecast, set allowance, create, rename, set password, change email, switch, list people, another person's requests, a person's change history), wherever it lives, checks the admin before the operation runs | checks/extractors/invariant.admin-guard.sh | 0 | tests/invariants/RULE-003.admin-operations-refuse-non-admins.spec.ts | proved-red: 9ac19a8
rule | RULE-004 | state-machine request.state: pending pending>approved pending>rejected pending>cancelled approved>cancelled | checks/extractors/state-machine.request-state.sh | 1 | tests/invariants/RULE-004.request-state-moves-only-along-the-table.spec.ts | proved-red: 3431106
rule | RULE-005 | Every read of the current time or date in server code, database defaults and queries goes through the one team clock of the accounts module; no other site reads the system clock | checks/extractors/invariant.clock-reads.sh | 1 | tests/invariants/RULE-005.every-today-and-instant-is-the-team-clock.spec.ts | proved-red: 3431106
difference | DIF-001 | the clock source | an instant injected by the test harness, honoured only in the test profile | the system clock read in the team time zone | the injected instant is read through the same team clock every decision uses, so every today rule is exercised at chosen instants; a production start with the override set refuses to start
exception | EXC-001 | product | seam | the harness's own product service, reached by the tests over the test network at http://product:3000, not an outbound call to an outside service (owner ruling 2026-11-24; ViD finding F-1)
hostility | HOS-001 | Through the send-request form, send a vacation request for one more counted day than the allowance minus approved and pending days of its year, and expect it refused with no request stored. The setup has nonzero approved and nonzero pending vacation in the request's year, and a variant whose request is next year with the current year used up; the refusal's figures match the request's year | protects: REQ-002 | disable: remove the balance check from the send path | tests/invariants/HOS-001.REQ-002.one-day-over-refused-nothing-stored.spec.ts | proved-red: 7e7d9c3
hostility | HOS-002 | Through the send-request form, send a vacation request for exactly the days left minus pending, and expect it accepted pending. The setup has nonzero approved and nonzero pending vacation in the request's year, and a variant whose request is next year with the current year used up; the refusal's figures match the request's year | protects: REQ-002 | disable: make the balance check refuse at equality | tests/invariants/HOS-002.REQ-002.exactly-the-room-accepted-pending.spec.ts | proved-red: e3779a6
hostility | HOS-003 | Through the send-request form, send a vacation request that is refused for lack of days, and expect the refusal to show that year's days left and pending days. The setup has nonzero approved and nonzero pending vacation in the request's year, and a variant whose request is next year with the current year used up; the refusal's figures match the request's year | protects: REQ-002 | disable: drop the figures from the refusal | tests/invariants/HOS-003.REQ-002.refusal-shows-the-years-figures.spec.ts | proved-red: 7e7d9c3
hostility | HOS-004 | Through the send-request form, with zero vacation days left, send a sick request and expect it accepted with days left unchanged. Then approve the sick request: days left and that year's pending vacation days stay unchanged on the person's page and on the people page | protects: REQ-002 | disable: apply the balance check to sick requests | tests/invariants/HOS-004.REQ-002.sick-with-no-days-left.spec.ts | proved-red: 7e7d9c3
hostility | HOS-005 | Through the send-request form, send two vacation requests at the same moment that each fit the days left but together exceed them, and expect exactly one stored | protects: REQ-002 | disable: move the balance read outside the write transaction with an await before the insert, using a test hook that pauses between the read and the insert | tests/invariants/HOS-005.REQ-002.simultaneous-form-sends.spec.ts | proved-red: e3779a6
hostility | HOS-006 | Without signing in, request every page and every API address with and without a forged session cookie, and expect no page content, no data and no change | protects: REQ-014 | disable: skip the session check on one route | tests/invariants/HOS-006.REQ-014.no-session-or-forged-cookie.spec.ts | proved-red: aa94f0f
hostility | HOS-007 | Through the sign-in form, sign in with a correct email and a wrong password, and expect no session | protects: REQ-014 | disable: skip the password comparison | tests/invariants/HOS-007.REQ-014.sign-in-form-wrong-password.spec.ts | proved-red: aa94f0f
hostility | HOS-008 | Through the sign-in form, sign in as a switched-off account with its correct password, and expect no session | protects: REQ-014 | disable: skip the switched-on check at sign-in | tests/invariants/HOS-008.REQ-014.sign-in-form-switched-off-account.spec.ts | proved-red: e3c6940
hostility | HOS-009 | Hold a signed-in session of an account, have the admin switch the account off, then use the session, and expect it refused | protects: REQ-014 | disable: leave sessions alive on switch-off | tests/invariants/HOS-009.REQ-014.session-ends-at-switch-off.spec.ts | proved-red: 4e8dacf
hostility | HOS-010 | Sign out, then replay the old session cookie, and expect it refused | protects: REQ-014 | disable: leave the session row on sign-out | tests/invariants/HOS-010.REQ-014.replayed-cookie-after-sign-out.spec.ts | proved-red: aa94f0f
hostility | HOS-011 | Through approve, reject, cancel, allowance change and switch-off on two accounts, compare every days-left figure on every page with the allowance minus counted days in effect of approved vacation, and expect them equal | protects: RULE-001 | disable: compute one page's figure without subtracting cancelled days | tests/invariants/HOS-011.RULE-001.days-left-equal-on-every-page.spec.ts | proved-red: aa94f0f
hostility | HOS-012 | As a team member, fetch the calendar and every API address the app calls, and expect no other person's kind of absence anywhere in the responses. Two fixtures differing only in one colleague's kind give identical page HTML, embedded page data and API responses for a member once ids and timestamps are masked | protects: RULE-002 | disable: include the kind in the calendar response | tests/invariants/HOS-012.RULE-002.member-responses-kind-blind.spec.ts | proved-red: aa94f0f
hostility | HOS-013 | As a team member with a valid session, call each admin action and another person's request and allowance addresses directly, and expect each refused with nothing changed | protects: RULE-003 | disable: remove the admin check from one admin route | tests/invariants/HOS-013.RULE-003.member-refused-admin-acts.spec.ts | proved-red: aa94f0f
```
