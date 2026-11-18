// Sincronização do CRM com os pedidos do PDV no Supabase.
// Usa a service role apenas no servidor; nunca envie esta chave ao navegador.
const db = require('./db');
const { importOrders } = require('./core');

const URL_ = (process.env.PDV_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.PDV_SUPABASE_SECRET_KEY || process.env.SUPABASE_SECRET_KEY || process.env.PDV_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SCHEMA = require('./brand').pdv.schema;   // brand.json (pdv.schema) ou PDV_SUPABASE_SCHEMA
const DAY = 864e5;
const configured = () => !!(URL_ && KEY);
const cents = (value) => Number(value || 0) / 100;
const isTestOrder = (order) => order.app_data?.production_test === true
  || /^PEDIDO DE TESTE\b/i.test(String(order.app_data?.customer_label || '').trim())
  || /Developer Portal/i.test(String(order.notes || ''));

async function request(table, params = new URLSearchParams()) {
  if (!configured()) throw new Error('Configure PDV_SUPABASE_URL e PDV_SUPABASE_SERVICE_ROLE_KEY.');
  const response = await fetch(`${URL_}/rest/v1/${table}?${params}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Accept-Profile': SCHEMA },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`PDV/Supabase ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

async function pages(table, params) {
  const all = [];
  for (let offset = 0; ; offset += 1000) {
    const pageParams = new URLSearchParams(params);
    pageParams.set('limit', '1000'); pageParams.set('offset', String(offset));
    const page = await request(table, pageParams);
    all.push(...page);
    if (page.length < 1000) return all;
  }
}

async function byIds(table, select, column, ids) {
  const result = [], unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 50) {
    const params = new URLSearchParams({ select });
    params.set(column, `in.(${unique.slice(i, i + 50).join(',')})`);
    result.push(...await request(table, params));
  }
  return result;
}

function saveItems(orders, items) {
  const crmOrders = new Map();
  for (const order of orders) {
    const row = db.prepare('SELECT id FROM orders WHERE external_id = ?').get(`pdv:${order.id}`);
    if (row) crmOrders.set(order.id, row.id);
  }
  const find = db.prepare('SELECT id FROM order_items WHERE item_id = ?');
  const insert = db.prepare('INSERT INTO order_items (order_id, item_id, product_key, name, quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?) RETURNING id');
  const update = db.prepare('UPDATE order_items SET order_id = ?, product_key = ?, name = ?, quantity = ?, unit_price = ? WHERE id = ?');
  const clearChoices = db.prepare('DELETE FROM item_choices WHERE item_id = ?');
  const insertChoice = db.prepare('INSERT INTO item_choices (item_id, choice_key, name, extra) VALUES (?, ?, ?, ?)');
  let saved = 0;
  db.exec('BEGIN');
  try {
    for (const item of items) {
      const orderId = crmOrders.get(item.order_id);
      if (!orderId) continue;
      const itemKey = `pdv:${item.id}`, productKey = String(item.product_id || item.name || item.id), existing = find.get(itemKey);
      const itemId = existing
        ? (update.run(orderId, productKey, item.name || 'Item', Number(item.quantity || 0), cents(item.unit_price), existing.id), existing.id)
        : insert.get(orderId, itemKey, productKey, item.name || 'Item', Number(item.quantity || 0), cents(item.unit_price)).id;
      clearChoices.run(itemId);
      const options = Array.isArray(item.options) ? item.options.filter((option) => option && typeof option === 'object') : [];
      for (const [index, option] of options.entries())
        insertChoice.run(itemId, String(option.id || option.name || `${item.id}:${index}`), String(option.name || 'Opção'), cents(option.price));
      saved += 1;
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return saved;
}

const normalizedPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.startsWith('55') ? digits : `55${digits}`;
};

// Mantem a ficha de clientes do CRM alinhada com o cadastro operacional do PDV.
// Na primeira execucao faz o backfill completo; depois atualiza apenas os clientes
// presentes na janela incremental de pedidos.
async function syncCustomerProfiles(customerIds = null) {
  const full = customerIds === null;
  const customers = full
    ? await pages('customers', new URLSearchParams({ select: 'id,name,email,birth_date,app_data' }))
    : await byIds('customers', 'id,name,email,birth_date,app_data', 'id', customerIds);
  if (!customers.length) return { fetched: 0, updated: 0, withAddress: 0, full };
  const ids = customers.map((customer) => customer.id);
  const [phones, addresses, districts] = await Promise.all([
    full ? pages('customer_phones', new URLSearchParams({ select: 'customer_id,phone,sort_order' }))
      : byIds('customer_phones', 'customer_id,phone,sort_order', 'customer_id', ids),
    full ? pages('customer_addresses', new URLSearchParams({ select: 'customer_id,street,number,complement,reference,district_id,is_default' }))
      : byIds('customer_addresses', 'customer_id,street,number,complement,reference,district_id,is_default', 'customer_id', ids),
    request('delivery_districts', new URLSearchParams({ select: 'id,name' })),
  ]);
  const phoneByCustomer = new Map();
  for (const phone of phones.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)))
    if (!phoneByCustomer.has(phone.customer_id)) phoneByCustomer.set(phone.customer_id, normalizedPhone(phone.phone));
  const addressByCustomer = new Map();
  for (const address of addresses.sort((a, b) => Number(b.is_default) - Number(a.is_default)))
    if (!addressByCustomer.has(address.customer_id)) addressByCustomer.set(address.customer_id, address);
  const districtById = new Map(districts.map((district) => [district.id, district.name]));
  const byExternal = db.prepare('SELECT id FROM customers WHERE external_id = ?');
  const byPhone = db.prepare('SELECT id FROM customers WHERE phone = ?');
  const update = db.prepare(`UPDATE customers SET name = COALESCE(?, name), email = COALESCE(?, email),
    birth_date = COALESCE(?, birth_date), address = ?, address_number = ?, address_complement = ?,
    address_reference = ?, district = ? WHERE id = ?`);
  let updated = 0, withAddress = 0;
  db.exec('BEGIN');
  try {
    for (const customer of customers) {
      const oldKey = customer.app_data?.crm_external_id;
      const local = byExternal.get(`pdv:${customer.id}`)
        || (oldKey != null ? byExternal.get(String(oldKey)) : null)
        || (phoneByCustomer.get(customer.id) ? byPhone.get(phoneByCustomer.get(customer.id)) : null);
      if (!local) continue;
      const address = addressByCustomer.get(customer.id);
      if (address?.street) withAddress += 1;
      update.run(customer.name || null, customer.email || null, customer.birth_date || null,
        address?.street || null, address?.number || null, address?.complement || null,
        address?.reference || null, districtById.get(address?.district_id) || null, local.id);
      updated += 1;
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return { fetched: customers.length, updated, withAddress, full };
}

async function sync({ days } = {}) {
  // Cursor novo: a data de atualização muda quando o webhook confirma o pagamento.
  // Usar created_at faria um pedido antigo, pago mais tarde, nunca chegar ao CRM.
  const savedCursor = db.prepare("SELECT value FROM meta WHERE key = 'pdv_paid_sync_cursor_v2'").get()?.value;
  const backfillDays = Math.max(1, Number(days || process.env.PDV_BACKFILL_DAYS || 400));
  const start = savedCursor ? new Date(new Date(savedCursor).getTime() - 3 * DAY) : new Date(Date.now() - backfillDays * DAY);
  const orderParams = new URLSearchParams({ select: '*', order: 'updated_at.asc' });
  orderParams.set('payment_status', 'eq.paid');
  orderParams.set('canceled', 'eq.false');
  orderParams.set('updated_at', `gte.${start.toISOString()}`);
  const orders = await pages('orders', orderParams);
  const needsFullProfiles = !db.prepare("SELECT value FROM meta WHERE key = 'pdv_customer_profiles_v1'").get();
  if (!orders.length) {
    const profiles = needsFullProfiles ? await syncCustomerProfiles() : { fetched: 0, updated: 0, withAddress: 0, full: false };
    if (needsFullProfiles) db.prepare("INSERT INTO meta (key, value) VALUES ('pdv_customer_profiles_v1', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(new Date().toISOString());
    return { added: 0, skipped: 0, fetched: 0, itens: 0, perfis: profiles, source: 'pdv' };
  }
  const customerIds = orders.map((order) => order.customer_id).filter(Boolean), orderIds = orders.map((order) => order.id);
  const [customers, phones, items, payments, districts] = await Promise.all([
    byIds('customers', 'id,name,email,birth_date', 'id', customerIds),
    byIds('customer_phones', 'customer_id,phone,sort_order', 'customer_id', customerIds),
    byIds('order_items', '*', 'order_id', orderIds),
    byIds('payments', 'order_id,method,status,amount', 'order_id', orderIds),
    request('delivery_districts', new URLSearchParams({ select: 'id,name' })),
  ]);
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const phoneByCustomer = new Map(phones.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)).map((phone) => [phone.customer_id, phone.phone]));
  const paymentsByOrder = new Map();
  for (const payment of payments.filter((row) => ['paid', 'paid_online'].includes(String(row.status).toLowerCase()))) {
    if (!paymentsByOrder.has(payment.order_id)) paymentsByOrder.set(payment.order_id, []);
    paymentsByOrder.get(payment.order_id).push(payment.method);
  }
  const districtById = new Map(districts.map((district) => [district.id, district.name]));
  // A API já filtra, mas a validação local evita contabilizar dados indevidos se
  // um proxy ou mock ignorar os filtros. Pedidos de homologação também não viram receita.
  const active = orders.filter((order) => order.payment_status === 'paid' && !order.canceled
    && !['cancel', 'canceled', 'cancelled'].includes(String(order.status).toLowerCase()) && !isTestOrder(order));
  const mapped = active.map((order) => {
    const customer = customerById.get(order.customer_id) || {}, methods = [...new Set(paymentsByOrder.get(order.id) || [])];
    return {
      external_id: `pdv:${order.id}`, name: customer.name || order.app_data?.customer_label || 'Sem cliente identificado',
      phone: phoneByCustomer.get(order.customer_id) || null, customer_key: order.customer_id ? `pdv:${order.customer_id}` : null,
      email: customer.email || null, birth: customer.birth_date || null, total: cents(order.total), created_at: order.created_at,
      detalhes: { channel: order.external_source || order.channel || 'pdv', sale_type: order.channel === 'delivery' ? 1 : order.channel === 'pickup' ? 2 : null,
        items_total: cents(order.items_total), discount: cents(order.discount), increase: cents(Number(order.increase || 0) + Number(order.service_fee || 0)),
        coupon: order.app_data?.coupon || null, delivery_fee: cents(order.delivery_fee), district: districtById.get(order.delivery?.district_id) || null,
        payment: methods.length ? methods.join(', ') : null },
    };
  });
  const imported = importOrders(mapped), savedItems = saveItems(active, items);
  const profiles = await syncCustomerProfiles(needsFullProfiles ? null : customerIds);
  if (needsFullProfiles) db.prepare("INSERT INTO meta (key, value) VALUES ('pdv_customer_profiles_v1', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(new Date().toISOString());
  const maxCursor = orders.reduce((max, order) => order.updated_at > max ? order.updated_at : max, savedCursor || '');
  db.prepare("INSERT INTO meta (key, value) VALUES ('pdv_paid_sync_cursor_v2', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(maxCursor);
  return { ...imported, fetched: orders.length, ignored: orders.length - active.length, itens: savedItems,
    vendas: active.length, perfis: profiles, source: 'pdv', paidOnly: true };
}

module.exports = { configured, sync, syncCustomerProfiles, isTestOrder };
