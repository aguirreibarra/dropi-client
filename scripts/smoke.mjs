import { DropiClient, DropiError } from '../dist/index.js';

if (process.env.DROPI_LIVE_SMOKE !== '1') {
    console.error('Set DROPI_LIVE_SMOKE=1 to explicitly enable read-only provider verification.');
    process.exit(2);
}
if (!process.env.DROPI_API_KEY) {
    console.error('Export DROPI_API_KEY before running live verification.');
    process.exit(2);
}

try {
    const client = new DropiClient({ apiKey: process.env.DROPI_API_KEY, market: process.env.DROPI_MARKET ?? 'CL' });
    const catalog = await client.products.list({ pageSize: 1 });
    const detail = catalog.objects[0] ? await client.products.get(catalog.objects[0].id) : null;
    const categories = await client.categories.list();
    const warehouses = await client.warehouses.list();
    console.log(JSON.stringify({
        ok: true, market: client.market, catalogRows: catalog.objects.length,
        detailRead: detail !== null, categoryRows: categories.objects.length,
        warehouseRows: warehouses.objects.length, mutations: 0,
    }));
} catch (error) {
    console.error(JSON.stringify(error instanceof DropiError
        ? { ok: false, code: error.code, status: error.status, path: error.path, mutations: 0 }
        : { ok: false, code: 'CONFIGURATION_ERROR', mutations: 0 }));
    process.exitCode = 1;
}
