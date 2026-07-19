# v1 Vulnerability Catalog

This catalog maps the deliberately vulnerable v1 laboratory surface. Run it only through the local Docker Compose environment.

| ID | Weakness | OWASP / CWE | Source | Endpoint | Local validation objective |
| --- | --- | --- | --- | --- | --- |
| VULN-001 | SQL injection | A03 / CWE-89 | `src/modules/auth/routes.js`, ticket and asset routers | `POST /login`, `GET /tickets`, `GET /assets` | Show a concatenated SQL payload changes the query. |
| VULN-002 | Stored XSS | A03 / CWE-79 | `src/views/tickets/detail.ejs` | `GET /tickets/:id` | Store script markup in a ticket description or comment. |
| VULN-003 | Reflected XSS | A03 / CWE-79 | `src/views/tickets/index.ejs` | `GET /tickets?search=` | Reflect script markup through the search value. |
| VULN-004 | IDOR | A01 / CWE-639 | ticket and asset routers | `GET/POST /tickets/:id`, `GET/POST /assets/:id` | Access or mutate another user's resource ID. |
| VULN-005 | CSRF | A01 / CWE-352 | ticket and comment routers | mutable `/tickets` routes | Submit a state-changing form without a CSRF token. |
| VULN-006 | Unrestricted upload and traversal | A05 / CWE-434, CWE-22 | `src/modules/attachments/routes.js` | `POST /tickets/:id/attachments` | Upload arbitrary content and set `storagePath=../escaped.txt`. |
| VULN-007 | Command injection | A03 / CWE-78 | `src/modules/diagnostics/routes.js` | `POST /diagnostics/ping` | Submit `127.0.0.1; id` as the target. |
| VULN-008 | SSRF | A10 / CWE-918 | `src/modules/diagnostics/routes.js` | `POST /diagnostics/health-check` | Request a localhost or Docker-network URL. |
| VULN-009 | Weak authentication | A07 / CWE-521 | `src/modules/auth/routes.js` | `POST /register`, `POST /login` | Register a trivial password and attempt repeated logins. |
| VULN-010 | Plaintext passwords | A02 / CWE-256 | `src/modules/auth/routes.js`, `src/db/seed.sql` | registration and database | Inspect stored or seeded password values. |
| VULN-011 | Insecure JWT | A02 / CWE-613, CWE-327 | auth router and middleware | authenticated routes | Inspect a non-expiring JWT and unrestricted verification. |
| VULN-012 | Security misconfiguration | A05 / CWE-942, CWE-209 | `src/app.js` | all routes | Observe `Access-Control-Allow-Origin: *` and exposed errors. |
| VULN-013 | Hardcoded secrets | A02 / CWE-798 | `src/config.js`, `docker-compose.yml` | source and Compose config | Inspect embedded JWT and database credentials. |
| VULN-014 | Missing role authorization | A01 / CWE-285 | `src/modules/admin/routes.js` | `GET /admin` | Sign in as a normal user and open the administration panel. |
