'use strict';
/* Analises de clientes: RFV, tempo entre compras, LTV e retencao, recuperados, evolucao.
   Carregado antes de app.js; os helpers de app.js so sao usados quando as funcoes rodam. */

const mesLongo = k => { const [y, m] = k.split('-'); return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', ''); };
const pct1 = n => n == null ? '–' : (n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
const delta1 = n => n == null ? '' : `<span class="delta ${n > 0 ? 'sobe' : n < 0 ? 'desce' : 'igual'}">${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n * 100))}%</span>`;
const dias1 = n => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const nota = t => `<p class="nota" style="max-width:70ch">${t}</p>`;

/* ---------- RFV ---------- */
async function pgRfv() {
  const d = await api('analises/rfv');
  $('#app').innerHTML = `
  <div class="page-head"><div><h1>Análise RFV</h1><p class="sub">${inteiro(d.total)} clientes agrupados por quanto tempo faz que pediram e quantas vezes pediram no último ano.</p></div>
    <a class="btn" href="/api/customers/export" download>Exportar planilha</a></div>
  <section class="painel">
    <div class="proporcao" role="img" aria-label="Proporção de clientes por grupo">${d.grupos.map(g => `<a href="#/contatos?seg=${encodeURIComponent(g.nome)}" style="flex:${g.clientes || 0.001};background:${SEG[g.nome].cor}" title="${esc(g.nome)}: ${inteiro(g.clientes)} clientes" aria-label="${esc(g.nome)}: ${inteiro(g.clientes)} clientes"></a>`).join('')}</div>
    <div class="rolagem"><table class="tabela" style="margin-top:12px"><thead><tr><th>Grupo</th><th class="d">Clientes</th><th class="d">% da base</th><th class="d">Ticket médio</th><th class="d">Receita histórica</th><th class="d">Podem receber</th><th></th></tr></thead><tbody>
      ${d.grupos.map(g => `<tr style="cursor:default"><td>${pillSeg(g.nome)}</td><td class="d num">${inteiro(g.clientes)}</td><td class="d num">${pct1(g.pct)}</td><td class="d num">${g.pedidos ? brl(g.ticket) : '–'}</td><td class="d num">${brlCurto(g.receita)}</td><td class="d num">${inteiro(g.contactaveis)}</td>
        <td class="d"><a class="btn pequeno" href="#/contatos?seg=${encodeURIComponent(g.nome)}">Ver clientes</a>${SEG[g.nome].preset && g.contactaveis ? ` <button class="btn pequeno ouro" data-nova="${esc(g.nome)}">Criar campanha</button>` : ''}</td></tr>`).join('')}</tbody></table></div></section>
  <h2 class="sec">Como cada grupo é definido</h2>
  <section class="painel pad"><dl class="resumo" style="grid-template-columns:170px 1fr">${d.grupos.map(g => `<dt>${pillSeg(g.nome)}</dt><dd>${esc(SEG[g.nome].exp)}</dd>`).join('')}</dl>
    ${nota('Os dois últimos grupos usam só o tempo sem pedir, as mesmas faixas das campanhas de recompra e de recuperação. Entre quem pediu há menos de 30 dias, o grupo depende de quantos pedidos fez nos últimos 12 meses.')}</section>`;
  $('#app').querySelectorAll('[data-nova]').forEach(b => b.onclick = () => { location.hash = '#/campanha?modelo=' + encodeURIComponent(b.dataset.nova); });
}

/* ---------- tempo entre compras ---------- */
async function pgTempo() {
  const d = await api('analises/tempo');
  const l = d.linhas, max = Math.max(1, ...l.map(x => Math.max(x.media, x.mediana)));
  const p = l[0];
  $('#app').innerHTML = `
  <div class="page-head"><div><h1>Tempo entre compras</h1><p class="sub">Quantos dias o cliente leva para pedir de novo. Compras dos últimos 12 meses, de ${dataBr(d.de + 'T12:00')} a ${dataBr(d.ate + 'T12:00')}.</p></div></div>
  ${p ? `<section class="faixa" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px">
    <div class="ind"><span class="rot">1ª para a 2ª compra, mediana</span><span class="val num">${dias1(p.mediana)} dias</span><div class="rod"><span class="nota">metade volta em até isso</span></div></div>
    <div class="ind"><span class="rot">1ª para a 2ª compra, média</span><span class="val num">${dias1(p.media)} dias</span><div class="rod"><span class="nota">puxada por quem demora</span></div></div>
    <div class="ind"><span class="rot">Clientes que voltaram</span><span class="val num">${inteiro(p.clientes)}</span><div class="rod"><span class="nota">fizeram pelo menos 2 compras</span></div></div></section>
  <div class="aviso neutro" style="margin-bottom:16px"><b>Como usar:</b> metade dos clientes que voltam, volta em até ${dias1(p.mediana)} dias. Um lembrete um pouco antes disso, por exemplo com ${Math.max(1, Math.round(p.mediana * 0.8))} dias, costuma pegar o cliente na hora certa. <a href="#/fluxo?modelo=recompra">Criar lembrete de recompra</a></div>` : ''}
  <section class="painel pad">
    <div class="gcols" role="img" aria-label="Dias entre compras">${l.map(x => `<div class="gcol" title="${x.de} para ${x.para}: média ${dias1(x.media)} dias, mediana ${dias1(x.mediana)} dias, ${x.clientes} clientes">
      <div class="gbars"><i class="b1" style="height:${x.media / max * 100}%"></i><i class="b2" style="height:${x.mediana / max * 100}%"></i></div><span>${x.n}ª→${x.n + 1}ª</span></div>`).join('')}</div>
    <div class="legenda-tab" style="margin-top:8px"><span><i style="background:var(--crosta)"></i>Média de dias</span><span><i style="background:var(--tinta)"></i>Mediana de dias</span></div></section>
  <h2 class="sec">Detalhe</h2>
  <div class="painel"><div class="rolagem"><table class="tabela"><thead><tr><th>Compra</th><th class="d">Média de dias</th><th class="d">Mediana de dias</th><th class="d">Clientes</th></tr></thead><tbody>
    ${l.map(x => `<tr style="cursor:default"><td>${x.de} para a ${x.para}</td><td class="d num">${dias1(x.media)}</td><td class="d num">${dias1(x.mediana)}</td><td class="d num">${inteiro(x.clientes)}</td></tr>`).join('') || '<tr><td colspan="4"><div class="vazio"><b>Sem dados ainda</b><span>Precisa de clientes com pelo menos duas compras.</span></div></td></tr>'}</tbody></table></div></div>
  ${nota('Pedidos feitos no mesmo dia contam como uma compra só.')}`;
}

/* ---------- LTV e retencao ---------- */
let coorteVisao = 'ltv';
async function pgCoortes() {
  const d = await api('analises/coortes');
  const cols = Array.from({ length: 13 }, (_, i) => i);
  const cel = (m, k) => {
    if (k >= m.ltv.length) return '<td class="vz">–</td>';
    if (coorteVisao === 'ltv') return `<td class="d num">${brl(m.ltv[k]).replace(',00', '')}</td>`;
    const r = m.retencao[k], pc = Math.round(r.pct * 100);
    return `<td class="d num mapa" style="background:color-mix(in srgb, var(--crosta) ${k === 0 ? 8 : Math.min(85, pc * 3)}%, transparent)" title="${r.n} de ${m.clientes} clientes">${pc}%</td>`;
  };
  $('#app').innerHTML = `
  <div class="page-head"><div><h1>LTV e retenção</h1><p class="sub">Clientes agrupados pelo mês do primeiro pedido, acompanhados nos meses seguintes.</p></div>
    <div class="seg" role="group" aria-label="Visão"><button data-v="ltv" aria-pressed="${coorteVisao === 'ltv'}">LTV</button><button data-v="ret" aria-pressed="${coorteVisao === 'ret'}">Retenção</button></div></div>
  <div class="aviso neutro" style="margin-bottom:14px">${coorteVisao === 'ltv' ? '<b>LTV</b> é quanto cada cliente do grupo já gastou no total, em média, até aquele mês. O valor inicial é o gasto no mês do primeiro pedido.' : '<b>Retenção</b> é a parte dos clientes do grupo que pediu de novo naquele mês. Passe o mouse para ver quantos clientes.'}</div>
  <div class="painel"><div class="rolagem"><table class="tabela coorte"><thead><tr><th>Primeiro pedido</th><th class="d">Clientes</th>${cols.map(k => `<th class="d">${k === 0 ? 'Início' : `+${k}`}</th>`).join('')}</tr></thead><tbody>
    ${d.meses.filter(m => m.clientes).map(m => `<tr style="cursor:default"><td>${esc(mesLongo(m.mes))}</td><td class="d num">${inteiro(m.clientes)}</td>${cols.map(k => cel(m, k)).join('')}</tr>`).join('') || '<tr><td colspan="15"><div class="vazio"><b>Sem dados suficientes</b><span>Precisa de mais meses de histórico.</span></div></td></tr>'}</tbody></table></div></div>
  ${d.inicio ? nota(`O histórico começa em ${dataBr(d.inicio + 'T12:00')}. O primeiro mês fica de fora porque nele aparecem clientes antigos, cujo primeiro pedido de verdade foi antes. Quanto mais histórico estiver importado, mais coortes aparecem.`) : ''}`;
  $('#app').querySelectorAll('[data-v]').forEach(b => b.onclick = () => { coorteVisao = b.dataset.v; pgCoortes(); });
}

/* ---------- recuperados ---------- */
async function pgRecuperados() {
  const d = await api('analises/recuperados');
  const max = Math.max(1, ...d.meses.map(m => m.quantos));
  const ult = d.meses.at(-1);
  $('#app').innerHTML = `
  <div class="page-head"><div><h1>Clientes recuperados</h1><p class="sub">Clientes que voltaram a pedir depois de ${d.gap} dias ou mais sem pedir. De ${dataBr(d.de + 'T12:00')} a ${dataBr(d.ate + 'T12:00')}.</p></div></div>
  <section class="faixa" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px">
    <div class="ind"><span class="rot">Recuperados no período</span><span class="val num">${inteiro(d.total)}</span></div>
    <div class="ind"><span class="rot">Neste mês</span><span class="val num">${inteiro(ult?.quantos || 0)}</span><div class="rod">${delta1(ult?.cresce) || '<span></span>'}<span class="nota">mês em andamento</span></div></div>
    <div class="ind"><span class="rot">Vieram de campanha</span><span class="val num">${inteiro(d.linhas.filter(l => l.deCampanha).length)}</span><div class="rod"><span class="nota">entre os ${inteiro(d.linhas.length)} últimos</span></div></div></section>
  <section class="painel pad"><div class="gcols" role="img" aria-label="Recuperados por mês">${d.meses.map(m => `<div class="gcol" title="${esc(mesLongo(m.mes))}: ${m.quantos} recuperados"><div class="gbars"><i class="b1" style="height:${m.quantos / max * 100}%"></i></div><span>${esc(mesLongo(m.mes))}</span><b class="num">${m.quantos}</b></div>`).join('')}</div></section>
  <h2 class="sec">Últimos recuperados<small>até 100</small></h2>
  <div class="painel"><div class="rolagem"><table class="tabela"><thead><tr><th>Cliente</th><th>Grupo hoje</th><th class="d">Dias sem pedir</th><th class="d">Pedido da volta</th><th class="d">Pedidos em 12 meses</th><th class="oculta-cel">Quando</th><th></th></tr></thead><tbody>
    ${d.linhas.map(l => `<tr tabindex="0" data-id="${l.id}"><td><div class="pessoa"><b>${esc(nomeBonito(l.nome))}</b></div></td><td>${l.grupo ? pillSeg(l.grupo) : ''}</td><td class="d num">${inteiro(l.diasSem)}</td><td class="d num">${brl(l.valor)}</td><td class="d num">${l.pedidos12m}</td><td class="oculta-cel">${dataBr(l.data)}</td><td>${l.deCampanha ? '<span class="pill" style="--c:var(--ambar)">Campanha</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="7"><div class="vazio"><b>Ninguém voltou nesse período</b><span>Aparecem aqui os clientes que pedem de novo depois de um longo tempo.</span></div></td></tr>'}</tbody></table></div></div>`;
  $('#app').querySelectorAll('tr[data-id]').forEach(tr => { const abrir = () => gavetaCliente(+tr.dataset.id); tr.onclick = abrir; tr.onkeydown = e => { if (e.key === 'Enter') abrir(); }; });
}

/* ---------- evolucao da base ---------- */
async function pgEvolucao() {
  const d = await api('analises/evolucao');
  const max = Math.max(1, ...d.meses.map(m => m.total));
  const md = d.medias || {};
  $('#app').innerHTML = `
  <div class="page-head"><div><h1>Evolução da base</h1><p class="sub">Quantos clientes pediram em cada mês: novos (primeiro pedido) e recorrentes (já eram clientes).</p></div></div>
  <section class="faixa" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px">
    <div class="ind"><span class="rot">Crescimento médio, total</span><span class="val num">${pct1(md.total)}</span><div class="rod"><span class="nota">por mês</span></div></div>
    <div class="ind"><span class="rot">Crescimento médio, novos</span><span class="val num">${pct1(md.novos)}</span><div class="rod"><span class="nota">por mês</span></div></div>
    <div class="ind"><span class="rot">Crescimento médio, recorrentes</span><span class="val num">${pct1(md.recorrentes)}</span><div class="rod"><span class="nota">por mês</span></div></div></section>
  <section class="painel pad"><div class="gcols" role="img" aria-label="Clientes por mês">${d.meses.map(m => `<div class="gcol" title="${esc(mesLongo(m.mes))}: ${m.novos} novos e ${m.recorrentes} recorrentes${m.emAndamento ? ' (mês em andamento)' : ''}">
    <div class="gbars empilha-v ${m.emAndamento ? 'andamento' : ''}"><i class="rec" style="height:${m.recorrentes / max * 100}%"></i><i class="nov" style="height:${m.novos / max * 100}%"></i></div><span>${esc(mesLongo(m.mes))}</span><b class="num">${m.total}</b></div>`).join('')}</div>
    <div class="legenda-tab" style="margin-top:8px"><span><i style="background:var(--crosta)"></i>Novos</span><span><i style="background:var(--tinta)"></i>Recorrentes</span><span class="nota">Barra clara: mês em andamento</span></div></section>
  <h2 class="sec">Mês a mês</h2>
  <div class="painel"><div class="rolagem"><table class="tabela"><thead><tr><th>Mês</th><th class="d">Novos</th><th class="d">Recorrentes</th><th class="d">Total</th><th class="d">Variação do total</th></tr></thead><tbody>
    ${[...d.meses].reverse().map(m => `<tr style="cursor:default"><td>${esc(mesLongo(m.mes))}${m.emAndamento ? ' <span class="nota">(em andamento)</span>' : ''}</td><td class="d num">${m.novos}</td><td class="d num">${m.recorrentes}${m.historicoCurto ? ' <span class="nota" title="Histórico ainda curto neste mês">*</span>' : ''}</td><td class="d num"><b>${m.total}</b></td><td class="d">${m.emAndamento || m.historicoCurto ? '' : delta1(m.cresce)}</td></tr>`).join('') || '<tr><td colspan="5"><div class="vazio"><b>Sem dados ainda</b></div></td></tr>'}</tbody></table></div></div>
  ${d.inicio ? nota(`O histórico começa em ${dataBr(d.inicio + 'T12:00')}. O primeiro mês não entra porque não dá para separar novos de recorrentes. Nos meses com *, o histórico ainda é curto e os recorrentes aparecem menores do que são; esses meses ficam fora das médias.`) : ''}`;
}
