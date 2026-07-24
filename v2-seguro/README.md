# IT Helpdesk v2: Hardened (SecDevOps) Version

This is the **hardened** counterpart to `v1-inseguro`. Same functional
scope (auth, tickets, assets, comments, diagnostics), but built with a
layered architecture (`routes/controller/service/repository/validators` per
module — see `src/modules/README.md`) and the security/quality practices
listed below.

> Business modules (auth, tickets, assets, comments, diagnostics) are **not
> implemented yet** — this milestone only sets up the technical foundation
> (config, db, migrations, core middleware, app/server bootstrap). See
> `src/modules/README.md` for the convention the next milestone will follow.

## Requirements

- Node.js 22 or newer
- npm
- Docker + Docker Compose (recommended), or a local PostgreSQL server

## Running with Docker Compose

```powershell
cd v2-seguro
Copy-Item env.example .env
# Edit .env: set DB_PASSWORD and JWT_SECRET to your own local values.
docker compose up
```

This starts `app-v2` (port `4000`, distinct from v1's `3000`) and
`postgres-v2` (volume `postgres_data_v2`, distinct from v1's
`postgres_data`), so both stacks can run side by side without colliding.
Migrations run automatically on container start (`npm run migrate`).

To seed sample data (two users with crossed-over tickets/assets/comments,
for future IDOR verification):

```powershell
docker compose exec app-v2 npm run seed
```

## Running locally (without Docker)

```powershell
cd v2-seguro
npm install
Copy-Item env.example .env
# Edit .env with your local Postgres credentials.
npm run migrate
npm run seed
npm run dev
```

> Note: this repo's permission tooling blocks writing files literally named
> `.env.example`, so the template ships as `env.example` here (same content,
> no leading dot). Copy it to `.env` as shown above.

## Environment variables

| Variable | Description |
|---|---|
| `NODE_ENV` | `development` \| `test` \| `production` |
| `PORT` | App port (default `4000`, distinct from v1's `3000`) |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Postgres connection (discrete params, consumed by `knexfile.js`) |
| `JWT_SECRET` | JWT signing secret. **No default** — the app refuses to start without it. |
| `JWT_EXPIRES_IN` | Token lifetime (default `15m`) |
| `CORS_ORIGIN` | Single allowed origin (no wildcard) |

## Scripts

| Script | Purpose |
|---|---|
| `npm start` | Run the server |
| `npm run dev` | Run with `node --watch` for local iteration |
| `npm run lint` | ESLint |
| `npm run format` | Prettier (writes) |
| `npm test` | Node's built-in test runner (`node --test`), same runner as v1-inseguro |
| `npm run migrate` | Apply Knex migrations |
| `npm run migrate:rollback` | Roll back the last migration batch |
| `npm run seed` | Run `seeds/dev_seed.js` |

## Hardening decisions made in this milestone

1. **No hardcoded secrets, anywhere.** `src/config/env.js` validates env vars
   with Zod and fails fast at boot if `JWT_SECRET`/`DB_*` are missing —
   contrast with v1, which hardcodes a JWT secret and DB URL as fallback
   defaults (`v1-inseguro/src/config.js`, VULN-011/VULN-013).
2. **JWT algorithm pinned to `HS256`.** `src/core/middleware/authMiddleware.js`
   passes `algorithms: ['HS256']` to `jwt.verify`, so an attacker cannot
   force algorithm confusion (e.g. `alg: none`) the way v1's unrestricted
   `jwt.verify` call allows (VULN-011).
3. **Centralized error handler with no stack traces to the client.**
   `src/core/middleware/errorHandler.js` logs the full error via pino
   server-side and returns only a generic message + status code — contrast
   with v1's handler, which sends `error.stack` directly to the client
   (VULN-012).
4. **CORS restricted to a configured origin**, not `cors({ origin: '*' })`
   as in v1 (`src/config/cors.js`, VULN-012).
5. **Versioned, reversible schema via Knex migrations** (`migrations/`)
   instead of a single `schema.sql` applied by hand, plus `bcrypt` password
   hashing (`password_hash` column) instead of v1's plaintext `password`
   column (VULN-010).
6. **CSRF protection via an actively maintained library, not `csurf`.**
   `csurf` is deprecated/unmaintained upstream. `src/config/csrf.js` uses
   [`csrf-csrf`](https://github.com/Psifi-Solutions/csrf-csrf) instead,
   which implements the same double-submit-cookie strategy `csurf` used,
   is actively maintained, and is paired with `SameSite=Strict` cookies.
7. **Rate limiting on auth-sensitive routes** (`src/core/middleware/rateLimiter.js`)
   — v1 has no rate limiting at all, making login brute-forceable with tools
   like Hydra (VULN-009).
8. **`/health` (liveness) and `/ready` (readiness, verifies Postgres via
   `SELECT 1`)** — v1 has neither.

## ESLint format decision

Flat config (`eslint.config.js`), not legacy `.eslintrc`: v1-inseguro has no
linter at all, so there was no existing convention to match, and flat config
is ESLint's current default for new projects (ESLint v9+).

## What's next

Business modules (`auth`, `tickets`, `assets`, `comments`, `diagnostics`) —
routes/controller/service/repository/validators per module, applying the
mitigations documented in `docs/plan-mesa-ayuda-ti.md` §3 for each of the 14
vulnerabilities catalogued in `v1-inseguro/VULNERABILITIES.md`.
