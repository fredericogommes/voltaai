// Regras de negocio: RFV, segmentos, campanhas, atribuicao de conversao
const db = require('./db');
const { send } = require('./senders');
const products = require('./products');
const config = require('./config');

// Janela padrão (e de mensagens antigas, sem grupo). A janela de cada grupo é configurável em Ajustes.
const CONVERSION_WINDOW_DAYS = 7;

const CUSTOMER_STATS = `
  SELECT c.id, c.name, c.phone, c.email, c.opt_out, c.excluded,
         c.address, c.address_number, c.address_complement, c.address_reference, c.district,
         MAX(o.created_at) AS last_order,
         COUNT(o.id) AS n_orders,
         SUM(CASE WHEN julianday('now') - julianday(o.created_at) <= 365 THEN 1 ELSE 0 END) AS f12,   -- pedidos nos ultimos 12 meses
         COALESCE(SUM(o.total), 0) AS total,
         CAST(julianday('now') - julianday(MAX(o.created_at)) AS INTEGER) AS recency
  FROM customers c JOIN orders o ON o.customer_id = c.id
  WHERE substr(c.phone, 3, 1) <> '0'   -- DDD "0x" nao existe: sao numeros genericos (balcao, marketplace), nao clientes
  GROUP BY c.id`;

// Grupos RFV. Recencia define os dois de baixo; entre os recentes, a frequencia nos ultimos 12 meses.
// As faixas vêm de Ajustes (config.rfv); os padrões são 90 e 30 dias, 8, 4 e 2 pedidos.
const RFV_GRUPOS = config.GRUPOS;
function rfvClass(s) {
  const p = config.rfv();
  if (s.recency > p.perdidos) return 'Perdidos';
  if (s.recency >= p.risco) return 'Em risco';
  const f = s.f12 ?? s.n_orders;
  if (f >= p.campeoes) return 'Campeões';
  if (f >= p.fieis) return 'Fiéis';
  if (f >= p.lealdade) return 'Lealdade potencial';
  return 'Promissores';
}

// Clientes com o grupo RFV. Os excluídos (Ajustes > clientes fora dos relatórios) ficam de fora,
// a não ser que se peça explicitamente (ficha do cliente, lista de excluídos).
function customersWithRfv({ incluirExcluidos = false } = {}) {
  const todos = db.prepare(CUSTOMER_STATS).all().map(s => ({ ...s, rfv: rfvClass(s) }));
  return incluirExcluidos ? todos : todos.filter(c => !c.excluded);
}

// Grupo RFV atual de um cliente (para gravar junto com a mensagem enviada)
function rfvOf(customerId) {
  const s = db.prepare(`SELECT * FROM (${CUSTOMER_STATS}) WHERE id = ?`).get(customerId);
  return s ? rfvClass(s) : null;
}

// Clientes elegiveis para uma campanha (sem opt-out, dentro da faixa, fora do cooldown)
function eligible(campaign) {
  // tentativas por cliente (regra de renitencia): depois de N falhas nesta campanha, para de tentar
  let tentativas = 3;
  try { const s = typeof campaign.schedule === 'string' ? JSON.parse(campaign.schedule || '{}') : campaign.schedule; tentativas = s?.max_attempts || 3; } catch { /* usa o padrao */ }
  return db.prepare(`
    SELECT * FROM (${CUSTOMER_STATS}) s
    WHERE s.opt_out = 0 AND s.excluded = 0
      ${campaign.channel === 'email'
        ? "-- e-mail: so quem tem e-mail com cara de e-mail\n      AND s.email LIKE '%_@_%._%' AND s.email NOT LIKE '% %'"
        : "-- WhatsApp e SMS: so celular brasileiro valido: 55 + DDD (1x a 9x) + 9 + 8 digitos\n      AND s.phone GLOB '55[1-9][0-9]9[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'"}
      AND s.recency >= ? AND (? IS NULL OR s.recency <= ?)
      AND s.n_orders >= ?
      AND NOT EXISTS (
        SELECT 1 FROM messages m
        WHERE m.customer_id = s.id AND m.status = 'sent'  -- testes (dry) nao bloqueiam envio real
          AND m.campaign_id = ?
          AND julianday('now') - julianday(m.sent_at) < ?)
      AND (SELECT COUNT(*) FROM messages mf WHERE mf.customer_id = s.id AND mf.campaign_id = ? AND mf.status = 'failed') < ?
  `).all(campaign.min_days, campaign.max_days, campaign.max_days,
         campaign.min_orders, campaign.id, campaign.cooldown_days, campaign.id, tentativas);
}

// aceita {nome} (antigo) e [nome_cliente]
function render(template, customer) {
  const first = String(customer.name || '').trim().split(/\s+/)[0] || 'cliente';
  return String(template).replaceAll('{nome}', first).replaceAll('[nome_cliente]', first).replaceAll('[produto_favorito]', customer.favorito || products.FAVORITO_PADRAO);
}

// Anuncios da campanha (A, B, C). Campanhas antigas, sem anuncios salvos, viram um anuncio A so de texto.
function parseAds(c) {
  try { const a = JSON.parse(c.ads || 'null'); if (Array.isArray(a) && a.length) return a; } catch { /* sem JSON */ }
  return [{ label: 'A', media: null, header: '', body: c.message, footer: '', buttons: [] }];
}

async function runCampaign(id, { limit = 200, now = null } = {}) {
  const c = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  if (!c) throw new Error('Campanha nao encontrada');
  const ads = parseAds(c);
  const tpls = Object.fromEntries(db.prepare('SELECT * FROM templates WHERE campaign_id = ?').all(id).map(t => [t.variant, t]));
  const targets = products.attachFavorites(eligible(c).slice(0, limit));      // pedido favorito de cada cliente (para [produto_favorito])
  const ins = db.prepare(`INSERT INTO messages (campaign_id, customer_id, status, error, variant, rfv_group, sent_at)
    VALUES (?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP))`);
  const sentAt = now ? new Date(now).toISOString() : null;
  let sent = 0, failed = 0, seguidas = 0, ultimoErro = null, aborted = false;
  for (const t of targets) {
    const ad = ads[t.id % ads.length];            // divide os clientes entre os anuncios A/B/C
    const grupo = rfvClass(t);                    // grupo no momento do envio: define a janela de atribuicao
    try {
      const status = await send(c, t, render(ad.body, t), ad, tpls[ad.label]);
      ins.run(c.id, t.id, status, null, ad.label, grupo, sentAt);
      sent++; seguidas = 0;
    } catch (e) {
      ultimoErro = String(e.message || e).slice(0, 300);
      ins.run(c.id, t.id, 'failed', ultimoErro, ad.label, grupo, sentAt);
      failed++; seguidas++;
      // 3 falhas seguidas = problema geral (token, conta, modelo): para em vez de gastar as tentativas de todos os clientes
      if (seguidas >= 3) { aborted = true; break; }
    }
  }
  return { eligible: targets.length, sent, failed, aborted, error: aborted ? ultimoErro : null };
}

// Conversao = pedido ate N dias depois de uma mensagem recebida pelo cliente.
// N e a janela do grupo RFV em que o cliente estava ao receber (Ajustes); mensagens antigas usam 7 dias.
// Cada pedido conta para a ULTIMA mensagem cuja janela ainda cobria o pedido
// (assim um pedido nunca e somado em duas campanhas). E funcao porque a janela pode mudar em Ajustes.
const attrLatest = () => `SELECT o.id AS order_id, o.total, o.created_at, o.customer_id,
  (SELECT m.campaign_id FROM messages m WHERE m.customer_id = o.customer_id AND m.status = 'sent'
     AND julianday(m.sent_at) <= julianday(o.created_at)
     AND julianday(o.created_at) - julianday(m.sent_at) <= ${config.janelaSql('m')}
   ORDER BY m.sent_at DESC LIMIT 1) AS campaign_id
  FROM orders o`;

function campaignStats() {
  return db.prepare(`
    SELECT c.id, c.name, c.channel, c.active,
      (SELECT COUNT(*) FROM messages m WHERE m.campaign_id = c.id AND m.status = 'sent') AS enviadas,
      COALESCE(a.n, 0) AS conversoes, COALESCE(a.r, 0) AS receita
    FROM campaigns c
    LEFT JOIN (SELECT campaign_id, COUNT(*) n, SUM(total) r FROM (${attrLatest()})
               WHERE campaign_id IS NOT NULL GROUP BY campaign_id) a ON a.campaign_id = c.id`).all();
}

function dashboard() {
  const customers = customersWithRfv();
  const rfv = {};
  for (const k of RFV_GRUPOS) rfv[k] = { clientes: 0, receita: 0 };
  for (const c of customers) { rfv[c.rfv].clientes++; rfv[c.rfv].receita += c.total; }
  const campaigns = campaignStats();
  const monthly = db.prepare(`
    SELECT strftime('%Y-%m', created_at) AS mes, COUNT(*) AS pedidos, SUM(total) AS receita
    FROM orders GROUP BY mes ORDER BY mes DESC LIMIT 12`).all().reverse();
  return {
    totalClientes: customers.length,
    pedidos: db.prepare('SELECT COUNT(*) n FROM orders').get().n,
    receitaTotal: db.prepare('SELECT COALESCE(SUM(total),0) t FROM orders').get().t,
    mensagens: db.prepare("SELECT COUNT(*) n FROM messages WHERE status IN ('sent','dry')").get().n,
    conversoes: campaigns.reduce((a, c) => a + c.conversoes, 0),
    receitaGerada: campaigns.reduce((a, c) => a + c.receita, 0),
    rfv, campaigns, monthly,
  };
}

// --- importacao -------------------------------------------------------
const normPhone = p => {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return d.startsWith('55') ? d : '55' + d;
};

// Cliente "generico" que recebe as vendas sem cliente identificado. O DDD 00 o deixa fora das
// analises de clientes e das campanhas, mas a venda continua contando na receita.
const ANON_PHONE = '5500000000000';

// rows: [{external_id, name, phone, total, created_at, customer_key?, birth?}]
// customer_key = id do cliente na Saipos. Cliente conhecido SEM telefone ainda e cliente (entra nas analises),
// so nao recebe mensagem. Venda sem cliente nenhum vai para o cliente generico.
function importOrders(rows) {
  const byExt = db.prepare('SELECT id, phone FROM customers WHERE external_id = ?');
  const byPhone = db.prepare('SELECT id, external_id FROM customers WHERE phone = ?');
  const insC = db.prepare('INSERT INTO customers (name, phone, birth_date, external_id) VALUES (?, ?, ?, ?) RETURNING id');
  const updC = db.prepare('UPDATE customers SET name = ?, birth_date = COALESCE(?, birth_date), phone = ?, external_id = COALESCE(external_id, ?) WHERE id = ?');
  const insO = db.prepare('INSERT OR IGNORE INTO orders (external_id, customer_id, total, created_at) VALUES (?,?,?,?)');
  // detalhes da venda (Saipos): gravados tambem em vendas que ja existiam, para completar o historico
  const updDet = db.prepare(`UPDATE orders SET channel = ?, sale_type = ?, items_total = ?, discount = ?, increase = ?, coupon = ?,
    delivery_fee = ?, district = ?, payment = ? WHERE external_id = ?`);
  const updEmail = db.prepare('UPDATE customers SET email = ? WHERE id = ? AND phone <> ?');
  const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());

  const findOrCreate = (r, phone) => {
    const key = r.customer_key ? String(r.customer_key) : null, name = r.name || 'Cliente', birth = parseBirth(r.birth);
    if (key) {
      const e = byExt.get(key);
      if (e) {
        const trocaFone = phone && String(e.phone).startsWith('ext:') && !byPhone.get(phone);   // agora o cliente tem telefone
        updC.run(name, birth, trocaFone ? phone : e.phone, key, e.id);
        return e.id;
      }
      if (phone) {
        const p = byPhone.get(phone);
        if (p) { updC.run(name, birth, phone, key, p.id); return p.id; }
        return insC.get(name, phone, birth, key).id;
      }
      return insC.get(name, 'ext:' + key, birth, key).id;
    }
    if (phone) {
      const p = byPhone.get(phone);
      if (p) { updC.run(name, birth, phone, null, p.id); return p.id; }
      return insC.get(name, phone, birth, null).id;
    }
    const a = byPhone.get(ANON_PHONE);
    return a ? a.id : insC.get('Sem cliente identificado', ANON_PHONE, null, null).id;
  };

  let added = 0, skipped = 0;
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      const total = Number(String(r.total).replace(',', '.'));
      const when = new Date(r.created_at);
      if (!Number.isFinite(total) || isNaN(when)) { skipped++; continue; }
      const id = findOrCreate(r, normPhone(r.phone));
      if (emailOk(r.email)) updEmail.run(String(r.email).trim().toLowerCase(), id, ANON_PHONE);
      const res = insO.run(r.external_id ? String(r.external_id) : null, id, total, when.toISOString());
      res.changes ? added++ : skipped++;
      const d = r.detalhes;
      if (d && r.external_id) updDet.run(d.channel ?? null, d.sale_type ?? null, d.items_total ?? null, d.discount ?? 0, d.increase ?? 0,
        d.coupon ?? null, d.delivery_fee ?? null, d.district ?? null, d.payment ?? null, String(r.external_id));
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { added, skipped };
}

// aceita 2000-05-17, 2000-05-17T00:00:00 ou 17/05/2000; devolve YYYY-MM-DD ou null
function parseBirth(v) {
  const s = String(v || '').trim();
  let y, mo, d, m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) [, y, mo, d] = m;
  else if ((m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) [, d, mo, y] = m;
  else return null;
  const ok = +y >= 1900 && +y <= new Date().getFullYear() && +mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31;
  return ok ? `${y}-${mo}-${d}` : null;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const head = lines[0].split(sep).map(h => h.trim().toLowerCase());
  return lines.slice(1).map(l => {
    const cells = l.split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(head.map((h, i) => [h, cells[i]]));
  });
}

module.exports = {
  customersWithRfv, eligible, runCampaign, parseAds, render, parseBirth, RFV_GRUPOS, dashboard, importOrders, parseCsv,
  campaignStats, attrLatest, CONVERSION_WINDOW_DAYS, rfvClass, rfvOf,
};
