# TDD Evidence: v1 Tickets

## Source Plan

Derived from `docs/plan-mesa-ayuda-ti.md` and GitHub issue #4.

## User Journeys

- An authenticated user creates, lists, views, edits, closes, and deletes tickets.
- A user can search and filter tickets through the v1 SQL-concatenated query path.
- The lab preserves intended IDOR, missing CSRF, stored XSS, and reflected XSS behavior.

## Evidence

| Guarantee | Test | RED | GREEN |
| --- | --- | --- | --- |
| Search concatenates input and reflects it without escaping | `v1-inseguro/test/tickets.test.js` | Ticket router was missing | Query and rendered response contain the supplied search text |
| Detail renders stored description raw and does not scope by requester | `v1-inseguro/test/tickets.test.js` | Ticket router was missing | Raw HTML and unrestricted ID query are verified |
| Ticket mutations work without ownership or CSRF checks | `v1-inseguro/test/tickets.test.js` | Ticket router was missing | Create, update, close, and delete flows pass without a CSRF token |
| All database failures reach the route error path | `v1-inseguro/test/tickets.test.js` | Not applicable | Eight ticket routes return the test error response |

## Coverage And Gaps

`npm run test:coverage` passed 17 tests with 97.18% line, 96% branch, and 90.91% function coverage globally. PostgreSQL-backed ticket flows remain pending Docker validation; the current tests use a controlled database double.
