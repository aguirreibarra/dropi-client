/** Market origins observed in Dropify 4.7.3; live qualification is recorded separately. */
export const MARKET_URLS = Object.freeze({
    CL: 'https://api.dropi.cl/integrations/',
    CO: 'https://api.dropi.co/integrations/',
    PA: 'https://api.dropi.pa/integrations/',
    MX: 'https://api.dropi.mx/integrations/',
    EC: 'https://api.dropi.ec/integrations/',
    PE: 'https://api.dropi.pe/integrations/',
    ES: 'https://api.dropi.com.es/integrations/',
    PY: 'https://api.dropi.com.py/integrations/',
    AR: 'https://api.dropi.ar/integrations/',
    CR: 'https://api.dropi.cr/integrations/',
} as const);

export type DropiMarket = keyof typeof MARKET_URLS;
export type DropiId = string | number;
/** Raw provider values: this client never rounds money or chooses a retail price. */
export type DropiPrice = string | number | null;

/** Write acknowledgements need not include objects or an order identity. */
export interface DropiAcknowledgement<T = unknown> {
    isSuccess: true;
    objects?: T;
    count?: number | string;
    message?: unknown;
    [field: string]: unknown;
}

export interface DropiResponse<T> extends DropiAcknowledgement<T> {
    objects: T;
}

export interface DropiAttributeValue {
    id?: DropiId;
    attribute_id?: DropiId;
    attribute_name?: string | number | null;
    name?: string | null;
    value?: string | number | null;
    attribute?: { description?: string | null; name?: string | null; [field: string]: unknown } | null;
    [field: string]: unknown;
}

export interface DropiPhoto {
    id?: DropiId;
    url?: string | null;
    urlS3?: string | null;
    main?: boolean | number;
    variation_id?: DropiId | null;
    [field: string]: unknown;
}

export interface DropiWarehouseStock {
    warehouse_id?: DropiId;
    stock?: number | string | null;
    [field: string]: unknown;
}

export interface DropiVariation {
    id: DropiId;
    sku?: string | null;
    name?: string | null;
    sale_price?: DropiPrice;
    suggested_price?: DropiPrice;
    stock?: number | string | null;
    attribute_values?: DropiAttributeValue[] | null;
    warehouse_product_variation?: DropiWarehouseStock[] | null;
    [field: string]: unknown;
}

export interface DropiCategory {
    id?: DropiId;
    name?: string | null;
    [field: string]: unknown;
}

export interface DropiWarehouse {
    id?: DropiId;
    name?: string | null;
    store_name?: string | null;
    [field: string]: unknown;
}

/** Optional fields reflect incomplete and differing index/detail responses. */
export interface DropiProduct {
    id: DropiId;
    name?: string | null;
    description?: string | null;
    dropi_app_description?: string | null;
    sku?: string | null;
    type?: string | null;
    sale_price?: DropiPrice;
    suggested_price?: DropiPrice;
    stock?: number | string | null;
    active?: boolean | number;
    photos?: DropiPhoto[] | null;
    gallery?: DropiPhoto[] | null;
    categories?: DropiCategory[] | null;
    variations?: DropiVariation[] | null;
    warehouse_product?: DropiWarehouseStock[] | null;
    weight?: number | string | null;
    [field: string]: unknown;
}

export interface ProductListRequest {
    /** Zero-based row offset, not page number. */
    startData?: number;
    pageSize?: number;
    order_type?: 'asc' | 'desc';
    order_by?: string;
    keywords?: string;
    active?: boolean;
    no_count?: boolean;
    integration?: boolean;
    userVerified?: boolean;
    stockmayor?: number;
    notNulldescription?: boolean;
    category?: DropiId;
    warehouse_id?: DropiId;
    get_stock?: boolean;
}

export interface ProductIterationRequest extends ProductListRequest {
    /** Maximum page queries, including oversized attempts. Default 10,000; reaching it throws. */
    maxPages?: number;
    /** Halve an oversized page at the same offset, down to one row. Default true. */
    adaptivePageSize?: boolean;
}

export interface ProductPage {
    items: DropiProduct[];
    startData: number;
    /** Save only after processing this page; pass as startData when resuming. */
    nextStartData: number;
    response: DropiResponse<DropiProduct[]>;
}

export interface RequestOptions {
    signal?: AbortSignal;
}

export interface DropiClientOptions {
    apiKey: string;
    market?: DropiMarket;
    /** Covers the complete operation, including retries and response consumption. Default 30s. */
    timeoutMs?: number;
    /** Successful/error response byte admission; default 32 MiB. */
    maxResponseBytes?: number;
    /** Retries after the first request, for read operations only. Default 2. */
    maxRetries?: number;
    /** Exponential read backoff base; Retry-After takes precedence. Default 500ms. */
    retryDelayMs?: number;
    /** Trusted transport injection, primarily for tests. Never redirects credentials. */
    fetch?: typeof globalThis.fetch;
}

/** Misspelled keys and the /1 endpoint suffix are the observed provider wire contract. */
export interface ImportMarkerRequest {
    products_id: DropiId;
    imported_to_store: boolean;
    woocomerse_id: DropiId;
    woocomerse_url: string;
}

export interface DropiOrderLine {
    id: DropiId;
    quantity: number;
    price: number | string;
    variation_id?: DropiId;
    name?: string;
    sku?: string;
    [field: string]: unknown;
}

/** Explicit real-order submission. No totals, shipping, payment or defaults are invented. */
export interface CreateOrderRequest {
    total_order: number | string;
    notes: string;
    name: string;
    surname: string;
    dir: string;
    country: string;
    state: string;
    city: string;
    phone: string;
    client_email: string;
    payment_method_id: number;
    status: string;
    type: 'FINAL_ORDER';
    rate_type: 'CON RECAUDO' | 'SIN RECAUDO';
    products: DropiOrderLine[];
    calculate_costs_and_shiping: boolean;
    supplier_id: DropiId;
    shop_order_id: DropiId;
    create_product_if_not_exist: boolean;
    zip_code?: string;
    [field: string]: unknown;
}

export interface CreatedOrder {
    id?: DropiId;
    [field: string]: unknown;
}
