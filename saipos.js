// Sincronizacao com a Saipos Data API: vendas (/search_sales) e itens das vendas (/sales_items)
// Docs: https://saipos-data-api.readme.io/
//
// Ambiente:
//   SAIPOS_TOKEN          token JWT da Data API (pedido via formulario da Saipos)
//   SAIPOS_BASE_URL       padrao https://data.saipos.io/v1
//   SAIPOS_BACKFILL_DAYS  historico de vendas na 1a sincronizacao (padrao 180)
//
// Limites da API: janela maxima de 15 dias por consulta, ate 1000 registros por
// pagina (p_limit) e 500 requisicoes / 5 min por IP.
const db = require('./db');
const { importOrders } = require('./core');

const DAY = 864e5;
const WINDOW_DAYS = 14;
const PAGE = 1000;

const pad = n => String(n).padStart(2, '0');
// A API usa datas sem fuso: 2024-07-01T07:28:18
const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

// Venda da Saipos -> linha para importOrders. Retorna null para o que nao serve ao CRM.
function mapSale(s) {
  if (s.canceled === 'Y') return null;                         // venda cancelada
  const c = s.customer || {};
  const phone = (Array.isArray(c.phone) ? c.phone : [c.phone]).find(p => p && String(p).replace(/\D/g, '').length >= 10);
  // Toda venda entra (a receita e real). Cliente conhecido sem telefone vira cliente sem telefone;
  // venda de "consumidor nao identificado" vai para o cliente generico (fora das analises de clientes).
  const key = Number(c.id_customer) > 0 && c.name !== 'Consumidor não identificado' ? String(c.id_customer) : null;
  return {
    external_id: `${s.id_store}-${s.id_sale}`,
    name: key || phone ? (c.name || 'Cliente') : 'Sem cliente identificado',
    phone: phone || null,
    customer_key: key,
    total: s.total_amount ?? s.totals?.total_amount,   // na API real vem na raiz
    created_at: s.created_at,
    birth: c.birth_date,
    email: key ? (c.email || c.mail || null) : null,
    detalhes: detalhesDaVenda(s),
  };
}

// Canal, desconto, cupom, entrega e pagamento da venda. A Saipos nao informa quem bancou o desconto (loja ou iFood).
const texto = v => v == null ? null : typeof v === 'object' ? (v.code || v.desc || v.description || v.name || v.desc_discount_reason || null) : String(v);
const num = v => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));
function detalhesDaVenda(s) {
  const pagamentos = (Array.isArray(s.payments) ? s.payments : []).map(p => p?.desc_store_payment_type).filter(Boolean);
  return {
    channel: s.partner_sale?.desc_partner_sale || null,
    sale_type: num(s.id_sale_type),
    items_total: num(s.total_amount_items),
    discount: num(s.total_discount) ?? 0,
    increase: num(s.total_increase) ?? 0,
    coupon: texto(s.discount_coupon) || texto(s.discount_reason),
    delivery_fee: num(s.delivery?.delivery_fee),
    district: s.delivery?.district ? String(s.delivery.district).trim() : null,
    payment: pagamentos.length ? [...new Set(pagamentos)].join(', ') : null,
  };
}

function config() {
  const { SAIPOS_TOKEN, SAIPOS_BASE_URL = 'https://data.saipos.io/v1', SAIPOS_BACKFILL_DAYS = '180' } = process.env;
  if (!SAIPOS_TOKEN) throw new Error('Defina SAIPOS_TOKEN no arquivo .env (token da Saipos Data API)');
  return { base: SAIPOS_BASE_URL, token: SAIPOS_TOKEN.trim().replace(/^bearer\s+/i, ''), backfill: Number(SAIPOS_BACKFILL_DAYS) };
}

async function fetchPage(base, token, caminho, from, to, offset, authPrefix, limite = PAGE) {
  const url = new URL(base.replace(/\/$/, '') + caminho);
  url.searchParams.set('p_date_column_filter', 'shift_date');
  url.searchParams.set('p_filter_date_start', fmt(from));
  url.searchParams.set('p_filter_date_end', fmt(to));
  url.searchParams.set('p_limit', limite);
  url.searchParams.set('p_offset', offset);
  // A API da Saipos as vezes devolve 5xx (ex.: 504 por falta de conexao no banco deles): tenta de novo
  // Tambem tenta de novo se a resposta demorar demais (limite de 2 minutos por tentativa): sem isso uma conexao
  // parada deixava a sincronizacao esperando para sempre.
  let r, ultimoErro;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      r = await fetch(url, { headers: { Authorization: authPrefix + token }, signal: AbortSignal.timeout(120000) });
      if (r.status < 500) return r;
    } catch (e) { ultimoErro = e; r = null; }
    await new Promise(ok => setTimeout(ok, 3000 * 2 ** attempt));
  }
  if (!r) throw new Error('A Saipos não respondeu a tempo: ' + (ultimoErro?.message || 'sem resposta'));
  return r;
}

// Percorre janelas de 14 dias e paginas de 1000, entregando cada pagina a aoLote(lista)
// janela e pagina menores para /sales_items: com 14 dias e 1000 registros a Saipos estoura o tempo limite
async function percorrer(caminho, start, end, aoLote, { janela = WINDOW_DAYS, pagina = PAGE } = {}) {
  const { base, token } = config();
  let authPrefix = '';        // a doc nao mostra o formato do header: tenta o token puro e, se recusar, "Bearer "
  for (let from = start; from < end; from = new Date(from.getTime() + janela * DAY)) {
    const to = new Date(Math.min(from.getTime() + janela * DAY, end.getTime()));
    for (let offset = 0; ; offset += pagina) {
      let r = await fetchPage(base, token, caminho, from, to, offset, authPrefix, pagina);
      if ((r.status === 401 || r.status === 400) && authPrefix === '') {
        authPrefix = 'Bearer ';
        r = await fetchPage(base, token, caminho, from, to, offset, authPrefix, pagina);
      }
      if (r.status === 429) throw new Error('Limite de requisicoes da Saipos (429). Tente em 5 minutos.');
      if (!r.ok) throw new Error(`Saipos ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const lista = (await r.json()) ?? [];             // período sem registros: a Saipos devolve null
      if (!Array.isArray(lista)) throw new Error('Resposta inesperada da Saipos');
      aoLote(lista, to);
      if (lista.length < pagina) break;
    }
  }
}

async function sync({ days } = {}) {
  const { backfill } = config();
  // Comeco: ultimo pedido ja importado (menos 3 dias de folga) ou o historico inicial
  const last = db.prepare("SELECT MAX(created_at) AS m FROM orders WHERE external_id LIKE '%-%' AND external_id NOT LIKE 'demo-%'").get().m;
  const start = days ? new Date(Date.now() - days * DAY) : last ? new Date(new Date(last).getTime() - 3 * DAY) : new Date(Date.now() - backfill * DAY);
  let added = 0, skipped = 0, fetched = 0;
  await percorrer('/search_sales', start, new Date(), sales => {
    fetched += sales.length;
    const rows = sales.map(mapSale).filter(Boolean);
    skipped += sales.length - rows.length;
    const res = importOrders(rows);
    added += res.added; skipped += res.skipped;
  });
  return { added, skipped, fetched };
}

// Itens das vendas (produtos, complementos). So guarda itens de vendas que ja estao no banco.
const setMeta = (k, v) => db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v);

async function syncItems({ days } = {}) {
  const { importSaleItems } = require('./products');
  const meta = db.prepare("SELECT value FROM meta WHERE key = 'items_sync_to'").get()?.value;
  const start = days ? new Date(Date.now() - days * DAY) : meta ? new Date(new Date(meta).getTime() - 3 * DAY) : new Date(Date.now() - 400 * DAY);
  const fim = new Date();
  let itens = 0, vendas = 0, semVenda = 0;
  await percorrer('/sales_items', start, fim, lista => {
    const r = importSaleItems(lista);
    itens += r.itens; vendas += r.vendas; semVenda += r.semVenda;
  }, { janela: 3, pagina: 300 });
  setMeta('items_sync_to', fim.toISOString());
  return { itens, vendas, semVenda };
}

// Completa o histórico de itens janela a janela, guardando até onde chegou: se a Saipos estourar o tempo,
// a próxima chamada continua do ponto em que parou. Devolve { completo, ate }.
async function completarItens({ dias = 400 } = {}) {
  const { importSaleItems } = require('./products');
  const salvo = db.prepare("SELECT value FROM meta WHERE key = 'items_backfill_ate'").get()?.value;
  const inicio = salvo ? new Date(salvo) : new Date(Date.now() - dias * DAY);
  const fim = new Date();
  if (inicio >= fim) return { completo: true, ate: fim.toISOString(), itens: 0 };
  let itens = 0, ate = inicio;
  try {
    await percorrer('/sales_items', inicio, fim, (lista, to) => {
      itens += importSaleItems(lista).itens;
      if (to > ate) { ate = to; setMeta('items_backfill_ate', ate.toISOString()); }
    }, { janela: 3, pagina: 300 });
    setMeta('items_backfill_ate', fim.toISOString());
    return { completo: true, ate: fim.toISOString(), itens };
  } catch (e) {
    return { completo: false, ate: ate.toISOString(), itens, erro: String(e.message || e) };
  }
}

module.exports = { sync, syncItems, completarItens, mapSale };
