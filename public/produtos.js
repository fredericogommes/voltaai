'use strict';
/* Produtos: mais vendidos, curva ABC, sabores e adicionais (itens das vendas do PDV).
   Carregado antes de app.js; os helpers de app.js so sao usados quando as funcoes rodam. */

let prodAba = 'vendidos', prodMetrica = 'qtd', prodBusca = '', prodPagina = 0, prodPorPagina = 25;
const nQtd = n => (n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const CLASSE = { A: 'var(--folha)', B: 'var(--ambar)', C: 'var(--texto-2)' };

async function pgProdutos() {
  const p = periodoAtual();
  const q = `from=${p.from}&to=${p.to}&q=${encodeURIComponent(prodBusca)}`;
  const d = await api(prodAba === 'sabores' ? `produtos/escolhas?${q}` : `produtos?${q}&metric=${prodMetrica}`);
  const totalLinhas = d.linhas.length;
  const paginas = Math.max(1, Math.ceil(totalLinhas / prodPorPagina));
  if (prodPagina >= paginas) prodPagina = 0;
  const inicio = prodPagina * prodPorPagina;
  const pagina = { ...d, inicio, totalLinhas, maxPct: Math.max(0.0001, ...d.linhas.map(l => l.pct)), linhas: d.linhas.slice(inicio, inicio + prodPorPagina) };
  const cob = d.cobertura;
  const incompleto = cob.vendas > 0 && cob.comItens < cob.vendas * 0.9;

  $('#app').innerHTML = `
  <div class="page-head"><div><h1>Produtos</h1><p class="sub">O que mais sai, de ${dataBr(d.periodo.from + 'T12:00')} a ${dataBr(d.periodo.to + 'T12:00')}.</p></div>${periodoHtml(d.periodo)}</div>
  ${cob.itensNoBanco === 0 ? `<div class="painel vazio"><b>Os itens das vendas ainda não foram importados</b><span>Aqui aparecem os produtos e sabores de cada pedido do PDV.</span><button class="btn ouro" id="p-sync">Importar itens agora</button></div>` : `
  ${incompleto ? `<div class="aviso neutro" style="margin-bottom:14px">Só ${inteiro(cob.comItens)} das ${inteiro(cob.vendas)} vendas deste período têm itens importados, então os números podem estar abaixo do real. <button class="btn pequeno" id="p-sync">Importar itens</button></div>` : ''}
  <div class="barra-filtros">
    <div class="chips">${[['vendidos', 'Mais vendidos'], ['abc', 'Curva ABC'], ['sabores', 'Sabores e adicionais']].map(([k, n]) => `<button class="chip" data-aba="${k}" aria-pressed="${prodAba === k}">${n}</button>`).join('')}</div>
    ${prodAba !== 'sabores' ? `<div class="seg" role="group" aria-label="Ordenar por"><button data-m="qtd" aria-pressed="${prodMetrica === 'qtd'}">Quantidade</button><button data-m="receita" aria-pressed="${prodMetrica === 'receita'}">Receita</button></div>` : ''}
    <div class="busca">${icon('busca')}<input class="campo" id="q" type="search" placeholder="Buscar produto" value="${esc(prodBusca)}" aria-label="Buscar produto"></div>
  </div>
  ${prodAba === 'vendidos' ? vendidosHtml(pagina) : prodAba === 'abc' ? abcHtml(pagina) : saboresHtml(pagina)}
  ${paginacaoHtml('produtos-paginacao', prodPagina, prodPorPagina, totalLinhas, 'Produtos')}`}`;

  ligarPeriodo(d.periodo);
  $('#app').querySelectorAll('[data-aba]').forEach(b => b.onclick = () => { prodAba = b.dataset.aba; prodPagina = 0; rota(); });
  $('#app').querySelectorAll('[data-m]').forEach(b => b.onclick = () => { prodMetrica = b.dataset.m; prodPagina = 0; rota(); });
  const qi = $('#q'); if (qi) qi.oninput = debounce(e => { prodBusca = e.target.value.trim(); prodPagina = 0; rota(); }, 450);
  ligarPaginacao('produtos-paginacao', {
    get pagina() { return prodPagina; }, set pagina(v) { prodPagina = v; },
    get porPagina() { return prodPorPagina; }, set porPagina(v) { prodPorPagina = v; }
  }, rota);
  const sb = $('#p-sync');
  if (sb) sb.onclick = async () => {
    sb.disabled = true; sb.textContent = 'Importando… pode levar alguns minutos';
    try { const r = await api('pdv/sync-items', { days: 400 }); toast(`Pronto: ${inteiro(r.itens)} itens de ${inteiro(r.vendas)} vendas.`); } catch (e) { toast(e.message, true); }
    rota();
  };
}

const semDados = n => `<tr><td colspan="${n}"><div class="vazio"><b>Nenhum produto encontrado</b><span>Mude o período ou limpe a busca.</span></div></td></tr>`;

function vendidosHtml(d) {
  const maxPct = d.maxPct;
  return `<section class="faixa" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px">
    <div class="ind"><span class="rot">Produtos vendidos</span><span class="val num">${inteiro(d.produtos)}</span></div>
    <div class="ind"><span class="rot">Unidades</span><span class="val num">${nQtd(d.qtd)}</span></div>
    <div class="ind"><span class="rot">Receita dos itens</span><span class="val num">${brlCurto(d.receita)}</span></div></section>
  <div class="painel"><div class="rolagem"><table class="tabela"><thead><tr><th>#</th><th>Produto</th><th class="d">Unidades</th><th class="d">Receita</th><th style="min-width:130px">% do total</th><th class="d oculta-cel">Compradores</th><th class="d oculta-cel">Valor médio da venda</th><th class="d oculta-cel">Valor médio do item</th></tr></thead><tbody>
    ${d.linhas.map((l, i) => `<tr style="cursor:default"><td class="num">${d.inicio + i + 1}</td><td><b style="font-weight:600">${esc(l.nome)}</b></td><td class="d num">${nQtd(l.qtd)}</td><td class="d num">${brl(l.receita)}</td>
      <td><div class="barra-pct"><i style="width:${l.pct / maxPct * 100}%"></i></div><small class="num">${pct1(l.pct)}</small></td>
      <td class="d num oculta-cel">${inteiro(l.compradores)}</td><td class="d num oculta-cel">${brl(l.valorMedioVenda)}</td><td class="d num oculta-cel">${brl(l.valorItem)}</td></tr>`).join('') || semDados(8)}</tbody></table></div></div>
  ${d.produtos > d.totalLinhas ? `<p class="nota" style="margin-top:8px">O ranking considera os ${inteiro(d.totalLinhas)} primeiros de ${inteiro(d.produtos)} produtos.</p>` : ''}`;
}

function abcHtml(d) {
  const c = d.classes, nome = d.metric === 'receita' ? 'da receita' : 'das unidades';
  return `<section class="faixa" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px">
    ${['A', 'B', 'C'].map(k => `<div class="ind"><span class="rot"><span class="pill" style="--c:${CLASSE[k]}">Curva ${k}</span></span><span class="val num">${inteiro(c[k].produtos)} ${c[k].produtos === 1 ? 'produto' : 'produtos'}</span><div class="rod"><span class="nota">${pct1(c[k].pct)} ${nome}</span></div></div>`).join('')}</section>
  <div class="aviso neutro" style="margin-bottom:14px"><b>Como ler:</b> a curva A são os produtos que juntos fazem 80% das vendas, a B os 15% seguintes e a C os 5% finais. Foque o cardápio, o estoque e as fotos na curva A. Produtos da curva C são candidatos a sair do cardápio.</div>
  <div class="painel"><div class="rolagem"><table class="tabela"><thead><tr><th>Produto</th><th class="d">Unidades</th><th class="d">Receita</th><th class="d">% do total</th><th class="d">% acumulada</th><th>Classe</th></tr></thead><tbody>
    ${d.linhas.map(l => `<tr style="cursor:default"><td><b style="font-weight:600">${esc(l.nome)}</b></td><td class="d num">${nQtd(l.qtd)}</td><td class="d num">${brl(l.receita)}</td><td class="d num">${pct1(l.pct)}</td><td class="d num">${pct1(l.acumulado)}</td><td><span class="pill" style="--c:${CLASSE[l.classe]}">${l.classe}</span></td></tr>`).join('') || semDados(6)}</tbody></table></div></div>`;
}

function saboresHtml(d) {
  return `<div class="aviso neutro" style="margin-bottom:14px">Sabores, recheios e adicionais que o cliente escolheu dentro dos produtos (por exemplo, os sabores de uma pizza ou de um combo).</div>
  <div class="painel"><div class="rolagem"><table class="tabela"><thead><tr><th>#</th><th>Sabor ou adicional</th><th class="d">Vezes escolhido</th><th class="d">% das escolhas</th><th class="d oculta-cel">Em quantas vendas</th><th class="oculta-cel">Tipo</th><th class="d oculta-cel">Valor extra cobrado</th></tr></thead><tbody>
    ${d.linhas.map((l, i) => `<tr style="cursor:default"><td class="num">${d.inicio + i + 1}</td><td><b style="font-weight:600">${esc(l.nome)}</b></td><td class="d num">${inteiro(l.vezes)}</td><td class="d num">${pct1(l.pct)}</td><td class="d num oculta-cel">${inteiro(l.vendas)}</td><td class="oculta-cel">${l.tipo}</td><td class="d num oculta-cel">${l.extra ? brl(l.extra) : '–'}</td></tr>`).join('') || semDados(7)}</tbody></table></div></div>`;
}
