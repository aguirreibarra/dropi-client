import { DropiError, type DropiErrorCode, type DropiErrorDetails } from './errors.js';
import {
    MARKET_URLS, type CreateOrderRequest, type CreatedOrder, type DropiAcknowledgement, type DropiCategory,
    type DropiClientOptions, type DropiId, type DropiMarket, type DropiProduct,
    type DropiResponse, type DropiWarehouse, type ImportMarkerRequest,
    type ProductIterationRequest, type ProductListRequest, type ProductPage, type RequestOptions,
} from './types.js';

function integer(value: number, minimum: number, label: string): number {
    if (!Number.isSafeInteger(value) || value < minimum) throw new TypeError(`${label} must be a safe integer >= ${minimum}`);
    return value;
}

function identifier(id: DropiId): string {
    if (typeof id === 'number' && (!Number.isSafeInteger(id) || id <= 0)) throw new TypeError('Invalid Dropi identifier');
    if ((typeof id !== 'string' && typeof id !== 'number') || !/^[A-Za-z0-9_-]{1,256}$/.test(String(id))) throw new TypeError('Invalid Dropi identifier');
    return encodeURIComponent(String(id));
}

function object(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function identified(value: unknown): boolean {
    if (!object(value)) return false;
    return (typeof value.id === 'number' && Number.isSafeInteger(value.id) && value.id > 0)
        || (typeof value.id === 'string' && value.id.length > 0);
}

function withObjects(shape: (value: unknown) => boolean): (envelope: Record<string, unknown>) => boolean {
    return envelope => Object.hasOwn(envelope, 'objects') && shape(envelope.objects);
}

function retryAfter(value: string | null): number | undefined {
    if (value === null) return undefined;
    if (/^\d+(?:\.\d+)?$/.test(value.trim())) return Math.ceil(Number(value) * 1000);
    const date = Date.parse(value);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

/** Reject promptly even if an injected transport/body ignores AbortSignal. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(new Error('Operation aborted'));
    return new Promise((resolve, reject) => {
        const abort = () => reject(new Error('Operation aborted'));
        signal.addEventListener('abort', abort, { once: true });
        promise.then(
            value => { signal.removeEventListener('abort', abort); resolve(value); },
            error => { signal.removeEventListener('abort', abort); reject(error); },
        );
    });
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) { reject(new Error('Operation aborted')); return; }
        const abort = () => { clearTimeout(timer); reject(new Error('Operation aborted')); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
        signal.addEventListener('abort', abort, { once: true });
    });
}

/**
 * Unofficial Dropi integration client. Reads never mutate the provider's import list.
 * Write methods send exactly one request, including on uncertain failure.
 */
export class DropiClient {
    readonly market: DropiMarket;
    readonly products: {
        list: (request?: ProductListRequest, options?: RequestOptions) => Promise<DropiResponse<DropiProduct[]>>;
        get: (id: DropiId, options?: RequestOptions) => Promise<DropiResponse<DropiProduct>>;
        getLegacy: (id: DropiId, options?: RequestOptions) => Promise<DropiResponse<DropiProduct>>;
        pages: (request?: ProductIterationRequest, options?: RequestOptions) => AsyncGenerator<ProductPage>;
        iterate: (request?: ProductIterationRequest, options?: RequestOptions) => AsyncGenerator<DropiProduct>;
    };
    readonly categories: { list: (options?: RequestOptions) => Promise<DropiResponse<DropiCategory[]>> };
    readonly warehouses: { list: (options?: RequestOptions) => Promise<DropiResponse<DropiWarehouse[]>> };
    readonly imports: { markImported: (request: ImportMarkerRequest, options?: RequestOptions) => Promise<DropiAcknowledgement> };
    readonly orders: { create: (request: CreateOrderRequest, options?: RequestOptions) => Promise<DropiAcknowledgement<CreatedOrder>> };

    #apiKey: string;
    #fetch: typeof globalThis.fetch;
    #timeoutMs: number;
    #maxResponseBytes: number;
    #maxRetries: number;
    #retryDelayMs: number;

    constructor(options: DropiClientOptions) {
        if (typeof options.apiKey !== 'string' || !options.apiKey.length || /[\s\x00-\x1f\x7f]/.test(options.apiKey)) throw new TypeError('apiKey must be a nonempty header-safe string');
        const market = options.market ?? 'CL';
        if (!Object.hasOwn(MARKET_URLS, market)) throw new TypeError('Unsupported Dropi market');
        this.market = market;
        this.#apiKey = options.apiKey;
        this.#fetch = options.fetch ?? globalThis.fetch;
        this.#timeoutMs = integer(options.timeoutMs ?? 30_000, 1, 'timeoutMs');
        if (this.#timeoutMs > 2 ** 31 - 1) throw new TypeError('timeoutMs exceeds the supported timer range');
        this.#maxResponseBytes = integer(options.maxResponseBytes ?? 32 * 1024 * 1024, 1, 'maxResponseBytes');
        this.#maxRetries = integer(options.maxRetries ?? 2, 0, 'maxRetries');
        this.#retryDelayMs = integer(options.retryDelayMs ?? 500, 0, 'retryDelayMs');
        this.products = Object.freeze({
            list: (request: ProductListRequest = {}, opts: RequestOptions = {}) => this.#list(request, opts),
            get: async (id: DropiId, opts: RequestOptions = {}) => this.#request<DropiResponse<DropiProduct>>('GET', `products/v2/${identifier(id)}`, undefined, withObjects(identified), true, opts),
            getLegacy: async (id: DropiId, opts: RequestOptions = {}) => this.#request<DropiResponse<DropiProduct>>('GET', `products/${identifier(id)}`, undefined, withObjects(identified), true, opts),
            pages: (request: ProductIterationRequest = {}, opts: RequestOptions = {}) => this.#pages(request, opts),
            iterate: (request: ProductIterationRequest = {}, opts: RequestOptions = {}) => this.#iterate(request, opts),
        });
        const collection = (path: string, opts: RequestOptions) => this.#request<DropiResponse<Record<string, unknown>[]>>('GET', path, undefined, withObjects(value => Array.isArray(value) && value.every(object)), true, opts);
        this.categories = Object.freeze({ list: (opts: RequestOptions = {}) => collection('categories/', opts) });
        this.warehouses = Object.freeze({ list: (opts: RequestOptions = {}) => collection('warehouses/', opts) });
        this.imports = Object.freeze({
            markImported: (request: ImportMarkerRequest, opts: RequestOptions = {}) => this.#request<DropiAcknowledgement>('PUT', 'importlist/importstore/1', request, () => true, false, opts),
        });
        this.orders = Object.freeze({
            create: (request: CreateOrderRequest, opts: RequestOptions = {}) => this.#request<DropiAcknowledgement<CreatedOrder>>('POST', 'orders/myorders', request, () => true, false, opts),
        });
    }

    async #list(request: ProductListRequest, options: RequestOptions): Promise<DropiResponse<DropiProduct[]>> {
        const body: ProductListRequest = {
            startData: 0, pageSize: 20, order_type: 'asc', order_by: 'id', keywords: '',
            active: true, no_count: true, integration: true,
            ...(['CO', 'PY', 'PE', 'PA'].includes(this.market) ? { get_stock: false } : {}),
            ...request,
        };
        integer(body.startData!, 0, 'startData');
        integer(body.pageSize!, 1, 'pageSize');
        if (this.market === 'ES') delete body.integration;
        return this.#request<DropiResponse<DropiProduct[]>>('POST', 'products/index', body, withObjects(value => Array.isArray(value) && value.every(identified)), true, options);
    }

    async *#pages(request: ProductIterationRequest, options: RequestOptions): AsyncGenerator<ProductPage> {
        const { maxPages = 10_000, adaptivePageSize = true, ...filters } = request;
        integer(maxPages, 1, 'maxPages');
        let startData = integer(filters.startData ?? 0, 0, 'startData');
        let pageSize = integer(filters.pageSize ?? 20, 1, 'pageSize');
        let queries = 0;
        for (;;) {
            if (queries >= maxPages) throw new DropiError({ code: 'PAGINATION_LIMIT', method: 'POST', path: 'products/index', attempts: 0, mutationOutcome: 'not-applicable' });
            queries++;
            let response: DropiResponse<DropiProduct[]>;
            try { response = await this.#list({ ...filters, startData, pageSize }, options); }
            catch (error) {
                if (adaptivePageSize && pageSize > 1 && error instanceof DropiError && error.code === 'RESPONSE_TOO_LARGE') {
                    pageSize = Math.max(1, Math.floor(pageSize / 2));
                    continue;
                }
                throw error;
            }
            if (response.objects.length === 0) return;
            const nextStartData = integer(startData + response.objects.length, 0, 'nextStartData');
            yield { items: response.objects, startData, nextStartData, response };
            startData = nextStartData;
        }
    }

    async *#iterate(request: ProductIterationRequest, options: RequestOptions): AsyncGenerator<DropiProduct> {
        for await (const page of this.#pages(request, options)) for (const item of page.items) yield item;
    }

    async #request<T extends DropiAcknowledgement>(method: string, path: string, body: unknown, validate: (envelope: Record<string, unknown>) => boolean, read: boolean, options: RequestOptions): Promise<T> {
        let encoded: string | undefined;
        try { encoded = body === undefined ? undefined : JSON.stringify(body); }
        catch { throw new TypeError('Request body must be JSON serializable'); }
        const deadline = Date.now() + this.#timeoutMs;
        const controller = new AbortController();
        const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
        const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
        let attempts = 0;
        const fail = (code: DropiErrorCode, extra: Partial<Pick<DropiErrorDetails, 'status' | 'retryAfterMs'>> = {}) => new DropiError({
            code, method, path, attempts, mutationOutcome: read ? 'not-applicable' : code === 'API_ERROR' ? 'rejected' : 'unknown', ...extra,
        });
        const normalize = (error: unknown) => signal.aborted
            ? fail(options.signal?.aborted ? 'ABORTED' : 'TIMEOUT')
            : error instanceof DropiError ? error : fail('TRANSPORT_ERROR');
        try {
            for (;;) {
                try {
                    if (signal.aborted) throw new Error('Operation aborted');
                    attempts++;
                    const response = await abortable(this.#fetch(MARKET_URLS[this.market] + path, {
                        method, headers: {
                            'Content-Type': 'application/json;charset=UTF-8', 'dropi-integration-key': this.#apiKey,
                            // Chile integration requests require this marker; no WordPress runtime is needed.
                            'User-Agent': 'dropi-client/0.1.0 (WordPress integration protocol)',
                        },
                        ...(encoded === undefined ? {} : { body: encoded }), redirect: 'error', signal,
                    }), signal);
                    if (!response.ok) {
                        const after = retryAfter(response.headers.get('Retry-After'));
                        void response.body?.cancel().catch(() => {});
                        throw fail('HTTP_ERROR', { status: response.status, ...(after === undefined ? {} : { retryAfterMs: after }) });
                    }
                    if (response.redirected) throw fail('PROTOCOL_ERROR');
                    const decoded = await this.#json(response, signal, fail);
                    if (!object(decoded) || typeof decoded.isSuccess !== 'boolean') throw fail('PROTOCOL_ERROR');
                    if (!decoded.isSuccess) throw fail('API_ERROR');
                    if (!validate(decoded)) throw fail('PROTOCOL_ERROR');
                    return decoded as T;
                } catch (caught) {
                    const error = normalize(caught);
                    const retryable = error.code === 'TRANSPORT_ERROR' || (error.code === 'HTTP_ERROR' && [429, 502, 503, 504].includes(error.status ?? 0));
                    if (!read || !retryable || attempts > this.#maxRetries) throw error;
                    const wait = error.retryAfterMs ?? this.#retryDelayMs * 2 ** (attempts - 1);
                    if (!Number.isFinite(wait) || wait >= deadline - Date.now()) throw error;
                    try { await delay(wait, signal); }
                    catch (aborted) { throw normalize(aborted); }
                }
            }
        } finally { clearTimeout(timer); }
    }

    async #json(response: Response, signal: AbortSignal, fail: (code: DropiErrorCode) => DropiError): Promise<unknown> {
        const length = response.headers.get('Content-Length');
        if (length !== null && /^\d+$/.test(length) && Number(length) > this.#maxResponseBytes) {
            void response.body?.cancel().catch(() => {});
            throw fail('RESPONSE_TOO_LARGE');
        }
        if (!response.body) throw fail('PROTOCOL_ERROR');
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let total = 0;
        let done = false;
        try {
            for (;;) {
                const part = await abortable(reader.read(), signal);
                if (part.done) { done = true; break; }
                total += part.value.byteLength;
                if (total > this.#maxResponseBytes) throw fail('RESPONSE_TOO_LARGE');
                chunks.push(part.value);
            }
        } finally {
            if (!done) void reader.cancel().catch(() => {});
            reader.releaseLock();
        }
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; }
        catch { throw fail('PROTOCOL_ERROR'); }
    }
}
