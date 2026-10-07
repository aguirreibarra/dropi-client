# Validation

Verified locally on 6 October 2026: all 45 offline tests passed on Node 22.22.0 and Node 24.15.0, with strict compilation/typechecking, example syntax checks, package-content review and zero runtime dependency audit findings. The normal test suite uses synthetic data.

- Strict TypeScript compilation and typechecking.
- Operation method/path/header/payload contracts for all seven observed provider operations and all ten market configurations.
- Raw pricing, paragraph/HTML, nullable fields and variant-schema preservation.
- Offset pagination through short pages, duplicate IDs/payloads, actual empty completion, adaptive oversized pages and explicit page-query bounds.
- HTTP/provider/protocol errors, Retry-After, transport retry, response byte bounds, UTF-8, cancellation and full-response deadlines.
- Single-attempt writes, optional acknowledgement objects/identity and explicit uncertain outcomes; safe error/client inspection.
- Real local HTTP tests with synthetic credentials, including redirect refusal.
- Node 22/24 CI; package-content and runtime-dependency checks.

Live verification is opt-in, uses `DROPI_API_KEY` only in the request header and emits only status/count metadata. No token, personal data or catalog body belongs in this file, tests, issue/PR evidence or CI artifacts.

Unverified: all non-Chile live markets, live mutations, fulfillment, stock/order reconciliation, cancellation, tracking and shipping quotes. No npm publication or public repository release is part of this work.

## Live read checks

The initial Chile catalog probe returned HTTP 401 on 6 October 2026. Controlled comparisons on 7 October confirmed that the key was valid: WordPress succeeded, and changing only the Node request's User-Agent to include the WordPress protocol marker changed HTTP 401 to HTTP 200. Removing that marker again reproduced HTTP 401. The client now sends its own name and version with this compatibility marker; it has no WordPress runtime dependency.

Read-only verification with the corrected client on 7 October 2026:

| Operation | Result |
| --- | --- |
| Catalog listing, one requested row | Passed; one row |
| v2 detail of that catalog row | Passed; one product |
| Categories | Passed; 20 rows |
| Warehouses, plugin-referenced route | HTTP 404; not live-qualified |
| Legacy detail of that catalog row | HTTP 400; not live-qualified |

No mutation was sent. The combined smoke test still fails on the warehouse read; this is a separate provider response after successful catalog, detail and category reads. No complete-market or fulfillment qualification is claimed. A regression assertion for the User-Agent failed before the fix and passed afterward. Strict compilation, consumer typechecks, all 45 offline tests and example syntax checks passed after the fix on Node 22.22.0 and Node 24.15.0.
