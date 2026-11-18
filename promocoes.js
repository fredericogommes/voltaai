// Análise de promoções (por canal, com foco no iFood) e melhores bairros, a partir dos detalhes das vendas da Saipos.
// Limite conhecido: a Saipos informa o desconto total da venda, mas não quem o pagou (loja ou iFood).
const db = require('./db');

const DAY = 864e5;
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function periodo(fromStr, toStr) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const to = /^\d{4}-\d\d-\d\d$/.test(toStr || '') ? new Date(toStr + 'T00:00:00') : hoje;
  const from = /^\d{4}-\d\d-\d\d$/.test(fromStr || '') ? new Date(fromStr + 'T00:00:00') : new Date(to.getTime() - 29 * DAY);
  const end = new Date(to.getTime() + DAY);
  return { from, to, end, s: from.toISOString(), e: end.toISOString(), days: Math.round((end - from) / DAY) };
}
const ANON = '5500000000000';
const canalDe = o => o.channel || 'Venda própria';

function promocoes(fromStr, toStr, canalPedido) {
  const p = periodo(fromStr, toStr);
  const pedidos = db.prepare(`SELECT o.id, o.customer_id, o.total, o.created_at, o.channel, o.discount, o.items_total, o.increase, o.coupon,
      c.phone, c.excluded
    FROM orders o JOIN customers c ON c.id = o.customer_id
    WHERE o.created_at >= ? AND o.created_at < ? AND o.sale_type IS NOT NULL`).all(p.s, p.e);
  const semDetalhe = db.prepare('SELECT COUNT(*) n FROM orders WHERE created_at >= ? AND created_at < ? AND sale_type IS NULL').get(p.s, p.e).n;

  // número do pedido do cliente (1º, 2º...), contando todo o histórico, para a faixa de pedido
  const ordem = new Map();
  const hist = db.prepare(`SELECT id, customer_id FROM orders WHERE customer_id IN (SELECT DISTINCT customer_id FROM orders WHERE created_at >= ? AND created_at < ?)
    ORDER BY customer_id, created_at, id`).all(p.s, p.e);
  let ult = null, n = 0;
  for (const h of hist) { if (h.customer_id !== ult) { ult = h.customer_id; n = 0; } ordem.set(h.id, ++n); }

  const resumo = lista => {
    const com = lista.filter(o => o.discount > 0), sem = lista.filter(o => !(o.discount > 0));
    const soma = (l, k) => l.reduce((a, o) => a + (Number(o[k]) || 0), 0);
    const bruto = lista.reduce((a, o) => a + (Number(o.items_total) || o.total) + (Number(o.increase) || 0), 0);
    const desconto = soma(lista, 'discount');
    return {
      pedidos: lista.length, receita: soma(lista, 'total'), comPromocao: com.length, semPromocao: sem.length,
      pctComPromocao: lista.length ? com.length / lista.length : 0, desconto, pctDoBruto: bruto ? desconto / bruto : 0,
      receitaComPromocao: soma(com, 'total'), receitaSemPromocao: soma(sem, 'total'),
      ticketCom: com.length ? soma(com, 'total') / com.length : 0, ticketSem: sem.length ? soma(sem, 'total') / sem.length : 0,
      comCupom: com.filter(o => o.coupon).length, semCupom: com.filter(o => !o.coupon).length,
      descontoComCupom: soma(com.filter(o => o.coupon), 'discount'), descontoSemCupom: soma(com.filter(o => !o.coupon), 'discount'),
    };
  };

  const canais = {};
  for (const o of pedidos) (canais[canalDe(o)] ||= []).push(o);
  const porCanal = Object.entries(canais).map(([canal, l]) => ({ canal, ...resumo(l) })).sort((a, b) => b.pedidos - a.pedidos);

  // canal analisado: o pedido na tela; senão o iFood, se houver; senão todos
  const canais0 = [...new Set(pedidos.map(canalDe))];
  const escolhido = canalPedido === 'todos' ? null : canais0.includes(canalPedido) ? canalPedido : canais0.includes('iFood') ? 'iFood' : null;
  const foco = escolhido ? pedidos.filter(o => canalDe(o) === escolhido) : pedidos;
  const identificado = o => o.phone !== ANON && !o.excluded;
  const faixas = [['1º pedido', 1, 1], ['2º a 5º pedido', 2, 5], ['6º pedido ou mais', 6, Infinity]].map(([rotulo, a, b]) => {
    const l = foco.filter(o => identificado(o) && ordem.get(o.id) >= a && ordem.get(o.id) <= b);
    const com = l.filter(o => o.discount > 0).length;
    return { rotulo, pedidos: l.length, comPromocao: com, pct: l.length ? com / l.length : 0 };
  });

  const cupons = {};
  for (const o of foco) if (o.discount > 0) {
    const k = o.coupon || '(desconto sem cupom informado)';
    const c = cupons[k] ||= { cupom: k, pedidos: 0, desconto: 0, receita: 0 };
    c.pedidos++; c.desconto += o.discount; c.receita += o.total;
  }

  const porDia = {};
  for (let i = 0; i < Math.min(p.days, 400); i++) porDia[ymd(new Date(p.from.getTime() + i * DAY))] = { com: 0, sem: 0 };
  for (const o of foco) { const d = porDia[ymd(new Date(o.created_at))]; if (d) d[o.discount > 0 ? 'com' : 'sem']++; }

  const r = resumo(foco);
  const alertas = [];
  const fiel = faixas[2];
  if (fiel.pedidos >= 3 && fiel.pct >= 0.8) alertas.push(`Clientes com 6 pedidos ou mais tiveram desconto em ${Math.round(fiel.pct * 100)}% das compras. Eles voltariam sem desconto: provável margem deixada na mesa.`);
  if (r.pedidos >= 10 && r.pctComPromocao >= 0.7) alertas.push(`${Math.round(r.pctComPromocao * 100)}% dos pedidos saíram com desconto. A venda está dependente de promoção.`);
  if (r.ticketCom && r.ticketSem && r.ticketCom > r.ticketSem * 1.15) alertas.push(`O ticket com desconto (R$ ${r.ticketCom.toFixed(2).replace('.', ',')}) é maior que sem (R$ ${r.ticketSem.toFixed(2).replace('.', ',')}): a promoção está puxando pedidos maiores.`);

  return {
    periodo: { from: ymd(p.from), to: ymd(p.to), days: p.days }, foco: escolhido || 'todos', canais: canais0,
    resumo: r, porCanal, faixas, cupons: Object.values(cupons).sort((a, b) => b.desconto - a.desconto).slice(0, 15),
    diario: Object.entries(porDia).map(([d, v]) => ({ d, ...v })), alertas, semDetalhe,
  };
}

function bairros(fromStr, toStr) {
  const p = periodo(fromStr, toStr);
  const linhas = db.prepare(`SELECT o.district bairro, COUNT(*) pedidos, SUM(o.total) receita, COUNT(DISTINCT o.customer_id) clientes,
      SUM(CASE WHEN o.channel = 'iFood' THEN 1 ELSE 0 END) ifood, COALESCE(SUM(o.delivery_fee), 0) taxa
    FROM orders o JOIN customers c ON c.id = o.customer_id
    WHERE o.created_at >= ? AND o.created_at < ? AND o.district IS NOT NULL AND o.district <> '' AND c.excluded = 0
    GROUP BY lower(trim(o.district)) ORDER BY receita DESC`).all(p.s, p.e);
  const semBairro = db.prepare(`SELECT COUNT(*) n FROM orders WHERE created_at >= ? AND created_at < ? AND (district IS NULL OR district = '')`).get(p.s, p.e).n;
  return { periodo: { from: ymd(p.from), to: ymd(p.to), days: p.days }, semBairro,
    bairros: linhas.map(l => ({ ...l, ticket: l.pedidos ? l.receita / l.pedidos : 0, taxaMedia: l.pedidos ? l.taxa / l.pedidos : 0 })) };
}

module.exports = { promocoes, bairros };
