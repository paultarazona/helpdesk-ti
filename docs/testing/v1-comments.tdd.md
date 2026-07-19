# TDD Evidence: v1 Comments

## Source Plan

Derived from `docs/plan-mesa-ayuda-ti.md` and GitHub issue #6.

## User Journeys

- An authenticated user adds a comment to a ticket.
- The comment is persisted with the ticket and authenticated author.
- Other ticket viewers receive the stored comment body without output escaping.

## Evidence

| Guarantee | Test | RED | GREEN |
| --- | --- | --- | --- |
| Authenticated users can persist ticket comments | `v1-inseguro/test/comments.test.js` | `Cannot find module '../src/modules/comments/routes'` | Insert values include ticket ID, authenticated author ID, and submitted body |
| Ticket detail renders stored comment HTML without escaping | `v1-inseguro/test/comments.test.js` | Comments module missing | Raw script markup, author, and comment form appear in the rendered detail |
| Comment persistence errors reach the error handler | `v1-inseguro/test/comments.test.js` | Not applicable | A controlled database failure returns the error response |

## Coverage And Gaps

`npm test` and `npm run test:coverage` passed 26 tests. Global coverage is 98.36% lines, 97.44% branches, and 93.94% functions; both comment and ticket routers are 100% covered. PostgreSQL-backed runtime validation remains pending because Docker is unavailable locally; tests use a controlled database double.
