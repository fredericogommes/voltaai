// Consultas para as telas: painel por periodo, lista de clientes, previa de campanha
const db = require('./db');
const core = require('./core');
const products = require('./products');
const config = require('./config');

const DAY = 864e5;
const one = (sql, ...a) => db.prepare(sql).get(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);

// Pedidos feitos dentro da janela de uma mensagem realmente enviada ao cliente
// (janela do grupo RFV do cliente no envio, configurada em Ajustes)
const attributed = () => `SELECT o.id, o.total, o.created_at FROM orders o WHERE EXISTS (
  SELECT 1 FROM messages m WHERE m.customer_id = o.customer_id AND m.status = 'sent'
    AND julianday(o.created_at) >= julianday(m.sent_at)
    AND julianday(o.created_at) - julianday(m.sent_at) <= ${config.janelaSql('m')})`;

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localDay = s => new Date(s + 'T00:00:00');           // dia no fuso do computador

function kpis(start, end) {
  const s = start.toISOString(), e = end.toISOString();
  // pedidos e receita contam tudo; "clientes" so os identificados (telefone com DDD valido)
  const o = one(`SELECT COUNT(*) pedidos, COALESCE(SUM(o.total),0) receita,
                        COUNT(DISTINCT CASE WHEN substr(c.phone, 3, 1) <> '0' THEN o.customer_id END) clientes
                 FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.created_at >= ? AND o.created_at < ?`, s, e);
  const a = one(`SELECT COUNT(*) n, COALESCE(SUM(total),0) r FROM (${attributed()}) WHERE created_at >= ? AND created_at < ?`, s, e);
  const m = one(`SELECT COUNT(*) n FROM messages WHERE status = 'sent'
                 AND julianday(sent_at) >= julianday(?) AND julianday(sent_at) < julianday(?)`, s, e);
  return { pedidos: o.pedidos, receita: o.receita, clientes: o.clientes,
           mensagens: m.n, conversoes: a.n, receitaCampanhas: a.r };
}

function dashboard(fromStr, toStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let to = toStr ? localDay(toStr) : today;
  let from = fromStr ? localDay(fromStr) : new Date(to.getTime() - 29 * DAY);
  if (isNaN(from) || isNaN(to) || from > to) { to = today; from = new Date(to.getTime() - 29 * DAY); }
  const days = Math.round((to - from) / DAY) + 1;
  const end = new Date(to.getTime() + DAY);                 // fim exclusivo
  const prevEnd = from, prevStart = new Date(from.getTime() - days * DAY);

  // serie diaria do periodo (para os graficos pequenos)
  const rows = all(`SELECT strftime('%Y-%m-%d', created_at, 'localtime') d, COUNT(*) pedidos, SUM(total) receita
    FROM orders WHERE created_at >= ? AND created_at < ? GROUP BY d`, from.toISOString(), end.toISOString());
  const byDay = Object.fromEntries(rows.map(r => [r.d, r]));
  const attDay = Object.fromEntries(all(`SELECT strftime('%Y-%m-%d', created_at, 'localtime') d, SUM(total) r
    FROM (${attributed()}) WHERE created_at >= ? AND created_at < ? GROUP BY d`, from.toISOString(), end.toISOString()).map(r => [r.d, r.r]));
  const daily = [];
  for (let i = 0; i < Math.min(days, 400); i++) {
    const d = ymd(new Date(from.getTime() + i * DAY));
    daily.push({ d, pedidos: byDay[d]?.pedidos || 0, receita: byDay[d]?.receita || 0, campanhas: attDay[d] || 0 });
  }

  // ultimos 6 meses: total x parte vinda de campanhas
  const first = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  const tot = Object.fromEntries(all(`SELECT strftime('%Y-%m', created_at, 'localtime') k, SUM(total) r FROM orders
    WHERE created_at >= ? GROUP BY k`, first.toISOString()).map(r => [r.k, r.r]));
  const att = Object.fromEntries(all(`SELECT strftime('%Y-%m', created_at, 'localtime') k, SUM(total) r
    FROM (${attributed()}) WHERE created_at >= ? GROUP BY k`, first.toISOString()).map(r => [r.k, r.r]));
  const months = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(first.getFullYear(), first.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    months.push({ key, total: tot[key] || 0, campanhas: att[key] || 0 });
  }

  // RFV
  const custs = core.customersWithRfv();
  const segments = {};
  for (const k of core.RFV_GRUPOS) segments[k] = { clientes: 0, receita: 0, pedidos: 0, contactaveis: 0 };
  for (const c of custs) {
    const s = segments[c.rfv]; s.clientes++; s.receita += c.total; s.pedidos += c.n_orders;
    if (!c.opt_out) s.contactaveis++;
  }

  const perf = performance(ymd(from), ymd(to));
  return {
    period: { from: ymd(from), to: ymd(to), days },
    cur: kpis(from, end), prev: kpis(prevStart, prevEnd),
    daily, months, segments, totalClientes: custs.length,
    campaigns: perf.campaigns, channels: perf.channels,
  };
}

function listCustomers({ seg, q, sort = 'total', limit = 100, offset = 0, optout = false }) {
  let list = core.customersWithRfv();
  if (optout) list = list.filter(c => c.opt_out);
  const counts = { Todos: list.length };
  for (const c of list) counts[c.rfv] = (counts[c.rfv] || 0) + 1;
  if (seg && seg !== 'Todos') list = list.filter(c => c.rfv === seg);
  if (q) {
    const t = q.toLowerCase(), digits = q.replace(/\D/g, '');
    list = list.filter(c => c.name.toLowerCase().includes(t) || (digits && c.phone.includes(digits)));
  }
  const by = { total: (a, b) => b.total - a.total, recente: (a, b) => a.recency - b.recency,
    antigo: (a, b) => b.recency - a.recency, pedidos: (a, b) => b.n_orders - a.n_orders,
    nome: (a, b) => a.name.localeCompare(b.name, 'pt-BR') }[sort] || ((a, b) => b.total - a.total);
  list.sort(by);
  const sab = products.saboresMap();
  const rows = products.attachFavorites(list.slice(offset, offset + limit)).map(c => ({ ...c, sabor: sab.get(c.id) || null }));
  return { counts, total: list.length, rows };
}

function customerDetail(id) {
  const c = core.customersWithRfv({ incluirExcluidos: true }).find(x => x.id === id);
  if (!c) throw new Error('Cliente nao encontrado');
  const fav = products.favoritosMap().get(id) || null;
  return {
    ...c, favorito: fav ? { nome: fav.nome, curto: fav.curto, vezes: fav.vezes } : null, produtos: products.produtosDoCliente(id),
    consumo: products.saboresDoCliente(id),
    orders: all('SELECT total, created_at FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 30', id),
    messages: all(`SELECT m.sent_at, m.status, ca.name FROM messages m JOIN campaigns ca ON ca.id = m.campaign_id
                   WHERE m.customer_id = ? ORDER BY m.sent_at DESC LIMIT 10`, id),
  };
}

// Quantos clientes uma campanha atingiria (sem criar nada)
function preview(p) {
  const list = core.eligible({ id: +p.id || 0, min_days: +p.min_days || 0,
    max_days: p.max_days === '' || p.max_days == null ? null : +p.max_days,
    min_orders: +p.min_orders || 1, cooldown_days: +p.cooldown_days || 30 });
  return { count: list.length };
}

// ---- desempenho por campanha e por canal, em um periodo -------------------
function range(fromStr, toStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let to = toStr ? localDay(toStr) : today;
  let from = fromStr ? localDay(fromStr) : new Date(to.getTime() - 29 * DAY);
  if (isNaN(from) || isNaN(to) || from > to) { to = today; from = new Date(to.getTime() - 29 * DAY); }
  return { from, to, end: new Date(to.getTime() + DAY), days: Math.round((to - from) / DAY) + 1 };
}

function performance(fromStr, toStr) {
  const { from, to, end, days } = range(fromStr, toStr);
  const s = from.toISOString(), e = end.toISOString();
  const sent = all(`SELECT m.campaign_id, COUNT(*) n FROM messages m WHERE m.status = 'sent'
    AND julianday(m.sent_at) >= julianday(?) AND julianday(m.sent_at) < julianday(?) GROUP BY m.campaign_id`, s, e);
  const conv = all(`SELECT a.campaign_id, COUNT(*) n, SUM(a.total) r, COALESCE(SUM(o.discount), 0) dsc FROM (${core.attrLatest()}) a
    JOIN orders o ON o.id = a.order_id
    WHERE a.campaign_id IS NOT NULL AND a.created_at >= ? AND a.created_at < ? GROUP BY a.campaign_id`, s, e);
  const sm = Object.fromEntries(sent.map(r => [r.campaign_id, r.n])), cm = Object.fromEntries(conv.map(r => [r.campaign_id, r]));
  const custo = config.custos();
  // ROAS = receita / custo das mensagens. ROI = (receita - custo - desconto) / (custo + desconto).
  const retorno = (receita, gasto, desconto) => ({ roas: gasto > 0 ? receita / gasto : null, roi: gasto + desconto > 0 ? (receita - gasto - desconto) / (gasto + desconto) : null });
  const campaigns = all('SELECT id, name, channel FROM campaigns').map(c => {
    const enviadas = sm[c.id] || 0, conversoes = cm[c.id]?.n || 0, receita = cm[c.id]?.r || 0, desconto = cm[c.id]?.dsc || 0;
    const gasto = enviadas * (custo[c.channel] ?? 0);
    return { ...c, enviadas, conversoes, receita, desconto, custo: gasto, ...retorno(receita, gasto, desconto),
      taxa: enviadas ? conversoes / enviadas : 0, ticket: conversoes ? receita / conversoes : 0 };
  }).sort((a, b) => b.receita - a.receita);
  const channels = {};
  for (const ch of ['whatsapp', 'sms', 'email']) {
    const l = campaigns.filter(c => c.channel === ch);
    const somaL = k => l.reduce((a, c) => a + c[k], 0);
    const enviadas = somaL('enviadas'), conversoes = somaL('conversoes');
    channels[ch] = { campanhas: l.length, enviadas, conversoes, receita: somaL('receita'), custo: somaL('custo'), taxa: enviadas ? conversoes / enviadas : 0 };
  }
  const soma = k => campaigns.reduce((a, c) => a + c[k], 0);
  const receitaPeriodo = one('SELECT COALESCE(SUM(total), 0) r FROM orders WHERE created_at >= ? AND created_at < ?', s, e).r;
  const resumo = { receita: soma('receita'), custo: soma('custo'), desconto: soma('desconto'), conversoes: soma('conversoes'), enviadas: soma('enviadas'),
    receitaPeriodo, influenciada: receitaPeriodo ? soma('receita') / receitaPeriodo : 0, custoPorMensagem: custo };
  Object.assign(resumo, retorno(resumo.receita, resumo.custo, resumo.desconto));
  // serie diaria: mensagens enviadas x pedidos vindos de campanha
  const ms = Object.fromEntries(all(`SELECT strftime('%Y-%m-%d', sent_at, 'localtime') d, COUNT(*) n FROM messages WHERE status = 'sent'
    AND julianday(sent_at) >= julianday(?) AND julianday(sent_at) < julianday(?) GROUP BY d`, s, e).map(r => [r.d, r.n]));
  const cv = Object.fromEntries(all(`SELECT strftime('%Y-%m-%d', created_at, 'localtime') d, COUNT(*) n, SUM(total) r FROM (${core.attrLatest()})
    WHERE campaign_id IS NOT NULL AND created_at >= ? AND created_at < ? GROUP BY d`, s, e).map(r => [r.d, r]));
  const daily = [];
  for (let i = 0; i < Math.min(days, 400); i++) {
    const d = ymd(new Date(from.getTime() + i * DAY));
    daily.push({ d, enviadas: ms[d] || 0, conversoes: cv[d]?.n || 0, receita: cv[d]?.r || 0 });
  }
  return { period: { from: ymd(from), to: ymd(to), days }, campaigns, channels, daily, resumo };
}

// ---- mensagens enviadas ----------------------------------------------------
function listMessages({ channel, status, q, limit = 100, offset = 0 }) {
  const where = [], args = [];
  if (channel && channel !== 'todos') { where.push('c.channel = ?'); args.push(channel); }
  if (status && status !== 'todos') { where.push('m.status = ?'); args.push(status); }
  if (q) { where.push('(cu.name LIKE ? OR cu.phone LIKE ?)'); args.push(`%${q}%`, `%${q.replace(/\D/g, '') || q}%`); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const base = `FROM messages m JOIN campaigns c ON c.id = m.campaign_id JOIN customers cu ON cu.id = m.customer_id ${w}`;
  return {
    total: one(`SELECT COUNT(*) n ${base}`, ...args).n,
    rows: all(`SELECT m.id, m.sent_at, m.status, m.error, c.name AS campaign, c.channel, cu.name, cu.phone
               ${base} ORDER BY m.sent_at DESC, m.id DESC LIMIT ? OFFSET ?`, ...args, limit, offset),
  };
}

// ---- cobertura de audiencia: quem da para alcancar -------------------------
const isMobile = p => /^55[1-9]\d9\d{8}$/.test(p);
function audience() {
  const segs = {};
  for (const k of core.RFV_GRUPOS) segs[k] = { total: 0, alcancaveis: 0, semCelular: 0, optout: 0 };
  for (const c of core.customersWithRfv()) {
    const s = segs[c.rfv]; s.total++;
    if (c.opt_out) s.optout++; else if (!isMobile(c.phone)) s.semCelular++; else s.alcancaveis++;
  }
  const t = Object.values(segs).reduce((a, s) => ({ total: a.total + s.total, alcancaveis: a.alcancaveis + s.alcancaveis, semCelular: a.semCelular + s.semCelular, optout: a.optout + s.optout }), { total: 0, alcancaveis: 0, semCelular: 0, optout: 0 });
  return { segments: segs, totals: t };
}

// ---- vendas ----------------------------------------------------------------
function listOrders({ fromStr, toStr, q, limit = 100, offset = 0 }) {
  const { from, end } = range(fromStr, toStr);
  const args = [from.toISOString(), end.toISOString()];
  let w = 'WHERE o.created_at >= ? AND o.created_at < ?';
  if (q) { w += ' AND (cu.name LIKE ? OR cu.phone LIKE ?)'; args.push(`%${q}%`, `%${q.replace(/\D/g, '') || q}%`); }
  const base = `FROM orders o JOIN customers cu ON cu.id = o.customer_id LEFT JOIN (${core.attrLatest()}) a ON a.order_id = o.id ${w}`;
  const sum = one(`SELECT COUNT(*) n, COALESCE(SUM(o.total),0) t, COUNT(a.campaign_id) c ${base}`, ...args);
  return {
    total: sum.n, receita: sum.t, deCampanha: sum.c,
    rows: all(`SELECT o.id, o.total, o.created_at, cu.id AS customer_id, cu.name, cu.phone, a.campaign_id ${base}
               ORDER BY o.created_at DESC LIMIT ? OFFSET ?`, ...args, limit, offset),
  };
}

const getMeta = k => one('SELECT value FROM meta WHERE key = ?', k)?.value ?? null;
const setMeta = (k, v) => db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));

module.exports = { dashboard, listCustomers, customerDetail, preview, performance, listMessages, audience, listOrders, getMeta, setMeta };
