# Modules Convention

This directory is intentionally empty in this milestone. It documents the
layout that the business modules (`auth`, `tickets`, `assets`, `comments`,
`diagnostics`) will follow when they are implemented in the next milestone.

## Layering

Each module is organized by **layer**, mirroring `docs/plan-mesa-ayuda-ti.md`
§5. A module directory will look like:

```
src/modules/<name>/
  routes.js       Express router: wires HTTP verbs/paths to controller
                   functions. No business logic here.
  controller.js    Translates HTTP request/response to/from service calls.
                   Extracts params/body, calls the service, shapes the
                   response. No direct DB access.
  service.js       Business logic and orchestration. Calls the repository
                   for persistence. Framework-agnostic (no req/res).
  repository.js    Only place that talks to the database (via the shared
                   Knex instance from src/db/connection.js). All queries are
                   parameterized / built with Knex's query builder — never
                   string-concatenated (mitigates VULN-001, SQL Injection).
  validators.js    Zod schemas used with core/middleware/validate.js to
                   validate request body/params/query before it reaches the
                   controller.
```

## Rules for the next milestone

- **Ownership checks belong in the service layer.** Any resource fetched by
  id (a ticket, an asset) must be checked against the requesting user
  (unless the user is `admin`/`agent`, per the endpoint's rules) before it is
  returned or mutated — this is the IDOR mitigation for VULN-004. Return the
  same generic 404 whether the resource does not exist or the caller is not
  its owner, so the two cases are indistinguishable to an attacker probing
  ids.
- **Role checks belong in `routes.js`,** applied via
  `core/middleware/authorize.js`, so it is obvious from the route
  declaration alone which roles can reach a given endpoint (mitigates
  VULN-014, missing RBAC on admin routes).
- **Repositories never build SQL by string concatenation.** Use Knex's query
  builder (or parameterized raw queries with `?` bindings) exclusively.
- **Controllers stay thin.** No query building, no business rules — just
  request/response shaping and calling the service.
- **No module reaches into another module's repository directly.** If
  `tickets` needs asset data, it goes through `assets`'s service, not its
  repository.

## Deliberately out of scope for this milestone

- `auth`, `tickets`, `assets`, `comments`, `diagnostics` — no routes,
  controllers, services, repositories, or validators exist yet for these.
- File upload handling (ticket attachments) and the diagnostics
  ping/health-check tooling are part of this same future milestone.
