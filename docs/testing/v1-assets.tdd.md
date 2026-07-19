# TDD Evidence: v1 Assets

## Source Plan

Derived from `docs/plan-mesa-ayuda-ti.md` and GitHub issue #5.

## User Journeys

- An authenticated user creates, lists, views, edits, and deletes assets.
- A user searches inventory by name or IP through the v1 SQL-concatenated query path.
- A user can access another user's asset by changing its ID, and asset details show their related tickets.

## Evidence

| Guarantee | Test | RED | GREEN |
| --- | --- | --- | --- |
| Name/IP search concatenates supplied input into SQL | `v1-inseguro/test/assets.test.js` | `Cannot find module '../src/modules/assets/routes'` | The generated query includes name/IP clauses and the supplied injection payload |
| Asset creation records assignment and authenticated creator | `v1-inseguro/test/assets.test.js` | Asset module missing | The insert receives the submitted assignment and request user ID |
| Detail exposes related tickets without ownership scoping | `v1-inseguro/test/assets.test.js` | Asset module missing | The detail query selects by supplied ID and renders linked tickets |
| Edit and delete operate on arbitrary supplied IDs | `v1-inseguro/test/assets.test.js` | Asset module missing | Update and delete have no ownership condition |
| Every asset database failure reaches the error handler | `v1-inseguro/test/assets.test.js` | Not applicable | Seven route paths return the controlled database error response |

## Coverage And Gaps

`npm test` passed 23 tests. `npm run test:coverage` passed 23 tests with 98.24% line, 97.30% branch, and 93.55% function coverage globally; `src/modules/assets/routes.js` is 100% covered. PostgreSQL-backed flows remain pending Docker validation because Docker is unavailable in this environment; route tests use a controlled database double.
