# Validation

Verified locally on 7 October 2026: all 52 offline tests passed on Node 22.22.0 and Node 24.15.0, with strict compilation/typechecking, example syntax checks, package-content review and zero runtime dependency audit findings. The normal test suite uses synthetic data.

- Strict TypeScript compilation and typechecking.
- Operation method/path/header/payload contracts for all six exposed provider operations and all ten market configurations.
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
| Warehouses, unused plugin route | HTTP 404; excluded from the client |
| Legacy detail of that catalog row | HTTP 400; not live-qualified |

No mutation was sent. Warehouse directory access was removed after confirming that the plugin's only caller is commented out and its integration route is unavailable. The current dashboard route refused the integration key with HTTP 401 and requires separate login authentication; it is outside this client's scope. The smoke test now checks only catalog, v2 detail and categories; a failure of any of those reads still fails the check. No complete-market or fulfillment qualification is claimed. A regression assertion for the User-Agent failed before the fix and passed afterward. Strict compilation, consumer typechecks, all 45 offline tests and example syntax checks passed after the fix on Node 22.22.0 and Node 24.15.0.

Consumer declaration assertions reject both the removed `warehouses.list` method and `DropiWarehouse` export. They failed before removal and passed after it. `DropiWarehouseStock` and product warehouse-stock fields remain typed and preserved.

The final integration-only live smoke passed on 7 October 2026: one catalog row, its v2 detail, 20 categories and zero mutations. Strict compilation, consumer declaration checks, all 45 offline tests and example syntax checks passed after removal on Node 22.22.0 and Node 24.15.0.

## Joint review corrections

An independent Claude CLI review requested and reported `claude-opus-5-5` in `auto` permission mode, with built-in tools and the integration key available through the process environment. Live checks emitted only metadata. The first review found missing image-path documentation, undefined values overriding catalog defaults, and inaccurate pre-send mutation uncertainty. Codex independently reproduced a deadline overrun; a follow-up Opus review confirmed it and an empty-chunk microtask starvation case. Both reviewers agreed on these corrections:

- Document the plugin-derived image bases and field precedence, preserving raw paths without a helper or new export.
- Ignore undefined catalog properties when merging defaults while retaining defined false, zero and empty-string values and market differences.
- Report `not-sent` only before any write transport invocation; retain `unknown` after an unconfirmed attempt.
- Use monotonic deadline checkpoints at dispatch, response, body-read, parsing and admission boundaries. Expired writes remain single-attempt and unknown after dispatch; synchronous work is checked when control returns.

Seven additional offline regressions cover undefined defaults across CL/ES/CO, both pre-aborted writes, late synchronous responses, empty/one-byte microtask streams with reader cancellation, late JSON parsing and wall-clock changes. Six new defect regressions failed before the fix; the wall-clock guard already passed. No source changes for image resolution were made, and image/CDN downloads remain unqualified.
