// Produtos: importar itens das vendas, mais vendidos, curva ABC, sabores/adicionais e pedido favorito.
const db = require('./db');

const IDENTIFICADO = "substr(cu.phone, 3, 1) <> '0'";   // mesmas regras das analises de clientes

// ---------- importar itens (resposta de /sales_items) -----------------------------------
// lista: [{ id_store, id_sale, items: [{ id_sale_item, id_store_item, desc_sale_item, quantity, unit_price, deleted, choices: [...] }] }]
function importSaleItems(lista) {
  const venda = db.prepare('SELECT id FROM orders WHERE external_id = ?');
  const insI = db.prepare('INSERT OR IGNORE INTO order_items (order_id, item_id, product_key, name, quantity, unit_price) VALUES (?,?,?,?,?,?)');
  const insC = db.prepare('INSERT INTO item_choices (item_id, choice_key, name, extra) VALUES (?,?,?,?)');
  let itens = 0, vendas = 0, semVenda = 0;
  db.exec('BEGIN');
  try {
    for (const s of lista) {
      const o = venda.get(`${s.id_store}-${s.id_sale}`);
      if (!o) { semVenda++; continue; }                         // venda cancelada ou fora do historico importado
      vendas++;
      for (const it of s.items || []) {
        if (it.deleted === 'Y') continue;
        const nome = String(it.desc_sale_item || '').trim();
        if (!nome) continue;
        const key = Number(it.id_store_item) > 0 ? String(it.id_store_item) : 'n:' + nome.toLowerCase();
        const r = insI.run(o.id, `${s.id_store}-${it.id_sale_item}`, key, nome, Number(it.quantity) || 1, Number(it.unit_price) || 0);
        if (!r.changes) continue;                                // item ja importado
        itens++;
        for (const ch of it.choices || []) {
          if (ch.deleted === 'Y') continue;
          const cn = String(ch.desc_sale_item_choice || ch.desc_store_choice_item || '').trim();
          if (!cn) continue;
          insC.run(Number(r.lastInsertRowid), Number(ch.id_store_choice_item) > 0 ? String(ch.id_store_choice_item) : 'n:' + cn.toLowerCase(), cn, Number(ch.aditional_price) || 0);
        }
      }
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { itens, vendas, semVenda };
}

// ---------- periodo -----------------------------------------------------------------------
function periodo(fromStr, toStr) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  let to = toStr ? new Date(toStr + 'T00:00:00') : hoje;
  let from = fromStr ? new Date(fromStr + 'T00:00:00') : new Date(to.getTime() - 29 * 864e5);
  if (isNaN(from) || isNaN(to) || from > to) { to = hoje; from = new Date(to.getTime() - 29 * 864e5); }
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { s: from.toISOString(), e: new Date(to.getTime() + 864e5).toISOString(), from: ymd(from), to: ymd(to) };
}

// ---------- mais vendidos e curva ABC -------------------------------------------------------
function ranking({ from, to, metric = 'qtd', q = '' } = {}) {
  const p = periodo(from, to), like = q ? '%' + q.replace(/[%_]/g, '') + '%' : '%';
  const rows = db.prepare(`
    SELECT i.product_key k, MAX(i.name) nome, SUM(i.quantity) qtd, SUM(i.quantity * i.unit_price) receita,
           COUNT(DISTINCT i.order_id) vendas, AVG(i.unit_price) valorItem,
           COUNT(DISTINCT CASE WHEN ${IDENTIFICADO} THEN o.customer_id END) compradores
    FROM order_items i JOIN orders o ON o.id = i.order_id JOIN customers cu ON cu.id = o.customer_id
    WHERE o.created_at >= ? AND o.created_at < ? AND i.name LIKE ? GROUP BY i.product_key`).all(p.s, p.e, like);
  const medias = Object.fromEntries(db.prepare(`
    SELECT k, AVG(total) m FROM (SELECT DISTINCT i.product_key k, o.id, o.total total FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.created_at >= ? AND o.created_at < ?)
    GROUP BY k`).all(p.s, p.e).map(r => [r.k, r.m]));
  const chave = metric === 'receita' ? 'receita' : 'qtd';
  rows.sort((a, b) => b[chave] - a[chave]);
  const total = rows.reduce((s, r) => s + r[chave], 0) || 1;
  let acum = 0;
  const linhas = rows.map(r => {
    const antes = acum; acum += r[chave];
    return { ...r, valorMedioVenda: medias[r.k] || 0, pct: r[chave] / total, acumulado: acum / total, classe: antes / total < 0.8 ? 'A' : antes / total < 0.95 ? 'B' : 'C' };
  });
  const classes = { A: { produtos: 0, pct: 0 }, B: { produtos: 0, pct: 0 }, C: { produtos: 0, pct: 0 } };
  for (const l of linhas) { classes[l.classe].produtos++; classes[l.classe].pct += l.pct; }
  return { periodo: { from: p.from, to: p.to }, metric: chave, produtos: linhas.length,
    qtd: rows.reduce((s, r) => s + r.qtd, 0), receita: rows.reduce((s, r) => s + r.receita, 0), classes, linhas: linhas.slice(0, 300), cobertura: cobertura(p) };
}

// ---------- sabores e adicionais ------------------------------------------------------------
function escolhas({ from, to, q = '' } = {}) {
  const p = periodo(from, to), like = q ? '%' + q.replace(/[%_]/g, '') + '%' : '%';
  const rows = db.prepare(`
    SELECT ch.choice_key k, MAX(ch.name) nome, COUNT(*) vezes, SUM(ch.extra) extra, COUNT(DISTINCT i.order_id) vendas
    FROM item_choices ch JOIN order_items i ON i.id = ch.item_id JOIN orders o ON o.id = i.order_id
    WHERE o.created_at >= ? AND o.created_at < ? AND ch.name LIKE ? GROUP BY ch.choice_key ORDER BY vezes DESC LIMIT 300`).all(p.s, p.e, like);
  const total = db.prepare(`SELECT COUNT(*) n FROM item_choices ch JOIN order_items i ON i.id = ch.item_id JOIN orders o ON o.id = i.order_id WHERE o.created_at >= ? AND o.created_at < ?`).get(p.s, p.e).n || 1;
  return { periodo: { from: p.from, to: p.to }, linhas: rows.map(r => ({ ...r, tipo: r.extra > 0 ? 'Adicional' : 'Sem custo extra', pct: r.vezes / total })), cobertura: cobertura(p) };
}

// Quanto das vendas do periodo tem itens importados (avisa se faltar historico de itens)
function cobertura(p) {
  const vendas = db.prepare('SELECT COUNT(*) n FROM orders WHERE created_at >= ? AND created_at < ?').get(p.s, p.e).n;
  const comItens = db.prepare('SELECT COUNT(DISTINCT i.order_id) n FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.created_at >= ? AND o.created_at < ?').get(p.s, p.e).n;
  const total = db.prepare('SELECT COUNT(*) n FROM order_items').get().n;
  return { vendas, comItens, itensNoBanco: total, sincronizadoAte: db.prepare("SELECT value FROM meta WHERE key = 'items_sync_to'").get()?.value || null };
}

// ---------- pedido favorito -------------------------------------------------------------------
// Bebidas, molhos e sache nao contam como "pedido favorito" (a mensagem fica estranha)
const NAO_FAVORITO = /refri|coca|guaran|fanta|sprite|pepsi|suco|[áa]gua|cerveja|heineken|skol|brahma|energ[ée]tico|\blata\b|\b\d+([.,]\d)?\s?(l|lt|litros?)\b|molhos?|sach[êe]|talher|embalagem/i;

function nomeCurto(n) {
  let s = String(n || '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (s && s === s.toUpperCase()) s = s.toLowerCase().replace(/^./, c => c.toUpperCase());
  if (s.length > 40) s = s.slice(0, 40).replace(/\s+\S*$/, '');
  return s.replace(/[\s\-–:+,.]+$/, '');
}

let cacheFav = { em: 0, mapa: null };
function favoritosMap(forcar) {
  if (!forcar && cacheFav.mapa && Date.now() - cacheFav.em < 60000) return cacheFav.mapa;
  const rows = db.prepare(`
    SELECT o.customer_id c, i.product_key k, MAX(i.name) n, COUNT(DISTINCT i.order_id) v, SUM(i.quantity) q, MAX(o.created_at) u
    FROM order_items i JOIN orders o ON o.id = i.order_id JOIN customers cu ON cu.id = o.customer_id
    WHERE ${IDENTIFICADO} GROUP BY o.customer_id, i.product_key`).all();
  const mapa = new Map();
  for (const r of rows) {
    if (NAO_FAVORITO.test(r.n)) continue;
    const a = mapa.get(r.c);
    if (!a || r.v > a.vezes || (r.v === a.vezes && (r.q > a.qtd || (r.q === a.qtd && r.u > a.ultimo)))) mapa.set(r.c, { nome: r.n, curto: nomeCurto(r.n), vezes: r.v, qtd: r.q, ultimo: r.u });
  }
  cacheFav = { em: Date.now(), mapa };
  return mapa;
}

// Coloca .favorito (nome curto ou null) em cada cliente da lista
function attachFavorites(lista) {
  const m = favoritosMap();
  for (const c of lista) c.favorito = m.get(c.id)?.curto || null;
  return lista;
}

// Texto usado quando o cliente ainda nao tem produto registrado
const FAVORITO_PADRAO = require('./brand').loja.produtoExemplo || 'o seu favorito';

function produtosDoCliente(id, limite = 5) {
  return db.prepare(`SELECT MAX(i.name) nome, COUNT(DISTINCT i.order_id) vezes, SUM(i.quantity) qtd FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE o.customer_id = ? GROUP BY i.product_key ORDER BY vezes DESC, qtd DESC LIMIT ?`).all(id, limite);
}

// ---------- sabores que o cliente mais consome ------------------------------------------
// Os sabores vêm das escolhas dos itens: "25 Coxinha de frango", "25 Bolinhas de Queijo", "25 Kibe".
// O número na frente é a quantidade de salgados; multiplicada pela quantidade do item, dá as unidades.
// Molhos ("Molho Verde", "Alho", "Bacon"...) ficam à parte, como "molho preferido".
const MOLHO = /\bmolhos?\b|^verde$|^alho$|^bacon$|^pimenta$|barbecue|ketchup|maionese|mostarda|sach[êe]|^especial/i;
const SALGADO = /coxinh|bolinh|kib|quib|rolinh|risol|enrolad|pastel|esfi|empad|churro|croquet|cigarr|pizza|salsich|carne|frango|queijo|calabres|presunto|palmito|camar[aã]o/i;
const semAcento = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const singular = p => p.length > 3 && /s$/i.test(p) && !/(ss|us|is)$/i.test(p) ? p.replace(/(õe|ãe)s$/i, 'ão').replace(/ns$/i, 'm').replace(/s$/i, '') : p;
function lerEscolha(nome) {
  const s = String(nome || '').replace(/\s+/g, ' ').trim();
  const m = s.match(/^(\d{1,3})\s*(?:un\.?|unid\.?|x)?\s+(.+)$/i);
  const resto = (m ? m[2] : s).trim();
  if (!resto) return null;
  if (MOLHO.test(resto)) {
    const nomeMolho = resto.replace(/^molhos? (de )?/i, '').trim();
    return { tipo: 'molho', chave: semAcento(nomeMolho.toLowerCase()), rotulo: nomeMolho.replace(/^./, c => c.toUpperCase()), unidades: 1 };
  }
  if (!m && !SALGADO.test(resto)) return null;                       // ex.: "Sem cebola", "Bem passado"
  const rotulo = resto.split(' ').map(singular).join(' ').toLowerCase().replace(/\bquibe\b/g, 'kibe').replace(/^./, c => c.toUpperCase());
  return { tipo: 'sabor', chave: semAcento(rotulo.toLowerCase()), rotulo, unidades: m ? Number(m[1]) : 1 };
}

const ESCOLHAS_SQL = `SELECT o.customer_id c, ch.name n, i.quantity q, i.order_id p
  FROM item_choices ch JOIN order_items i ON i.id = ch.item_id JOIN orders o ON o.id = i.order_id`;

function somarSabores(linhas) {
  const sab = new Map(), mol = new Map();
  for (const l of linhas) {
    const e = lerEscolha(l.n); if (!e) continue;
    const alvo = e.tipo === 'molho' ? mol : sab;
    const a = alvo.get(e.chave) || { rotulo: e.rotulo, unidades: 0, pedidos: new Set() };
    a.unidades += e.unidades * (Number(l.q) || 1); a.pedidos.add(l.p);
    alvo.set(e.chave, a);
  }
  const lista = m => [...m.values()].map(a => ({ nome: a.rotulo, unidades: a.unidades, pedidos: a.pedidos.size })).sort((x, y) => y.unidades - x.unidades || y.pedidos - x.pedidos);
  const sabores = lista(sab), total = sabores.reduce((t, s) => t + s.unidades, 0);
  return { sabores: sabores.map(s => ({ ...s, pct: total ? s.unidades / total : 0 })), molhos: lista(mol), totalSalgados: total };
}

function saboresDoCliente(id, limite = 5) {
  const r = somarSabores(db.prepare(`${ESCOLHAS_SQL} WHERE o.customer_id = ?`).all(id));
  return { sabores: r.sabores.slice(0, limite), molho: r.molhos[0] || null, totalSalgados: r.totalSalgados };
}

// Sabor que cada cliente identificado mais consome (para a lista de clientes). Cache de 1 minuto.
let cacheSab = { em: 0, mapa: null };
function saboresMap(forcar) {
  if (!forcar && cacheSab.mapa && Date.now() - cacheSab.em < 60000) return cacheSab.mapa;
  const porCliente = new Map();
  for (const l of db.prepare(`${ESCOLHAS_SQL} JOIN customers cu ON cu.id = o.customer_id WHERE ${IDENTIFICADO}`).all()) {
    if (!porCliente.has(l.c)) porCliente.set(l.c, []);
    porCliente.get(l.c).push(l);
  }
  const mapa = new Map();
  for (const [c, linhas] of porCliente) { const s = somarSabores(linhas).sabores[0]; if (s) mapa.set(c, s); }
  cacheSab = { em: Date.now(), mapa };
  return mapa;
}

module.exports = { importSaleItems, ranking, escolhas, cobertura, favoritosMap, attachFavorites, produtosDoCliente, nomeCurto, FAVORITO_PADRAO, NAO_FAVORITO,
  lerEscolha, saboresDoCliente, saboresMap };
