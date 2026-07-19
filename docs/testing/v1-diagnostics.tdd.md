# TDD Evidence: v1 Diagnostics

## Source Plan

Derived from `docs/plan-mesa-ayuda-ti.md` and GitHub issue #8.

## User Journeys

- An authenticated user opens the diagnostics page and submits a ping target.
- A target is concatenated into a shell command so command injection is reproducible in the local Docker lab.
- An authenticated user submits any URL and the server fetches it without destination restrictions.

## Evidence

| Guarantee | Test | RED | GREEN |
| --- | --- | --- | --- |
| Both diagnostic forms are available | `v1-inseguro/test/diagnostics.test.js` | `Cannot find module '../src/modules/diagnostics/routes'` | The forms render `target` and `url` inputs with their routes |
| Ping preserves shell injection | `v1-inseguro/test/diagnostics.test.js` | Diagnostics module missing | `127.0.0.1; id` becomes `ping -c 1 127.0.0.1; id` |
| Health-check permits SSRF destinations | `v1-inseguro/test/diagnostics.test.js` | Diagnostics module missing | `http://127.0.0.1:5432/private` is passed directly to the request function |
| Execution failures are handled | `v1-inseguro/test/diagnostics.test.js` | Not applicable | Ping and health-check errors reach the controlled error handler |

## Coverage And Gaps

Tests use injected command and HTTP clients so no shell command or network request executes during the test suite. Docker runtime verification remains pending because Docker is unavailable locally.
