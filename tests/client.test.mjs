import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { DropiClient, DropiError, MARKET_URLS } from '../dist/index.js';

const key = 'synthetic-test-key';
const product = { id: 1, name: 'Synthetic product', sale_price: '2500', suggested_price: 1 };
const envelope = (objects, extra = {}) => ({ isSuccess: true, objects, ...extra });
const json = (value, init) => new Response(JSON.stringify(value), init);
const client = (fetch, options = {}) => new DropiClient({ apiKey: key, fetch, maxRetries: 0, ...options });

test('catalog uses the integration header and preserves both raw prices and descriptions', async () => {
    let sent;
    const row = { ...product, description: '<p>First</p>\n<p>Second</p>', sale_price: '0.50', stock: null, extra: { future: true } };
    const api = client(async (url, init) => { sent = { url, init }; return json(envelope([row], { count: 9999 })); });
    const result = await api.products.list({ startData: 4, pageSize: 2, category: 3, stockmayor: 1 });
    assert.deepEqual(result.objects, [row]);
    assert.equal(result.count, 9999);
    assert.equal(sent.url, 'https://api.dropi.cl/integrations/products/index');
    assert.equal(sent.init.method, 'POST');
    assert.equal(new Headers(sent.init.headers).get('dropi-integration-key'), key);
    assert.equal(new Headers(sent.init.headers).get('user-agent'), 'dropi-client/0.1.0 (WordPress integration protocol)');
    assert.equal(sent.init.redirect, 'error');
    assert.deepEqual(JSON.parse(sent.init.body), {
        startData: 4, pageSize: 2, order_type: 'asc', order_by: 'id', keywords: '',
        active: true, no_count: true, integration: true, category: 3, stockmayor: 1,
    });
});

test('all plugin-derived markets and their catalog differences are explicit', async () => {
    assert.equal(Object.keys(MARKET_URLS).length, 10);
    for (const market of Object.keys(MARKET_URLS)) {
        let sent;
        await client(async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return json(envelope([])); }, { market }).products.list();
        assert.equal(sent.url, MARKET_URLS[market] + 'products/index');
        assert.equal('integration' in sent.body, market !== 'ES');
        assert.equal('get_stock' in sent.body, ['CO', 'PY', 'PE', 'PA'].includes(market));
    }
});

test('detail, legacy stock, categories and warehouses use their exact read paths', async () => {
    const calls = [];
    const api = client(async (url, init) => {
        calls.push([url, init.method, init.body]);
        return json(envelope(url.includes('products/') ? product : [{ id: 7, name: 'Synthetic' }]));
    });
    assert.equal((await api.products.get(1)).objects.id, 1);
    assert.equal((await api.products.getLegacy(1)).objects.id, 1);
    await api.categories.list();
    await api.warehouses.list();
    assert.deepEqual(calls.map(([url, method, body]) => [url.replace(MARKET_URLS.CL, ''), method, body]), [
        ['products/v2/1', 'GET', undefined], ['products/1', 'GET', undefined],
        ['categories/', 'GET', undefined], ['warehouses/', 'GET', undefined],
    ]);
});

test('unsafe identifiers, invalid market/key and invalid limits fail before I/O', async () => {
    const api = client(() => assert.fail('unexpected I/O'));
    for (const id of ['../orders', 'https://evil.example', '', 0, NaN]) await assert.rejects(api.products.get(id), TypeError);
    for (const options of [{ apiKey: '' }, { apiKey: 'a\nb' }, { apiKey: key, market: 'ZZ' }, { apiKey: key, timeoutMs: 0 }, { apiKey: key, maxRetries: -1 }]) {
        assert.throws(() => new DropiClient(options), TypeError);
    }
    await assert.rejects(api.products.list({ pageSize: 0 }), TypeError);
    await assert.rejects(api.products.list({ startData: -1 }), TypeError);
});

test('index and detail variant schemas remain intact without lossy hydration', async () => {
    const indexed = { ...product, variations: [{ id: 2, attribute_values: [{ attribute_name: '123', value: '002' }] }] };
    const detailed = { ...product, sale_price: null, variations: [{ id: 2, attribute_values: [{ attribute: { description: '123' }, value: '002' }] }] };
    const api = client(async (url) => json(envelope(url.includes('/v2/') ? detailed : [indexed])));
    assert.deepEqual((await api.products.list()).objects[0], indexed);
    assert.deepEqual((await api.products.get(1)).objects, detailed);
});

test('page iterator advances actual offsets through short pages and duplicates until an empty array', async () => {
    const offsets = [];
    const rows = [[product], [{ ...product, id: 2 }, { ...product, id: 2 }], []];
    const api = client(async (_url, init) => { offsets.push(JSON.parse(init.body).startData); return json(envelope(rows.shift(), { count: 1 })); });
    const pages = [];
    for await (const page of api.products.pages({ pageSize: 20, startData: 10 })) pages.push(page);
    assert.deepEqual(offsets, [10, 11, 13]);
    assert.deepEqual(pages.map(p => [p.startData, p.nextStartData, p.items.length]), [[10, 11, 1], [11, 13, 2]]);
});

test('item iterator streams items and exposes a caller-controlled page bound', async () => {
    let calls = 0;
    const api = client(async () => json(envelope(calls++ === 0 ? [product] : [])));
    const result = [];
    for await (const row of api.products.iterate()) result.push(row);
    assert.deepEqual(result, [product]);
    const endless = client(async (_u, init) => json(envelope([{ ...product, id: JSON.parse(init.body).startData + 1 }])));
    await assert.rejects(async () => { for await (const _ of endless.products.pages({ maxPages: 1 })) {} }, e => e.code === 'PAGINATION_LIMIT');
});

test('identical duplicate pages are preserved until an actual empty page', async () => {
    const rows = [[product], [product], []];
    const api = client(async () => json(envelope(rows.shift())));
    const received = [];
    for await (const page of api.products.pages()) received.push(...page.items);
    assert.deepEqual(received, [product, product]);
});

test('duplicate identities with changed payloads do not hide later rows', async () => {
    const rows = [[{ id: 1, stock: 1 }], [{ id: 1, stock: 2 }], [{ id: 2, stock: 3 }], []];
    const api = client(async () => json(envelope(rows.shift())));
    const received = [];
    for await (const page of api.products.pages()) received.push(...page.items);
    assert.deepEqual(received, [{ id: 1, stock: 1 }, { id: 1, stock: 2 }, { id: 2, stock: 3 }]);
});

test('oversized pages reduce page size only in the page iterator, without advancing offset', async () => {
    const sent = [];
    let i = 0;
    const api = client(async (_url, init) => {
        sent.push(JSON.parse(init.body));
        if (i++ === 0) return new Response('x'.repeat(300));
        return json(envelope(i === 2 ? [product] : []));
    }, { maxResponseBytes: 200 });
    for await (const _ of api.products.pages({ pageSize: 4 })) {}
    assert.deepEqual(sent.map(x => [x.startData, x.pageSize]), [[0, 4], [0, 2], [1, 2]]);
});

test('the page-query bound includes oversized page attempts', async () => {
    let calls = 0;
    const api = client(async () => { calls++; return new Response('x'.repeat(300)); }, { maxResponseBytes: 100 });
    await assert.rejects(async () => { for await (const _ of api.products.pages({ pageSize: 4, maxPages: 1 })) {} }, e => e.code === 'PAGINATION_LIMIT');
    assert.equal(calls, 1);
});

test('explicit import marker and order creation preserve wire keys and are never implicit reads', async () => {
    const sent = [];
    const api = client(async (url, init) => { sent.push([url, init.method, JSON.parse(init.body)]); return json(envelope({ id: 9 })); });
    const marker = { products_id: 1, imported_to_store: true, woocomerse_id: 2, woocomerse_url: 'synthetic-product' };
    const order = { total_order: 2500, products: [{ id: 1, quantity: 1, price: 2500 }], shop_order_id: 123 };
    await api.imports.markImported(marker);
    assert.equal((await api.orders.create(order)).objects.id, 9);
    assert.deepEqual(sent.map(([u, m, b]) => [u.replace(MARKET_URLS.CL, ''), m, b]), [
        ['importlist/importstore/1', 'PUT', marker], ['orders/myorders', 'POST', order],
    ]);
});

for (const status of [429, 502, 503, 504]) {
    test(`read-only POST retries HTTP ${status}`, async () => {
        let calls = 0;
        const api = client(async () => ++calls === 1 ? new Response('', { status, headers: { 'Retry-After': '0' } }) : json(envelope([])), { maxRetries: 1, retryDelayMs: 0 });
        await api.products.list();
        assert.equal(calls, 2);
    });
}

test('read retries transport errors, but HTTP 401 and provider refusals are terminal', async () => {
    let calls = 0;
    await client(async () => { if (++calls === 1) throw new Error('unsafe transport detail'); return json(envelope([])); }, { maxRetries: 1, retryDelayMs: 0 }).products.list();
    assert.equal(calls, 2);
    for (const response of [new Response('', { status: 401 }), json({ isSuccess: false, message: key, objects: [] })]) {
        calls = 0;
        await assert.rejects(client(async () => { calls++; return response; }, { maxRetries: 2 }).products.list(), DropiError);
        assert.equal(calls, 1);
    }
});

test('Retry-After beyond the remaining deadline is returned without retrying early', async () => {
    for (const header of ['60', new Date(Date.now() + 120_000).toUTCString()]) {
        let calls = 0;
        await assert.rejects(client(async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': header } }); }, { maxRetries: 2, timeoutMs: 100 }).products.list(), e => e.status === 429 && e.retryAfterMs > 100);
        assert.equal(calls, 1);
    }
});

for (const operation of ['orders', 'imports']) {
    for (const failure of ['http', 'network', 'malformed', 'provider']) {
        test(`${operation} never retries ${failure} failures`, async () => {
            let calls = 0;
            const api = client(async () => {
                calls++;
                if (failure === 'network') throw new Error(key);
                if (failure === 'http') return new Response('', { status: 503 });
                if (failure === 'malformed') return new Response('{');
                return json({ isSuccess: false, objects: null, message: key });
            }, { maxRetries: 3, retryDelayMs: 0 });
            const promise = operation === 'orders' ? api.orders.create({ products: [{ id: 1 }] }) : api.imports.markImported({ products_id: 1 });
            await assert.rejects(promise, e => e instanceof DropiError && e.mutationOutcome === (failure === 'provider' ? 'rejected' : 'unknown'));
            assert.equal(calls, 1);
        });
    }
}

for (const response of [
    () => new Response('{'),
    () => json({ isSuccess: true }),
    () => json(envelope(null)),
    () => json(envelope({ id: 1 })),
    () => json(envelope([{}])),
    () => new Response(new Uint8Array([0xc3, 0x28])),
]) {
    test('malformed envelopes and UTF-8 cannot be mistaken for empty catalogs', async () => {
        await assert.rejects(client(async () => response()).products.list(), e => e.code === 'PROTOCOL_ERROR');
    });
}

test('response limits cover both Content-Length and streamed bytes', async () => {
    for (const response of [new Response('x', { headers: { 'Content-Length': '1000' } }), new Response('x'.repeat(300))]) {
        await assert.rejects(client(async () => response, { maxResponseBytes: 100 }).products.list(), e => e.code === 'RESPONSE_TOO_LARGE');
    }
});

test('timeout covers body consumption as well as fetch', async () => {
    let cancelled = false;
    const response = new Response(new ReadableStream({ pull() {}, cancel() { cancelled = true; } }));
    await assert.rejects(client(async () => response, { timeoutMs: 20 }).products.list(), e => e.code === 'TIMEOUT');
    assert.equal(cancelled, true);
});

test('mutation timeout stays uncertain and sends exactly one request', async () => {
    let calls = 0;
    const api = client(async () => { calls++; return new Response(new ReadableStream({ pull() {} })); }, { timeoutMs: 20, maxRetries: 3 });
    await assert.rejects(api.orders.create({ products: [{ id: 1 }] }), e => e.code === 'TIMEOUT' && e.mutationOutcome === 'unknown');
    assert.equal(calls, 1);
});

test('caller cancellation stops reads, waits and subsequent pages', async () => {
    const abort = new AbortController();
    let calls = 0;
    const api = client(async () => { calls++; return new Response('', { status: 503 }); }, { maxRetries: 2, retryDelayMs: 1000 });
    const promise = api.products.list({}, { signal: abort.signal });
    setTimeout(() => abort.abort(new Error(key)), 10);
    await assert.rejects(promise, e => e.code === 'ABORTED');
    assert.equal(calls, 1);
    await assert.rejects(api.products.list({}, { signal: abort.signal }), e => e.code === 'ABORTED');
    assert.equal(calls, 1);
});

test('redirects are refused even with a custom fetch that returns a 3xx response', async () => {
    let calls = 0;
    await assert.rejects(client(async () => { calls++; return new Response('', { status: 302, headers: { location: 'https://evil.example/' } }); }).products.list(), e => e.status === 302);
    assert.equal(calls, 1);
});

test('credentials and provider bodies are absent from errors, JSON and object inspection', async () => {
    const api = client(async () => json({ isSuccess: false, objects: null, message: key, error: { secret: key } }));
    assert.ok(!inspect(api, { showHidden: true }).includes(key));
    assert.ok(!JSON.stringify(api).includes(key));
    await assert.rejects(api.products.list(), e => {
        assert.ok(![String(e), e.stack, inspect(e, { showHidden: true }), JSON.stringify(e)].some(s => s.includes(key)));
        assert.equal(e.code, 'API_ERROR');
        return true;
    });
});

test('repeating provider data reaches the explicit bound without claiming completion', async () => {
    let calls = 0;
    const api = client(async () => json(envelope([{ ...product, id: calls++ % 2 + 1 }])));
    await assert.rejects(async () => { for await (const _ of api.products.pages({ maxPages: 3 })) {} }, e => e.code === 'PAGINATION_LIMIT');
    assert.equal(calls, 3);
});

test('timeout configuration refuses values that would overflow Node timers', () => {
    assert.throws(() => client(() => assert.fail(), { timeoutMs: 2 ** 31 }), TypeError);
});

test('aborting between pages prevents the next provider request', async () => {
    const abort = new AbortController();
    let calls = 0;
    const api = client(async () => { calls++; return json(envelope([product])); });
    const pages = api.products.pages({}, { signal: abort.signal });
    assert.equal((await pages.next()).value.items.length, 1);
    abort.abort();
    await assert.rejects(pages.next(), e => e.code === 'ABORTED');
    assert.equal(calls, 1);
});

test('real fetch serializes requests and refuses redirect credential forwarding', async context => {
    const received = [];
    const server = createServer(async (request, response) => {
        let body = '';
        for await (const chunk of request) body += chunk;
        received.push({ path: request.url, key: request.headers['dropi-integration-key'], body });
        if (request.url === '/integrations/categories/') {
            response.writeHead(302, { Location: '/credential-sink' });
            response.end();
        } else {
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify(envelope([product])));
        }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    context.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const api = client((url, init) => fetch(origin + new URL(url).pathname, init));
    assert.deepEqual((await api.products.list({ pageSize: 1 })).objects, [product]);
    assert.equal(received[0].key, key);
    assert.equal(JSON.parse(received[0].body).pageSize, 1);
    await assert.rejects(api.categories.list(), e => e.code === 'TRANSPORT_ERROR');
    assert.deepEqual(received.map(x => x.path), ['/integrations/products/index', '/integrations/categories/']);
});

for (const operation of ['orders', 'imports']) {
    test(`${operation} accepts a successful acknowledgement with optional objects and identity`, async () => {
        for (const reply of [{ isSuccess: true, message: 'acknowledged' }, { isSuccess: true, objects: {} }]) {
            const api = client(async () => json(reply));
            const result = operation === 'orders' ? await api.orders.create({ products: [{ id: 1 }] }) : await api.imports.markImported({ products_id: 1 });
            assert.deepEqual(result, reply);
        }
    });
}

test('deadline terminates a noncooperative fetch and never retries an uncertain write', async () => {
    for (const operation of ['read', 'write']) {
        let calls = 0;
        const api = client(async () => { calls++; return new Promise(() => {}); }, { timeoutMs: 20, maxRetries: 3 });
        const promise = operation === 'read' ? api.products.list() : api.orders.create({ products: [{ id: 1 }] });
        await assert.rejects(promise, e => e.code === 'TIMEOUT' && e.attempts === 1 && e.mutationOutcome === (operation === 'write' ? 'unknown' : 'not-applicable'));
        assert.equal(calls, 1);
    }
});
