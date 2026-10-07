# API evidence

Reference: [Dropify on WordPress.org](https://wordpress.org/plugins/wc-dropi-integration/), version 4.7.3, downloaded ZIP SHA-256 `bf23c6b1c5dd640aab3d38e3f370a41fbd60139ac60a1ce5f0347a059e9b6700`.

The original ZIP was inspected directly. This is an observed compatibility contract, not an official OpenAPI specification or a guarantee of continued provider support. No plugin implementation was vendored.

Source links below identify the versioned [upstream SVN source](https://plugins.svn.wordpress.org/wc-dropi-integration/tags/4.7.3/). Line numbers refer to the inspected ZIP.

| Operation | Source | Envelope / request evidence |
| --- | --- | --- |
| Catalog POST | [`ProductsModel.php`](https://plugins.svn.wordpress.org/wc-dropi-integration/tags/4.7.3/clasess/models/ProductsModel.php), lines 87–176 | `objects` array; `startData`, `pageSize`, `order_type`, `order_by`, keywords and filters |
| Product v2 GET | Same file, lines 43–85 | Singular `objects` product |
| Legacy product GET | [`Dropi.php`](https://plugins.svn.wordpress.org/wc-dropi-integration/tags/4.7.3/clasess/Dropi.php), lines 199–235 | Disabled stock-refresh path; explicit method GET despite WordPress helper name |
| Categories GET | `ProductsModel.php`, lines 935–975 | `objects` array |
| Import marker PUT | Same file, lines 749–803 | `products_id`, `imported_to_store`, `woocomerse_id`, `woocomerse_url`; last method declaration is PUT |
| Order POST | [`OrdersModel.php`](https://plugins.svn.wordpress.org/wc-dropi-integration/tags/4.7.3/clasess/models/OrdersModel.php), lines 245–394 | Success acknowledgement with optional `objects.id`; real order creation; no proven idempotency |

All requests use JSON and the `dropi-integration-key` header. The client also sends `User-Agent: dropi-client/0.1.0 (WordPress integration protocol)`. In controlled Chile catalog checks on 7 October 2026, the same valid key, URL and JSON payload returned HTTP 401 without the `WordPress` marker and HTTP 200 with it, both through Node fetch. WordPress supplies that marker in its default User-Agent. The SDK identifies itself and its compatibility protocol; it does not require or claim a WordPress runtime. This behavior is observed for Chile, not established for every market. Never copy the plugin's disabled TLS verification, raw-body logging or long timeout defaults.

## Catalog

Defaults match the observed active catalog query: `startData: 0`, `pageSize: 20`, `order_type: 'asc'`, `order_by: 'id'`, `keywords: ''`, `active: true`, `no_count: true`, `integration: true`. Supported filters are represented by `ProductListRequest`; callers supply their own query values. Undefined entries are ignored before defaults are merged, including pagination and market-specific flags. Defined values such as `active: false`, `stockmayor: 0` and `keywords: ''` remain intact.

`Constants.php` lines 39–88 provides the ten market URLs exported in `MARKET_URLS`. The ES request omits `integration`; CO/PY/PE/PA default `get_stock: false`. Other markets have not been live verified. Chile catalog listing, v2 detail and categories passed read-only checks. The legacy product route returned HTTP 400 and remains unqualified. No fallback route is guessed.

The plugin UI's later-page computation skips an offset interval and its total is hardcoded despite `no_count`. The client does not reproduce either behavior. `count` remains raw envelope metadata, not proof of completion.

Provider price strings/nulls, `photos` versus `gallery`, per-warehouse stock and both index/detail attribute forms are preserved. `attribute_name`, nested `attribute.description` and nested `attribute.name` can differ. Detail data is not automatically merged over the index. The client does not strip HTML, choose between sale/suggested prices, fill missing shipping facts or apply application-specific limits.

## Product images

`DropiPhoto.urlS3` and `DropiPhoto.url` are raw provider paths, not guaranteed absolute URLs. The inspected Chile list/detail samples contained relative paths. The client does not resolve or rewrite them.

Dropify 4.7.3 uses this resolution order in [`Product_List.php`](https://plugins.svn.wordpress.org/wc-dropi-integration/tags/4.7.3/clasess/tables/Product_List.php) lines 259–264 and `ProductsModel.php` lines 814–817:

| Field | Base | Selection |
| --- | --- | --- |
| `urlS3` | `https://d39ru7awumhhs2.cloudfront.net/` | Preferred when non-empty |
| `url` | The market origin root, such as `https://api.dropi.cl/` | Fallback when `urlS3` is empty |

[`Constants.php`](https://plugins.svn.wordpress.org/wc-dropi-integration/tags/4.7.3/clasess/Constants.php) lines 39–88 assigns that same CDN base to CL, CO, PA, MX, EC, PE, ES, PY, AR and CR. Each market's `IMG_URL` is its API origin root, obtainable as `new URL(MARKET_URLS[market]).origin + '/'`; it is not the integration base. These mappings come from the referenced plugin version. Relative-path shape was checked live only for Chile; image/CDN downloads and other markets have not been live-qualified.

## Excluded warehouse directory API

The plugin retains a `getWarehouse()` function in `ProductsModel.php` lines 883–929, but its only call is commented out in [`Product_List.php`](https://plugins.svn.wordpress.org/wc-dropi-integration/tags/4.7.3/clasess/tables/Product_List.php) line 581. That unused function was incorrectly treated as a supported integration operation. Both forms of the integration route, with and without its trailing slash, returned HTTP 404; a WordPress-style User-Agent did not change the result.

The current [warehouse service](https://app.dropi.cl/chunk-DGPGYJIB.js) and [API transport](https://app.dropi.cl/chunk-XEINS7OM.js), together with the [settings](https://app.dropi.cl/chunk-3YKU4NQN.js) and [Chile environment](https://app.dropi.cl/chunk-ZSA5DZUN.js), identify a separate dashboard route: `GET https://api.dropi.cl/api/warehouses/`, authenticated with a dashboard login token in `X-Authorization: Bearer`. The configured integration key returned HTTP 401 there with both the integration header and the dashboard header. These observations were verified on 7 October 2026.

This client therefore excludes warehouse directory access and its standalone record type. It does not retrieve dashboard sessions or reuse integration credentials across that authentication boundary. Existing product `warehouse_product` and variation `warehouse_product_variation` stock fields, `DropiWarehouseStock`, and the `warehouse_id` catalog filter remain part of the integration contract.

## Writes

Import marker spellings and `/1` suffix are preserved exactly; the suffix's business meaning is not established. The plugin automatically marks imports after Woo creation; this client exposes a separate explicit method instead.

Abort or timeout before any transport invocation is `not-sent` (`attempts: 0`). Once an invocation starts, an unconfirmed failure is `unknown`. A definitive response is admitted only within the monotonic operation deadline; a late success or refusal becomes `TIMEOUT`/`unknown` for an attempted write.

Both write methods acknowledge success through `isSuccess`. Import-list handling does not read `objects`; order handling reads `objects.id` only conditionally. The client therefore preserves successful acknowledgements without requiring either field. Read endpoints still require their expected result shape.

`CreateOrderRequest` documents observed fields without calculating business values. The plugin sets payment method 1, pending-confirmation status, `FINAL_ORDER`, a collection mode, shipping-calculation flag and a shop order ID; the caller chooses/supplies these values. Pending status does not turn the request into a harmless quote. Mixed per-line token behavior is not reproduced automatically.

No order lookup, cancellation, shipment tracking, shipping quote, token-validation or states/cities HTTP endpoint was evidenced. The plugin's geography is static bundled PHP data. No such endpoints are invented here. Read smoke verification does not qualify fulfillment or writes.
