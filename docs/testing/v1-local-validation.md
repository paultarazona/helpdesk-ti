# v1 Local Validation Checklist

## Scope

Use this checklist only in an isolated Docker environment. The Compose binding is limited to `127.0.0.1:3000`; do not expose the lab on a reachable network.

## Setup

1. Run `docker compose up --build` from `v1-inseguro`.
2. Open `http://127.0.0.1:3000` and authenticate with a seeded user.
3. Record the result of each row below for the course evidence.

## Checklist

| ID | Reproducible action | Expected local result | Current environment result |
| --- | --- | --- | --- |
| VULN-001 | Submit a quote-based payload to login or ticket search. | Concatenated SQL changes the query behavior. | Pending Docker validation. |
| VULN-002 | Save script markup in a ticket description or comment. | Markup renders in ticket detail. | Pending Docker validation. |
| VULN-003 | Search with script markup. | Search value is reflected without escaping. | Pending Docker validation. |
| VULN-004 | Change a ticket or asset ID while authenticated as another user. | Cross-user resource is available. | Pending Docker validation. |
| VULN-005 | Submit a ticket mutation from an external HTML form. | Request succeeds without a CSRF token. | Pending Docker validation. |
| VULN-006 | Upload arbitrary content with `storagePath=../escaped.txt`. | File escapes uploads and is publicly served. | Pending Docker validation. |
| VULN-007 | Submit `127.0.0.1; id` to ping. | Shell suffix is executed by the container. | Pending Docker validation. |
| VULN-008 | Submit a Docker-network or localhost URL to health-check. | Server fetches the provided destination. | Pending Docker validation. |
| VULN-009 | Register a trivial password and repeat login attempts. | Password is accepted and attempts are not throttled. | Pending Docker validation. |
| VULN-010 | Inspect a seeded user in PostgreSQL. | Password is readable in plaintext. | Pending Docker validation. |
| VULN-011 | Decode an issued JWT. | Token has no expiry and uses the hardcoded secret flow. | Pending Docker validation. |
| VULN-012 | Send invalid JSON and inspect response headers. | Stack trace and permissive CORS are exposed. | Pending Docker validation. |
| VULN-013 | Inspect source or Compose configuration. | JWT and database secrets are hardcoded. | Verified by source inspection. |
| VULN-014 | Sign in as a normal user and request `/admin`. | Administration user list is rendered. | Pending Docker validation. |

Docker is unavailable in the current development environment, so this checklist is prepared and source-backed but not falsely marked as executed.
