import {
    DropiClient, DropiError, type CreateOrderRequest, type CreatedOrder, type DropiAcknowledgement, type DropiPrice,
    type DropiProduct, type DropiResponse, type ProductPage,
} from '../dist/index.js';

function expectType<T>(_value: T): void {}

const client = new DropiClient({ apiKey: 'synthetic-type-test-key', market: 'CL' });
expectType<Promise<DropiResponse<DropiProduct[]>>>(client.products.list({ pageSize: 1 }));
expectType<Promise<DropiResponse<DropiProduct>>>(client.products.get(1));
expectType<AsyncGenerator<ProductPage>>(client.products.pages({ startData: 20 }));
expectType<AsyncGenerator<DropiProduct>>(client.products.iterate());
const product: DropiProduct = { id: 1, sale_price: '2500', suggested_price: null };
expectType<DropiPrice | undefined>(product.sale_price);

const order: CreateOrderRequest = {
    total_order: 2500, notes: '', name: 'Synthetic', surname: 'Customer',
    dir: 'Synthetic address', country: 'CL', state: 'Synthetic state', city: 'Synthetic city',
    phone: 'synthetic-phone', client_email: 'customer@example.invalid', payment_method_id: 1,
    status: 'PENDIENTE CONFIRMACION', type: 'FINAL_ORDER', rate_type: 'SIN RECAUDO',
    products: [{ id: 1, quantity: 1, price: 2500 }], calculate_costs_and_shiping: true,
    supplier_id: 1, shop_order_id: 1, create_product_if_not_exist: false,
};
expectType<Promise<DropiAcknowledgement<CreatedOrder>>>(client.orders.create(order));
client.imports.markImported({ products_id: 1, imported_to_store: true, woocomerse_id: 2, woocomerse_url: 'synthetic' });
const error = new DropiError({ code: 'TIMEOUT', method: 'POST', path: 'orders/myorders', attempts: 1, mutationOutcome: 'unknown' });
expectType<'not-applicable' | 'unknown' | 'rejected'>(error.mutationOutcome);

// These are compilation assertions only; this file is never executed.
// @ts-expect-error unsupported market
new DropiClient({ apiKey: 'synthetic', market: 'ZZ' });
// @ts-expect-error no arbitrary authenticated URL surface
new DropiClient({ apiKey: 'synthetic', baseUrl: 'https://example.invalid' });
// @ts-expect-error order requests require the provider fields supplied by the caller
client.orders.create({ products: [] });
// @ts-expect-error provider pagination uses a row offset rather than a page number
client.products.list({ page: 2 });
// @ts-expect-error import marker preserves the actual provider wire spelling
client.imports.markImported({ products_id: 1, imported_to_store: true, woocomerse_id: 2, woocomerse_url: 'synthetic', product_id: 1 });
