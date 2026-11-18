'use strict';
const path = require('node:path'), fs = require('node:fs'), os = require('node:os');
const root = path.resolve(process.argv[2]);
process.env.DB_PATH = path.join(os.tmpdir(), `pdv_paid_test_${process.pid}.db`);
fs.rmSync(process.env.DB_PATH, { force: true });
Object.assign(process.env, { PDV_SUPABASE_URL: 'https://teste.supabase.co', PDV_SUPABASE_SECRET_KEY: 'sb_secret_teste', PDV_BACKFILL_DAYS: '30' });

const orders = [
  { id: 'pago', customer_id: 'c1', customer: {}, delivery: { district_id: 'd1' }, total: 5000, items_total: 4500, delivery_fee: 500, service_fee: 0, discount: 0, increase: 0, payment_status: 'paid', canceled: false, status: 'production', channel: 'delivery', external_source: 'cardapio_digital', notes: '', app_data: {}, created_at: '2026-11-10T12:00:00Z', updated_at: '2026-11-12T12:05:00Z' },
  { id: 'pendente', customer_id: 'c1', customer: {}, delivery: {}, total: 1000, items_total: 1000, delivery_fee: 0, service_fee: 0, discount: 0, increase: 0, payment_status: 'pending', canceled: false, status: 'production', channel: 'pickup', notes: '', app_data: {}, created_at: '2026-11-12T12:00:00Z', updated_at: '2026-11-12T12:05:00Z' },
  { id: 'teste', customer_id: 'c1', customer: {}, delivery: {}, total: 500, items_total: 500, delivery_fee: 0, service_fee: 0, discount: 0, increase: 0, payment_status: 'paid', canceled: false, status: 'production', channel: 'pickup', notes: 'Gerado automaticamente pelo Developer Portal', app_data: {}, created_at: '2026-11-12T12:00:00Z', updated_at: '2026-11-12T12:05:00Z' },
];
const tables = {
  orders,
  customers: [{ id: 'c1', name: 'Ana', email: 'ana@example.com', birth_date: null }],
  customer_phones: [{ customer_id: 'c1', phone: '24999990001', sort_order: 0 }],
  order_items: [{ id: 'i1', order_id: 'pago', product_id: 'prod-1', name: 'Cento', quantity: 1, unit_price: 4500, options: [{ id: 'molho', name: 'Molho verde', price: 200 }] }],
  payments: [{ order_id: 'pago', method: 'Pix online', status: 'paid', amount: 5000 }, { order_id: 'pendente', method: 'Crédito', status: 'pending', amount: 1000 }],
  delivery_districts: [{ id: 'd1', name: 'Centro' }],
};
const calls = [];
global.fetch = async (url, options) => {
  calls.push({ url: new URL(url), headers: options.headers });
  const table = new URL(url).pathname.split('/').pop();
  return new Response(JSON.stringify(tables[table] || []), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

(async () => {
  const db = require(path.join(root, 'db.js')), pdv = require(path.join(root, 'pdv.js'));
  const ok = (condition, message) => console.log((condition ? 'OK   ' : 'FALHOU ') + message);
  const result = await pdv.sync({ days: 30 });
  ok(result.added === 1 && result.paidOnly === true, 'somente o pedido pago real entra no CRM');
  ok(!db.prepare("SELECT 1 FROM orders WHERE external_id='pdv:pendente'").get(), 'pedido pendente não entra');
  ok(!db.prepare("SELECT 1 FROM orders WHERE external_id='pdv:teste'").get(), 'pedido de homologação não entra');
  const order = db.prepare("SELECT * FROM orders WHERE external_id='pdv:pago'").get();
  ok(order.total === 50 && order.payment === 'Pix online' && order.district === 'Centro', 'valores, pagamento e bairro são preservados');
  ok(calls.find(call => call.url.pathname.endsWith('/orders')).url.searchParams.get('payment_status') === 'eq.paid', 'a própria consulta ao Supabase filtra payment_status=paid');
  ok(calls.find(call => call.url.pathname.endsWith('/orders')).url.searchParams.has('updated_at'), 'cursor usa updated_at para encontrar pagamento confirmado depois');
  ok(calls.every(call => call.headers.Authorization === 'Bearer sb_secret_teste'), 'a chave secreta fica no backend');
  db.close(); fs.rmSync(process.env.DB_PATH, { force: true });
})().catch(error => { console.error('FALHOU', error); process.exitCode = 1; });
