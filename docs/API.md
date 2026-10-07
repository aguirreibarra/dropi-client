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
| Warehouses GET | Same file, lines 883–929 | `objects` array |
| Import marker PUT | Same file, lines 749–803 | `products_id`, `imported_to_store`, `woocomerse_id`, `woocomerse_url`; last method declaration is PUT |
| Order POST | [`OrdersModel.php`](https://plugins.svn.wordpress.org/wc-dropi-integration/tags/4.7.3/clasess/models/OrdersModel.php), lines 245–394 | Success acknowledgement with optional `objects.id`; real order creation; no proven idempotency |

All requests use JSON and the `dropi-integration-key` header. Never copy the plugin's disabled TLS verification, raw-body logging or long timeout defaults.

## Catalog

Defaults match the observed active catalog query: `startData: 0`, `pageSize: 20`, `order_type: 'asc'`, `order_by: 'id'`, `keywords: ''`, `active: true`, `no_count: true`, `integration: true`. Supported filters are represented by `ProductListRequest`; callers supply their own query values.

`Constants.php` lines 39–88 provides the ten market URLs exported in `MARKET_URLS`. The ES request omits `integration`; CO/PY/PE/PA default `get_stock: false`. Other markets have not been live verified.

The plugin UI's later-page computation skips an offset interval and its total is hardcoded despite `no_count`. The client does not reproduce either behavior. `count` remains raw envelope metadata, not proof of completion.

Provider price strings/nulls, `photos` versus `gallery`, per-warehouse stock and both index/detail attribute forms are preserved. `attribute_name`, nested `attribute.description` and nested `attribute.name` can differ. Detail data is not automatically merged over the index. The client does not strip HTML, choose between sale/suggested prices, fill missing shipping facts or apply application-specific limits.

## Writes

Import marker spellings and `/1` suffix are preserved exactly; the suffix's business meaning is not established. The plugin automatically marks imports after Woo creation; this client exposes a separate explicit method instead.

Both write methods acknowledge success through `isSuccess`. Import-list handling does not read `objects`; order handling reads `objects.id` only conditionally. The client therefore preserves successful acknowledgements without requiring either field. Read endpoints still require their expected result shape.

`CreateOrderRequest` documents observed fields without calculating business values. The plugin sets payment method 1, pending-confirmation status, `FINAL_ORDER`, a collection mode, shipping-calculation flag and a shop order ID; the caller chooses/supplies these values. Pending status does not turn the request into a harmless quote. Mixed per-line token behavior is not reproduced automatically.

No order lookup, cancellation, shipment tracking, shipping quote, token-validation or states/cities HTTP endpoint was evidenced. The plugin's geography is static bundled PHP data. No such endpoints are invented here. Read smoke verification does not qualify fulfillment or writes.
