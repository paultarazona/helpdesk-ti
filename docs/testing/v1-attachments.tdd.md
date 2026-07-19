# TDD Evidence: v1 Attachments

## Source Plan

Derived from `docs/plan-mesa-ayuda-ti.md` and GitHub issue #7.

## User Journeys

- An authenticated user uploads an arbitrary file to a ticket.
- Ticket detail displays links to its stored attachments and provides a multipart upload form.
- A client-controlled storage path can escape the public uploads directory and the resulting file remains server-accessible.

## Evidence

| Guarantee | Test | RED | GREEN |
| --- | --- | --- | --- |
| Arbitrary files retain original names and are served publicly | `v1-inseguro/test/attachments.test.js` | `Cannot find module '../src/modules/attachments/routes'` | An HTML payload is stored as `uploads/payload.html` and served by Express |
| `storagePath` supports reproducible traversal | `v1-inseguro/test/attachments.test.js` | Attachment module missing | `../escaped.txt` writes outside `uploads` and is served from public root |
| Attachment metadata is persisted and failures reach the handler | `v1-inseguro/test/attachments.test.js` | Attachment module missing | Metadata values and controlled database failure response are verified |
| Ticket detail exposes attachment links and multipart form | `v1-inseguro/test/attachments.test.js` | Not applicable | Stored path, multipart encoding, and `storagePath` input are rendered |

## Coverage And Gaps

`npm test` and `npm run test:coverage` passed 30 tests. Global coverage is 98.52% lines, 97.62% branches, and 94.29% functions; attachment and ticket routers are 100% covered. PostgreSQL-backed runtime validation remains pending because Docker is unavailable locally; tests use controlled doubles and temporary filesystem directories.
