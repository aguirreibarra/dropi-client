import { DropiClient, DropiError } from '../dist/index.js';

const apiKey = process.env.DROPI_API_KEY;
if (!apiKey) throw new Error('Export DROPI_API_KEY before running this example.');
const client = new DropiClient({ apiKey, market: process.env.DROPI_MARKET ?? 'CL' });

try {
    const startData = Number(process.env.DROPI_START_DATA ?? 0);
    for await (const page of client.products.pages({ startData, pageSize: 20 })) {
        // Replace this metadata summary with your own processing and durable checkpoint.
        console.log(JSON.stringify({ received: page.items.length, nextStartData: page.nextStartData }));
    }
} catch (error) {
    if (error instanceof DropiError) console.error(JSON.stringify({ code: error.code, status: error.status, retryAfterMs: error.retryAfterMs }));
    else console.error('Catalog example failed; check configuration.');
    process.exitCode = 1;
}
