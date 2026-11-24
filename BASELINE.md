# TimeAway — BASELINE

One page: what the stack IS, what it is NOT, and the rows that must never break.

## Stack

| Layer | Choice | FORBIDDEN alternatives (named) |
|---|---|---|
| Runtime | Node.js 22 LTS | Bun, Deno |
| Web framework | Nuxt 4 (Vue 3 pages, Nitro server routes, one package) | React, Next.js, Angular, SvelteKit; a separate Express or Fastify API server |
| Language | TypeScript, strict | plain JavaScript for application code |
| Database | SQLite, one file, through better-sqlite3 | PostgreSQL, MySQL, MongoDB, any hosted database |
| Data access and migrations | Drizzle ORM with drizzle-kit migrations | Prisma, TypeORM, Sequelize, Knex, hand-run SQL files |
| Sessions | server-side session rows in SQLite, referenced by an httpOnly cookie | JWT or any stateless signed-cookie session (cannot be ended at once) |
| Password storage | scrypt from node:crypto | bcrypt packages, any reversible storage |
| Styling | plain CSS in Vue single-file components | Tailwind, Vuetify, Element Plus or any component library |
| Tests | Vitest (domain and API), Playwright (browser), run in Docker | Jest, Cypress |
| Package manager | pnpm | npm, yarn |

## Module seams & data ownership

The seam table lives in ARCHITECTURE.md. Ownership law: each table/data store
is written by exactly one module; everyone else goes through that module's
public surface.

## Tier-0 rows

| Rule | Meaning |
|---|---|
| No overdraw (REQ-002) | A vacation request is never accepted when its counted days exceed the allowance minus that year's approved and pending vacation days, even when two are sent at the same moment; sick requests never touch the allowance. |
| Balance always right (INV-001) | Every days-left figure shown anywhere equals the year's allowance minus the counted days in effect of approved vacation requests, after every action that touches it. |
| Kind never leaks (INV-002) | Whether an absence is vacation or sick never appears on a page, or in data sent to a browser, of anyone but the admin and that person. |
| Signed in, or nothing (REQ-014) | No page content, data or action without a signed-in session; a switched-off account cannot sign in and its sessions end at once. |
| Admin-only actions (INV-003) | Only the admin decides requests, cancels approved time, sets allowances and runs accounts; a person acts on and sees only their own requests, plus the calendar's away entries; a refused attempt changes nothing. |

## Test environment

The ledger runs ONLY inside Docker: `sh checks/test.sh` → docker compose -f
docker-compose.test.yml. No test process ever receives real credentials.

Time is controlled: the harness sets the current instant through a test-only
clock override that the team clock of the accounts module honours only in the
test profile (INVENTORY.md DIF-001); a production start with the override set
refuses to start. Tests that turn on today run with the team zone set far
from the container's zone, at instants where the two dates differ.

## Owner hints (verbatim)

- Design: none given
- Architecture/stack: A simple web app using vue and sqlite

## Machine blocks

Parsed by checks/conformance.sh at every commit. Extensions space- or
newline-separated. Forbidden terms one per line: dependency/import names that
must never appear in staged source additions — pick tokens that will not
legitimately occur in code or config otherwise. Prisma, mysql2 and Knex are matched as a
quoted package.json dependency or a code import only, since the lockfile lists them as optional
companions of Drizzle that are never installed (D-029).

```vid-allowed-extensions
.md .yml .yaml .sh .ts .vue .js .mjs .cjs .json .css .svg .ico .png .sql .txt .html .gitignore .gitattributes .nvmrc .npmrc .dockerignore
```

```vid-forbidden
react-dom
next/router
next/link
@angular
sveltekit
"prisma"
"@prisma/
from 'prisma'
from '@prisma/
typeorm
sequelize
mongoose
"mysql2"
from 'mysql2'
"knex"
from 'knex'
jsonwebtoken
nodemailer
tailwindcss
vuetify
element-plus
cypress
```
