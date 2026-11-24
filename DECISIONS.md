# TimeAway — DECISIONS

Append-only, except labels and replaced-by marks. One line per decision.
Trigger (law in CLAUDE.md): the choice picked between plausible
alternatives, constrains future code, or would surprise a competent
newcomer. Entries without an `| enforced:` ref, or without a label, are
rejected at commit.

Format:

    - **D-NNN** <what> | why: <why> | enforced: <test/hook ref, or "convention"> | applies-to: <ids and codes> [| origin: proposal] [| model: <id>]
    - **D-NNN** <what> | why: <why> | enforced: <test/hook ref, or "convention"> | scope: project [| origin: proposal] [| model: <id>]

`why:` gives the reason in ViD's own words and cites the answer it rests
on (`A-NNN`), never the owner's words, which stay in the commit's `Owner:`
trailer (vid-create-prd, "The owner's words, and the questions raised").

The label says where a brief quotes the decision. `applies-to:` items,
comma separated: ROW, RULE or REQ ids of INVENTORY.md; screen codes (the
part before `/` of an INVENTORY marker); DIF ids, when rows carry a
`divergence:` field; module ids of ARCHITECTURE.md's module table (its
Module column, a dotted label read as a path). A decision that bears on
one module, or a few, names them beside its row, requirement or screen
items, never instead of them: a module item reaches only the briefs of
builders whose step names the module, and graders, test authors and
fixers join by rows. `scope: project` only when it bears on many areas.

A line a later decision replaces, whole or in part, is marked, and only
marked: `| replaced-by: D-NNN[, D-MMM]` in its rule part, right before
` | why:`, ids in the order added. Where the lines differ, the named lines
win; the old line's words stay as written, and wherever it is quoted the
lines it names follow it. A commit may change a line's label, or add its
`replaced-by:` mark, or add a D-id to the mark it has, keeping the ids
already there, and nothing else; that is the one edit this file allows.

`origin: proposal` marks defaults the model chose when the owner skipped a
hint or delegated the choice. `model:` is optional (§9 model-change
durability): record it when the deciding model differs from the project's
usual one, so a later model can see what it inherits.

`origin: dev-side` marks a decision the dev side made in ticket mode,
recorded by ViD in the dev side's words from a merged pull request's
Decisions section (`enforced: ticket <n>`) or a deploy report's
`decision:` lines (`enforced: deploy <id>`, `scope: project`).

## Log

- **D-001** The web framework is Nuxt 4: Vue 3 pages and Nitro server routes in one TypeScript package, on Node.js 22 LTS with pnpm | why: the owner's stack hint names Vue and a simple web app; a convention-heavy full-stack Vue framework gives routing, server routes and the build in one package, where a hand-rolled API server beside Vue costs several times the code per requirement | enforced: BASELINE.md vid-forbidden | scope: project | origin: proposal
- **D-002** Storage is one SQLite file through better-sqlite3, with Drizzle ORM and drizzle-kit migrations owned by server/db | why: the owner's stack hint names SQLite; Drizzle keeps the schema typed and the migrations versioned | enforced: BASELINE.md vid-forbidden | scope: project | origin: proposal
- **D-003** Sessions are server-side rows in SQLite, referenced by an httpOnly cookie, never stateless signed tokens | why: switching an account off, signing out and setting a password must end sessions at once (REQ-014, REQ-015, A-034), which a stateless token cannot do | enforced: convention | scope: project
- **D-004** Passwords are stored as scrypt hashes from node:crypto | why: a password must never be stored readable; scrypt ships with Node and needs no native package | enforced: convention | scope: project
- **D-005** Sending a vacation request checks the balance and inserts the row inside one SQLite write transaction taken immediately, so two requests sent at the same moment cannot both pass | why: REQ-002's fifth failure clause forbids overdraw by simultaneous sends | enforced: convention | scope: project
- **D-006** Every API response is shaped on the server per viewer: the calendar sends names and days only, and the kind of absence is sent only to the admin and to that person | replaced-by: D-027 | why: INV-002 forbids sending another person's kind to a browser, not only showing it | enforced: convention | scope: project
- **D-007** Dates are calendar dates (YYYY-MM-DD) in the team's one time zone, set at setup; today is computed on the server, never in the browser | why: REQ-004 and CON-003 decide today in the team time zone at the moment of sending | enforced: convention | scope: project
- **D-008** The product runs locally on the owner's machine for now; no hosting platform, addresses, access or spend cap yet, and hosting is chosen later | why: the owner's answer at the technical sitting | enforced: ARCHITECTURE.md vid-hosting | scope: project
- **D-009** A release that changes the stored data has no downtime: migrations are additive and backward compatible (expand, then contract in a later release), applied while the app runs | why: the owner's answer at the technical sitting | enforced: convention | scope: project
- **D-010** Visual design is plain and default: one small set of CSS variables, the system font, no component library, readable tables and forms | why: the owner gave no design hint and asked for no design pass | enforced: BASELINE.md vid-forbidden | scope: project | origin: proposal
- **D-011** The one admin account and the team time zone are created by a one-time setup command run on the machine, before anyone signs in; there is no setup page | why: CON-001 and A-013 make the admin exist from setup, and NG-010 rules out self sign-up | enforced: convention | scope: project
- **D-012** Tests run with Vitest for the domain and API and Playwright for the browser, inside Docker through checks/test.sh | why: one runner per layer, matching the stack | enforced: BASELINE.md vid-forbidden | scope: project | origin: proposal
- **D-013** The team time zone is chosen once at setup as a named zone and cannot be changed inside the product | why: every stored day and every today decision rests on it (CON-003); a later change would reinterpret history | enforced: convention | scope: project
- **D-014** A password is at least 8 characters, is never blank, and a new password is typed twice; it is compared exactly as typed | why: a builder setting the record leaves open; it prevents blank and mistyped passwords without changing any product outcome | enforced: convention | scope: project | origin: proposal
- **D-015** A display name is 1 to 60 characters after trimming | why: a builder setting; keeps the calendar and lists readable at phone width | enforced: convention | scope: project | origin: proposal
- **D-016** An allowance is a whole number from 0 to 260, the weekdays in a year rounded | why: a builder setting that catches a typed 250 for 25 without limiting any real allowance | enforced: convention | scope: project | origin: proposal
- **D-017** A session ends after 30 days without use; refused attempts are not recorded; setting another person's password does not ask for the admin's own password; switching an account back on keeps its old password | replaced-by: D-026 | why: builder settings the record leaves open, chosen for the simplest behaviour for a local team tool | enforced: convention | scope: project | origin: proposal
- **D-018** Admin routes live under server/api/admin/ and every one checks the admin first; this is the census RULE-003 reads | why: RULE-003 enumerates admin routes by their folder | enforced: INVENTORY.md RULE-003 | scope: project
- **D-019** An allowance is stored as a list of changes, each with the year it starts from; the allowance for a year is the latest change starting at or before it, so nothing is created when a year begins and no read writes | replaced-by: D-025 | why: per-year allowances (REQ-023) without a New Year job that a local app has no scheduler to run | enforced: convention | scope: project
- **D-020** A whole cancel (a person's own pending cancel, a full admin cancel, a switch-off cancel) records who and when but no cancel day; only a partial cancel records the weekday it takes effect from | why: a cancel day outside a request's range has no meaning, and the record rules must hold for a weekend cancel of a past pending request | enforced: convention | scope: project
- **D-021** Run budget: stacks=1 (one test stack at a time) | why: ViD's default for a project of this size | enforced: .vid/budget | scope: project | about: vid-settings | origin: proposal
- **D-022** Run budget: memory-headroom-mb=6144, a quarter of this machine's memory | why: ViD's default, sized from the machine | enforced: .vid/budget | scope: project | about: vid-settings | origin: proposal
- **D-023** Run budget: claims-per-slice=60 and wall-hours-per-slice=8 | why: ViD's defaults for a build slice | enforced: .vid/budget | scope: project | about: vid-settings | origin: proposal
- **D-024** Run budget: court-seconds=300 and builder-context-tokens=400000 | why: ViD's defaults for the commit courts and a builder's context | enforced: .vid/budget | scope: project | about: vid-settings | origin: proposal
- **D-025** An allowance is stored as a list of changes, each with the year it starts from and when it was made; the allowance for a year is, among the changes starting at or before that year, the one with the latest starting year, and among those the most recently made; a change starting this year also gives later years that value, except a year set by a change starting next year made during the current year | why: the exact rule REQ-011 (A-043, A-046, A-047) needs; "latest change" alone would lose a scheduled next-year raise | enforced: convention | applies-to: REQ-011, REQ-023 | origin: proposal
- **D-026** Wrong-password attempts are counted per normalised submitted email, whether or not an account exists: after 5 wrong attempts within 15 minutes, sign-in and the current-password check for that email answer with a wait of 15 minutes, never a permanent lock; refused attempts are recorded only for this count | why: a builder setting with numbers for the bound the test list keeps; it supersedes D-017's "refused attempts are not recorded" | enforced: convention | applies-to: REQ-014, REQ-015 | origin: proposal
- **D-027** Every API response is shaped on the server per viewer: the calendar sends, for each away entry, the display name, an optional opaque account id and the days, nothing else; the kind of absence is sent only to the admin and to that person | why: INV-002 forbids sending another person's kind to a browser; an opaque id lets two entries with the same name stay apart (REQ-012, REQ-024) | enforced: convention | applies-to: RULE-002, REQ-012, ROW-105, ROW-173, ROW-174, ROW-175, ROW-176, server/api | origin: proposal
- **D-028** The banned-package check matches Prisma, mysql2 and Knex as a quoted package.json dependency or a code import only, not any mention; every other ban is unchanged | why: the owner ruled it (2026-11-24): the lockfile lists them as optional companions of Drizzle that are never installed, and the bans must still stop any real use | enforced: BASELINE.md vid-forbidden | applies-to: server/db
