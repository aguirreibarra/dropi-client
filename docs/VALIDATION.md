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

## Live read attempt

The Chile catalog probe (`POST products/index`) returned HTTP 401 with the configured credential on 6 October 2026. No retry or mutation was performed. The probe stopped before detail, categories and warehouses; their live behavior remains unverified for this client. No successful live market qualification is claimed. Re-run the opt-in smoke test with a provider-accepted credential before relying on live integration.
