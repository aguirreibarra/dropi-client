# Dropi client

Unofficial TypeScript client for the Dropi integrations API, independently implemented from the HTTP contracts used by [Dropify 4.7.3](https://wordpress.org/plugins/wc-dropi-integration/). Node.js 22 or newer; no runtime dependencies.

This repository is private. The npm package is marked `private: true` and is not published. Newly authored code is unlicensed pending a deliberate license choice before public distribution. The upstream plugin is GPLv2-or-later; no plugin code, assets, geographic datasets or real catalog fixtures are included.

## Start

```sh
npm ci
npm run check
npm run build
```

With `DROPI_API_KEY` already exported in your shell:

```ts
import { DropiClient, DropiError } from '@aguirreibarra/dropi-client';

const client = new DropiClient({
    apiKey: process.env.DROPI_API_KEY!,
    market: 'CL',
});

const page = await client.products.list({ pageSize: 20, startData: 0 });
const product = page.objects[0];
if (product) {
    const detail = await client.products.get(product.id);
    // detail.objects retains the provider's raw fields.
}
```

The package-name import is for an installed local/Git package. In this checkout, runnable examples import `../dist/index.js` directly. Run `node examples/catalog.mjs` after building. Set `DROPI_MARKET` to override Chile in the examples.

## Catalog and checkpoints

```ts
for await (const page of client.products.pages({ startData: 0, pageSize: 20 })) {
    await processProducts(page.items);
    await saveCheckpoint(page.nextStartData);
}

for await (const product of client.products.iterate({ pageSize: 20 })) {
    // Consume one product at a time; no automatic detail hydration.
}
```

`startData` is a zero-based row offset. Iteration advances by the actual number of returned rows, including duplicate IDs. Short pages and `count` do not establish completion; only an admitted empty `objects` array does. Save a checkpoint after processing its entire page. Offset pagination is a point-in-time traversal, not a snapshot-isolation or gap-free freshness guarantee while the provider changes its catalog.

Page iteration halves the page size at the same offset only when the response exceeds the byte limit; malformed JSON is an error. Set `adaptivePageSize: false` to refuse resizing. Duplicate rows and pages are preserved because their contents do not prove whether the provider advanced its offset. `maxPages` defaults to 10,000 page queries and is configurable; oversized attempts count toward this bound, while transport retries remain separately bounded per query. Reaching the bound throws `PAGINATION_LIMIT` and never looks like successful completion. Iteration retains one response page; applications own deduplication and durable receipt/checkpoint storage.

## API

| Client operation | Provider request | Effect |
| --- | --- | --- |
| `products.list(request?, options?)` | POST `products/index` | Read |
| `products.get(id, options?)` | GET `products/v2/{id}` | Read |
| `products.getLegacy(id, options?)` | GET `products/{id}` | Legacy read, no automatic fallback |
| `products.pages(request?, options?)` | Repeated catalog reads | Async pages/checkpoints |
| `products.iterate(request?, options?)` | Repeated catalog reads | Async products |
| `categories.list(options?)` | GET `categories/` | Read |
| `imports.markImported(request, options?)` | PUT `importlist/importstore/1` | Explicit remote mutation |
| `orders.create(request, options?)` | POST `orders/myorders` | Explicit real order creation |

Every call returns the provider envelope and preserves additional fields. Reads require the expected `objects` shape and product identity. Write acknowledgements may omit `objects` or an order ID; callers must check `response.objects?.id` before using a returned order identity. Models describe observed fields rather than a provider-issued complete schema, and admission does not claim full nested schema validation. Nulls, unknown fields, HTML, paragraph breaks, variant labels, stock and raw price representations remain intact. `sale_price` and `suggested_price` are separate; the client never selects retail prices, invents weights, rounds money or drops variants.

Market configurations: CL, CO, PA, MX, EC, PE, ES, PY, AR, CR. Origins and request differences come from the plugin. Chile is the default; market configurations have synthetic contract coverage. Chile catalog listing, v2 product detail and categories passed read-only live checks on 7 October 2026. Warehouse directory access is excluded: the plugin's unused integration route returns HTTP 404, while the dashboard API requires separate login authentication. Product warehouse-stock fields and the `warehouse_id` catalog filter remain raw provider data. The legacy detail endpoint returned HTTP 400 and remains unqualified. Other markets and live mutations remain unverified. See [API evidence](docs/API.md).

## Failures and write uncertainty

Read operations retry HTTP 429/502/503/504 and transport failures up to `maxRetries` (default 2). Catalog POST is explicitly classified as a read. Retry-After seconds/dates take precedence over exponential backoff; if the requested wait exceeds the remaining deadline, the original HTTP error is returned without retrying early. HTTP 400/401/403, provider refusals and malformed responses do not retry.

Both mutation methods send **one request only**, regardless of retry settings. No idempotency guarantee was found for `shop_order_id`. After timeout, network failure, HTTP failure or an invalid response, `mutationOutcome: 'unknown'` means the provider might have applied the write. Reconcile outside this client before deciding whether to resubmit. An explicit `isSuccess: false` is reported as `'rejected'`. Reading the catalog never marks products imported or creates orders.

```ts
try {
    await client.products.list({}, { signal: abortController.signal });
} catch (error) {
    if (error instanceof DropiError) {
        console.error({ code: error.code, status: error.status, retryAfterMs: error.retryAfterMs });
    }
}
```

The default 30-second deadline covers fetch, response consumption, retries and waits. `timeoutMs`, `maxResponseBytes` (default 32 MiB), `maxRetries` and `retryDelayMs` are configurable. Errors contain safe operation metadata without provider bodies, request payloads, credentials or original exception causes. Native fetch verifies TLS, redirects are refused, and authenticated URLs are limited to the configured known market. Requests identify this SDK with `User-Agent: dropi-client/0.1.0 (WordPress integration protocol)`. Chile's integration gateway rejected the same valid key and catalog request without the `WordPress` marker; this is protocol compatibility, with no WordPress runtime dependency. A custom `fetch` is a trusted injection boundary and must preserve these properties.

## Verification

`npm run check` builds, typechecks and runs offline tests plus example syntax checks. Tests use synthetic data, including actual local HTTP transport checks. CI runs Node 22 and 24; it has no Dropi secret and makes no provider calls.

An explicitly enabled smoke test reads one Chile catalog page, one detail if available, and categories, and prints only status/count metadata:

```sh
DROPI_LIVE_SMOKE=1 npm run smoke
```

It never calls either mutation endpoint or writes provider responses to disk. See [validation evidence](docs/VALIDATION.md). Order/import mutation contracts are tested offline; no live orders, imports, shipment, cancellation, tracking or quote behavior is claimed.
