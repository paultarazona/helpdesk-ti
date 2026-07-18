# TDD Evidence: v1 Database Bootstrap

## Source Plan

Derived from `docs/plan-mesa-ayuda-ti.md` and GitHub issue #2.

## User Journey

As a local lab operator, I want a reproducible helpdesk schema and cross-user seed data so that later modules can demonstrate ownership and access-control failures.

## Evidence

| Guarantee | Test | RED | GREEN |
| --- | --- | --- | --- |
| The schema defines users, assets, tickets, comments, attachments, and their foreign keys | `v1-inseguro/test/database-files.test.js` | `npm test` failed because `schema.sql` did not exist | `npm run test:coverage` passed with the schema contract |
| The seed includes two regular users, agent/admin roles, cross-user tickets, and plaintext passwords | `v1-inseguro/test/database-files.test.js` | `npm test` failed because `seed.sql` did not exist | `npm run test:coverage` passed with the seed contract |

## Coverage And Gaps

`npm run test:coverage` passed 4 tests. Docker is unavailable in this environment, so PostgreSQL has not executed the SQL files. The Compose mount initializes them only for a new database volume; validate with `docker compose up --build` on a machine with Docker before closing the issue.
