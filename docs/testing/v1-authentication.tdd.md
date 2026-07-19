# TDD Evidence: v1 Authentication

## Source Plan

Derived from `docs/plan-mesa-ayuda-ti.md` and GitHub issue #3.

## User Journeys

- A visitor registers, logs in, receives a JWT cookie, and logs out.
- An authenticated user reaches a protected route with a valid JWT cookie.
- The v1 lab preserves its intended SQL injection, plaintext password, weak JWT, and missing rate-limit behavior.

## Evidence

| Guarantee | Test | RED | GREEN |
| --- | --- | --- | --- |
| Registration persists the submitted password without hashing | `v1-inseguro/test/auth.test.js` | Auth routes were missing | Registration redirects and the fake database receives the plaintext password |
| Login concatenates input into SQL and creates a JWT without `exp` | `v1-inseguro/test/auth.test.js` | Auth routes were missing | Login test verifies raw input in the query and a cookie token without expiry |
| JWT cookies grant, deny, and clear protected access | `v1-inseguro/test/auth.test.js` | Auth middleware was missing | Valid, missing, invalid, and logout cookie cases pass |

## Coverage And Gaps

`npm run test:coverage` passed 11 tests with 94.37% line, 92% branch, and 84.62% function coverage globally. PostgreSQL-backed registration/login requires Docker runtime validation. `npm audit --omit=dev` reports one high-severity vulnerability in intentional dependency `jsonwebtoken@8.5.1`; v2 will upgrade to 9.x.
