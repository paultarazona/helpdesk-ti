# TDD Evidence: v1 Infrastructure

## Source Plan

Derived from `docs/plan-mesa-ayuda-ti.md` and GitHub issue #1.

## User Journey

As a local lab operator, I want the v1 application to render its security notice so that I can confirm the server-side application starts before feature modules are added.

## Evidence

| Guarantee | Test | RED | GREEN |
| --- | --- | --- | --- |
| `GET /` renders the lab name and local-only notice | `v1-inseguro/test/app.test.js` | `npm test` failed because `src/app.js` did not exist | `npm test` passed: 2 tests, 0 failures |
| v1 returns stack traces for malformed JSON | `v1-inseguro/test/app.test.js` | Not applicable: behavior was covered while completing the GREEN implementation | `npm run test:coverage` passed with 100% line, branch, and function coverage for `src/app.js` |

## Coverage And Gaps

The foundation has two route-level tests. Docker Compose was not executed because the `docker` command is unavailable in this development environment. Compose startup and PostgreSQL healthcheck remain to be verified on a machine with Docker installed.
