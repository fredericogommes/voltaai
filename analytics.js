// Analises de clientes feitas so com os pedidos: RFV, tempo entre compras, LTV, retencao,
// clientes recuperados e evolucao da base. Considera apenas clientes identificados
// (o cliente generico de vendas sem cadastro e os numeros "DDD 0x" ficam de fora).
const db = require('./db');
const core = require('./core');

const DAY = 864e5;
const pad = n => String(n).padStart(2, '0');
const mkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayNum = d => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);     // dia do calendario (sem efeito de horario de verao)
const mesIdx = d => d.getFullYear() * 12 + d.getMonth();
const keyOf = idx => `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
const media = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const mediana = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// pedidos de clientes identificados, agrupados por cliente e em ordem de data
function carregar() {
  const rows = db.prepare(`SELECT o.customer_id c, o.created_at t, o.total v FROM orders o JOIN customers cu ON cu.id = o.customer_id
    WHERE substr(cu.phone, 3, 1) <> '0' ORDER BY o.customer_id, o.created_at`).all();
  const por = new Map();
  let inicio = null;
  for (const r of rows) {
    const d = new Date(r.t);
    if (!por.has(r.c)) por.set(r.c, []);
    por.get(r.c).push({ d, v: r.v });
    if (!inicio || d < inicio) inicio = d;
  }
  return { por, inicio };
}

// ---------- RFV ---------------------------------------------------------------------
function rfv() {
  const clientes = core.customersWithRfv(), total = clientes.length || 1;
  const grupos = {};
  for (const k of core.RFV_GRUPOS) grupos[k] = { clientes: 0, pedidos: 0, receita: 0, contactaveis: 0 };
  for (const c of clientes) {
    const g = grupos[c.rfv]; g.clientes++; g.pedidos += c.n_orders; g.receita += c.total;
    if (!c.opt_out && /^55[1-9]\d9\d{8}$/.test(c.phone)) g.contactaveis++;
  }
  return { total: clientes.length, grupos: core.RFV_GRUPOS.map(nome => { const g = grupos[nome];
    return { nome, ...g, pct: g.clientes / total, ticket: g.pedidos ? g.receita / g.pedidos : 0 }; }) };
}

// ---------- tempo entre compras ------------------------------------------------------
function tempoEntreCompras() {
  const { por } = carregar(), corte = dayNum(new Date()) - 365, gaps = [];
  for (const lista of por.values()) {
    const dias = [...new Set(lista.map(o => dayNum(o.d)).filter(d => d >= corte))].sort((a, b) => a - b);   // um pedido por dia
    for (let i = 1; i < dias.length; i++) (gaps[i - 1] ||= []).push(dias[i] - dias[i - 1]);
  }
  const ord = n => `${n}ª`;
  return { de: dkey(new Date(Date.now() - 365 * DAY)), ate: dkey(new Date()),
    linhas: gaps.slice(0, 12).map((g, i) => ({ n: i + 1, de: ord(i + 1), para: ord(i + 2), media: media(g), mediana: mediana(g), clientes: g.length })) };
}

// ---------- coortes: LTV e retencao ---------------------------------------------------
function coortes() {
  const { por, inicio } = carregar();
  if (!inicio) return { meses: [], inicio: null, atual: mkey(new Date()) };
  const agora = mesIdx(new Date()), primeiroMesDados = mesIdx(inicio);
  const cohort = new Map();                           // mes do 1o pedido -> [clientes]
  for (const [c, lista] of por) { const m = mesIdx(lista[0].d); (cohort.get(m) || cohort.set(m, []).get(m)).push(c); }
  const meses = [];
  // o 1o mes do historico e descartado: la entram clientes antigos, cujo 1o pedido real e anterior
  for (let m = Math.max(primeiroMesDados + 1, agora - 12); m <= agora; m++) {
    const ids = cohort.get(m) || [];
    if (!ids.length) { meses.push({ mes: keyOf(m), clientes: 0, ltv: [], retencao: [] }); continue; }
    const gasto = Array(14).fill(0), ativos = Array.from({ length: 14 }, () => new Set());
    for (const c of ids) for (const o of por.get(c)) { const k = mesIdx(o.d) - m; if (k >= 0 && k <= 13) { gasto[k] += o.v; ativos[k].add(c); } }
    const ate = Math.min(12, agora - m);
    let acum = 0; const ltv = [], retencao = [];
    for (let k = 0; k <= ate; k++) { acum += gasto[k]; ltv.push(acum / ids.length); retencao.push({ n: ativos[k].size, pct: ativos[k].size / ids.length }); }
    meses.push({ mes: keyOf(m), clientes: ids.length, ltv, retencao });
  }
  return { meses, inicio: dkey(inicio), atual: mkey(new Date()) };
}

// ---------- clientes recuperados --------------------------------------------------------
// Recuperado = voltou a pedir depois de pelo menos `gap` dias sem pedir.
function recuperados(deStr, ateStr, gap = 90) {
  const hoje = new Date(), ate = ateStr ? new Date(ateStr + 'T23:59:59') : hoje;
  const de = deStr ? new Date(deStr + 'T00:00:00') : new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);
  const { por } = carregar();
  const perfil = new Map(core.customersWithRfv().map(c => [c.id, c]));
  const eventos = [];
  for (const [c, lista] of por) {
    for (let i = 1; i < lista.length; i++) {
      const sem = dayNum(lista[i].d) - dayNum(lista[i - 1].d);
      if (sem >= gap && lista[i].d >= de && lista[i].d <= ate) eventos.push({ c, d: lista[i].d, v: lista[i].v, sem });
    }
  }
  const porMes = {};
  for (const e of eventos) { const k = mkey(e.d); porMes[k] = (porMes[k] || 0) + 1; }
  const meses = [];
  for (let m = mesIdx(de); m <= mesIdx(ate); m++) meses.push({ mes: keyOf(m), quantos: porMes[keyOf(m)] || 0 });
  meses.forEach((m, i) => { m.cresce = i && meses[i - 1].quantos ? (m.quantos - meses[i - 1].quantos) / meses[i - 1].quantos : null; });
  eventos.sort((a, b) => b.d - a.d);
  const camp = db.prepare(`SELECT 1 FROM messages WHERE customer_id = ? AND status = 'sent' AND julianday(sent_at) <= julianday(?) AND julianday(?) - julianday(sent_at) <= ${require("./config").janelaSql("messages")} LIMIT 1`);
  return { gap, de: dkey(de), ate: dkey(ate), total: eventos.length, meses,
    linhas: eventos.slice(0, 100).map(e => { const p = perfil.get(e.c);
      return { id: e.c, nome: p?.name || 'Cliente', data: e.d.toISOString(), diasSem: e.sem, valor: e.v, grupo: p?.rfv || null, pedidos12m: p?.f12 ?? 0,
        ticket: p && p.n_orders ? p.total / p.n_orders : e.v, deCampanha: !!camp.get(e.c, e.d.toISOString(), e.d.toISOString()) }; }) };
}

// ---------- evolucao da base ------------------------------------------------------------
function evolucao(qtd = 12) {
  const { por, inicio } = carregar();
  if (!inicio) return { meses: [], medias: null };
  const agora = mesIdx(new Date()), primeiro = mesIdx(inicio);
  const novos = {}, recorr = {};
  for (const lista of por.values()) {
    const m0 = mesIdx(lista[0].d), vistos = new Set();
    for (const o of lista) { const m = mesIdx(o.d); if (vistos.has(m)) continue; vistos.add(m); (m === m0 ? novos : recorr)[m] = ((m === m0 ? novos : recorr)[m] || 0) + 1; }
  }
  const meses = [];
  for (let m = Math.max(primeiro + 1, agora - qtd); m <= agora; m++) {       // o 1o mes do historico nao separa novos de recorrentes
    const n = novos[m] || 0, r = recorr[m] || 0;
    meses.push({ mes: keyOf(m), novos: n, recorrentes: r, total: n + r, emAndamento: m === agora });
  }
  const fechados = meses.filter(x => !x.emAndamento);
  fechados.forEach((x, i) => { const ant = fechados[i - 1]; x.cresce = ant && ant.total ? (x.total - ant.total) / ant.total : null; x.cresceNovos = ant && ant.novos ? (x.novos - ant.novos) / ant.novos : null; x.cresceRec = ant && ant.recorrentes ? (x.recorrentes - ant.recorrentes) / ant.recorrentes : null; });
  // os 3 primeiros meses do historico mostram poucos recorrentes (o historico ainda e curto): ficam fora das medias
  fechados.forEach((x, i) => { x.historicoCurto = i < 3; });
  const mp = k => { const v = fechados.filter(x => !x.historicoCurto).map(x => x[k]).filter(v => v != null); return v.length ? media(v) : null; };
  return { meses, medias: { total: mp('cresce'), novos: mp('cresceNovos'), recorrentes: mp('cresceRec') }, inicio: dkey(inicio) };
}

// ---------- exportacao ---------------------------------------------------------------------
const celula = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };   // evita formula no Excel
function exportarClientes() {
  const linhas = [['id', 'nome', 'telefone', 'grupo_rfv', 'pedidos', 'pedidos_12_meses', 'total_gasto', 'ticket_medio', 'ultimo_pedido', 'dias_sem_pedir', 'nao_enviar_campanhas']];
  for (const c of core.customersWithRfv().sort((a, b) => b.total - a.total))
    linhas.push([c.id, c.name, /^\d+$/.test(c.phone) ? c.phone : '', c.rfv, c.n_orders, c.f12, c.total.toFixed(2).replace('.', ','), (c.total / c.n_orders).toFixed(2).replace('.', ','), c.last_order.slice(0, 10), c.recency, c.opt_out ? 'sim' : '']);
  return '﻿' + linhas.map(l => l.map(celula).join(';')).join('\r\n') + '\r\n';
}

module.exports = { rfv, tempoEntreCompras, coortes, recuperados, evolucao, exportarClientes };
