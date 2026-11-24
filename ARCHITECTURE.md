# TimeAway — ARCHITECTURE

The seam table. One row per module. Updated in the same commit as any seam
change (law in CLAUDE.md). This table is EXECUTED, not descriptive: it is the
import court's rule source (checks/imports.sh reads it at every commit). A
module with no row cannot be imported; a row that lies fails the build.

Import court: enforce

## Column contract (machine-read — keep the shapes exact)

- **Module** — the module's repo path (`apps/web`, `packages/core/alerts`);
  `/src/` segments in real file paths are collapsed when matching, so
  `packages/core/alerts` also owns `packages/core/src/alerts/`. Django-style
  dotted labels (`apps.public`) are accepted and read as paths.
- **Public surface** — leads with the module's import specifier(s) in
  backticks; prose may follow. Importing any path DEEPER than a declared
  specifier is a violation — declare an entry point per module, not one
  barrel for the world. A row with no backticked specifier can only be
  reached by its own files.
- **Dependents** — comma-separated Module paths that may import this module,
  or `all`, or `none`. Direction law is encoded here: app-layer rows say
  `none` (nothing imports the app), so core reaching into app is rejected as
  an undeclared dependent. Relative imports that cross module paths are
  always violations — enter a module through its specifier.

| Module | Responsibility | Owned tables/data | Public surface | Dependents |
|---|---|---|---|---|
| server/db | The SQLite connection, the Drizzle schema and the migrations; nothing else touches the database file directly | the database file, the migration history | `~~/server/db` — the database handle, the schema and a transaction helper | server/domain/accounts, server/domain/requests, tests/invariants |
| server/domain/accounts | Accounts, sign-in, sessions, passwords, display names, the allowance in force per calendar year, switching accounts on and off, the admin marker and the team time zone; records who changed what and when | accounts, account_allowances, sessions, account_events, settings | `~~/server/domain/accounts` — create, rename, set and change password, sign in and out, session lookup, set allowance, allowance for a year, switch on and off, list accounts, today in the team time zone | server/domain/requests, server/api, tests/invariants |
| server/domain/requests | Requests and their states, day counting, the balance check, overlap, pending cancel, decisions, the admin's cancel and partial cancel, the cancels caused by switching an account off, days left per year, and the calendar's read of approved days | requests | `~~/server/domain/requests` — send, cancel own, approve, reject, admin cancel, switch an account off with its request effects, list own, list a person's, list pending, days left, month calendar | server/api, tests/invariants |
| server/api | The HTTP routes: the signed-in check on every route, the admin check on admin routes, and the shaping of every response so another person's kind of absence is never sent | none | `~~/server/api` — routes only; nothing imports them | none |
| app | The Vue pages and components: sign-in, my requests and days left, send a request, the month calendar, and the admin's pending, people and person pages | none | no import surface; it talks to the server over HTTP only | none |

Laws:

- A module without a row here should not be committed to — add the row in the
  same commit.
- Cross-module access goes through the public-surface column only; reaching
  into another module's tables or internals is a defect — and, since v0.6, a
  rejected commit.
- The dependents column is the blast-radius map: a fix in module X re-grades
  X plus its declared dependents, not the whole product (/vid fix law).

External boundaries: none. The product sends no email and has no
integrations (PRD NG-001, NG-007); it runs on the owner's machine with no
outside service, so no provider seam row is owed.

## Where it runs

<!-- v0.26.10.8 (R4): the owner's answers at init (vid-staging-setup Part 1),
     one `key: value` line each — never a table, so the seam table's readers
     never see it, and NEVER a credential. access: and dns-access: take only
     `cli-login <platform>` (the word equal to platform:), `env <NAME>` (a
     variable the owner keeps outside the repository, by its name) or `none`;
     the pre-commit hook refuses any other shape. A later answer updates its
     key in place, in a commit citing the owner's answer. -->

```vid-hosting
platform: local
region: none
staging: none
production: none
sending: none
spend-cap: none
access: none
dns-access: none
owner-only: choosing a hosting platform, later
providers: none
```
