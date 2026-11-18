'use strict';
/* Fluxos de automacao: lista e construtor (gatilho, esperas, mensagens).
   Carregado depois de editor.js e antes de app.js: os helpers de app.js so sao usados quando as funcoes rodam. */

const GATILHOS = {
  pedido_novo: ['Depois de um pedido', 'Entra quando um pedido novo chega do PDV. Pedidos antigos não entram.'],
  primeiro_pedido: ['No primeiro pedido do cliente', 'Entra quando um cliente faz o primeiro pedido dele.'],
  sem_pedir: ['Quando o cliente fica sem pedir', 'Entra quando o cliente completa o número de dias sem pedir (janela de 3 dias, para não pegar quem sumiu há muito tempo).'],
  aniversario: ['No aniversário do cliente', 'Entra no dia do aniversário. Precisa da data de nascimento do cliente no cadastro.'],
};
const msg = t => ({ type: 'enviar', campaign_id: null, texto: t });
const espera = (valor, unidade = 'dias') => ({ type: 'esperar', valor, unidade });
const MODELOS_FLUXO = {
  agradecimento: { name: 'Agradecimento depois do pedido', trigger: { tipo: 'pedido_novo' }, steps: [espera(1), msg('Obrigado pelo pedido, [nome_cliente]! Gostou? Se puder, conta pra gente como foi.')] },
  recompra: { name: 'Lembrete de recompra', trigger: { tipo: 'sem_pedir', dias: 15 }, steps: [msg('Oi, [nome_cliente]! Bateu saudade de pedir [produto_favorito]? Faz uns dias que você não aparece por aqui.')] },
  boasvindas: { name: 'Boas-vindas ao primeiro pedido', trigger: { tipo: 'primeiro_pedido' }, steps: [espera(2), msg('Que bom ter você com a gente, [nome_cliente]! Esperamos que tenha gostado do primeiro pedido.'), espera(10), msg('Já faz uns dias, [nome_cliente]! Que tal pedir de novo e matar a saudade da crocância?')] },
  aniversario: { name: 'Feliz aniversário', trigger: { tipo: 'aniversario' }, steps: [msg('Parabéns, [nome_cliente]! Hoje o dia é seu. Peça o seu favorito e comemore com a gente.')] },
};
const gatilhoTexto = t => t.tipo === 'sem_pedir' ? `Sem pedir há ${t.dias} dias` : GATILHOS[t.tipo]?.[0] || '';
const esperaTexto = s => `${s.valor} ${s.unidade === 'horas' ? (s.valor === 1 ? 'hora' : 'horas') : (s.valor === 1 ? 'dia' : 'dias')}`;
const ESTADO_RUN = { ativo: ['Em andamento', 'var(--ambar)'], concluido: ['Concluído', 'var(--folha)'], saiu: ['Saiu', 'var(--texto-2)'], falhou: ['Falhou', 'var(--pimenta)'] };
const STATUS_FLUXO = { rascunho: ['Rascunho', 'off'], ativo: ['Ativo', 'on'], pausado: ['Pausado', 'off'] };
const STATUS_MSG = { rascunho: ['Rascunho', 'var(--texto-2)'], aguardando: ['Aguardando a Meta', 'var(--ambar)'], publicada: ['Publicada', 'var(--folha)'] };

/* ---------- lista ---------- */
async function pgFluxos() {
  const lista = await api('flows');
  const trilha = f => `<div class="fx-mini"><span class="fx-chip gat">${esc(gatilhoTexto(f.trigger))}</span>${f.steps.map(s => `<span class="fx-seta">›</span><span class="fx-chip ${s.type}">${s.type === 'esperar' ? 'Esperar ' + esperaTexto(s) : 'Mensagem'}</span>`).join('')}</div>`;
  $('#app').innerHTML = `
  <div class="page-head"><div><h1>Fluxos</h1><p class="sub">Mensagens automáticas que acompanham o cliente depois de um evento, como um pedido ou o aniversário.</p></div>
    <button class="btn primario" id="novo">${icon('mais')}Novo fluxo</button></div>
  ${META.mode !== 'live' ? '<div class="aviso neutro" style="margin-bottom:16px"><b>Modo teste.</b> Um fluxo ativo só envia de verdade com o envio real ligado. Você já pode montar e ver quem entraria.</div>' : ''}
  ${lista.length ? `<div class="grade">${lista.map(f => { const st = STATUS_FLUXO[f.status], s = f.stats;
    return `<article class="painel camp-card">
      <header><div><h3>${esc(f.name)}</h3></div><span class="status ${st[1]}">${st[0]}</span></header>
      ${trilha(f)}
      <div class="numeros"><div><small>Entraram</small><b class="num">${inteiro(s.entraram)}</b></div><div><small>Em andamento</small><b class="num">${inteiro(s.andamento)}</b></div><div><small>Enviadas</small><b class="num">${inteiro(s.enviadas)}</b></div><div><small>Receita</small><b class="num">${brlCurto(s.receita)}</b></div></div>
      ${f.aviso?.parado ? `<div class="aviso">Parado: ${esc(f.aviso.parado)}.</div>` : ''}
      <div class="acoes"><a class="btn ouro" href="#/fluxo?id=${f.id}">${f.status === 'ativo' ? 'Ver fluxo' : 'Editar'}</a>
        ${f.status === 'ativo' ? `<button class="btn" data-pausar="${f.id}">Pausar</button>` : ''}
        ${f.status !== 'ativo' && s.enviadas === 0 ? `<button class="btn pequeno" data-apagar="${f.id}" data-nome="${esc(f.name)}">Apagar</button>` : ''}</div></article>`; }).join('')}</div>` : ''}
  <h2 class="sec">${lista.length ? 'Começar de um modelo' : 'Comece por um modelo'}<small>Você ajusta tudo depois</small></h2>
  <div class="grade modelos">${Object.entries(MODELOS_FLUXO).map(([k, m]) => `<button class="painel modelo" data-modelo="${k}"><b>${esc(m.name)}</b><span>${esc(gatilhoTexto(m.trigger))}</span>
    <div class="fx-mini">${m.steps.map(s => `<span class="fx-chip ${s.type}">${s.type === 'esperar' ? esperaTexto(s) : 'Mensagem'}</span>`).join('<span class="fx-seta">›</span>')}</div></button>`).join('')}</div>`;
  $('#novo').onclick = () => { location.hash = '#/fluxo?novo=1'; };
  document.querySelectorAll('[data-modelo]').forEach(b => b.onclick = () => { location.hash = '#/fluxo?modelo=' + b.dataset.modelo; });
  document.querySelectorAll('[data-pausar]').forEach(b => b.onclick = async () => { try { await api('flows/status', { id: +b.dataset.pausar, status: 'pausado' }); toast('Fluxo pausado.'); rota(); } catch (e) { toast(e.message, true); } });
  document.querySelectorAll('[data-apagar]').forEach(b => b.onclick = async () => {
    if (!await confirmar({ titulo: `Apagar "${b.dataset.nome}"?`, html: '<p style="color:var(--texto-2)">O fluxo e as mensagens dele são apagados. Não dá para desfazer.</p>', ok: 'Apagar', perigo: true })) return;
    try { await api('flows/delete', { id: +b.dataset.apagar }); toast('Fluxo apagado.'); rota(); } catch (e) { toast(e.message, true); }
  });
}

/* ---------- construtor ---------- */
let fl = null;
const flTrava = () => fl.status === 'ativo';

async function pgFluxo(qs) {
  if (qs.get('id')) fl = await api('flow?id=' + qs.get('id'));
  else {
    const m = MODELOS_FLUXO[qs.get('modelo')] || { name: '', trigger: { tipo: 'pedido_novo' }, steps: [espera(1), msg('')] };
    fl = { id: null, name: m.name, status: 'rascunho', trigger: JSON.parse(JSON.stringify(m.trigger)), steps: JSON.parse(JSON.stringify(m.steps)),
      schedule: JSON.parse(JSON.stringify(META.scheduleDefaults)), exit_on_order: true, reentry_days: 30, stats: null, runs: [], preview: null, aviso: null };
  }
  flDesenhar();
  flPreview();
}

function flDesenhar() {
  const st = STATUS_FLUXO[fl.status], trava = flTrava(), s = fl.schedule, g = fl.trigger;
  const passos = fl.steps.map((p, i) => {
    const controles = trava ? '' : `<div class="fx-ctl"><button class="btn pequeno" data-fa="sobe" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir etapa">Subir</button>
      <button class="btn pequeno" data-fa="desce" data-i="${i}" ${i === fl.steps.length - 1 ? 'disabled' : ''} aria-label="Descer etapa">Descer</button><button class="btn pequeno" data-fa="tira" data-i="${i}">Remover</button></div>`;
    if (p.type === 'esperar') return `<div class="fx-liga"></div><div class="fx-no"><div class="fx-ico espera">${icon('relogio')}</div><div class="fx-corpo-no"><b>Esperar</b>
      <div class="fx-linha"><input class="campo" type="number" min="1" data-fp="${i}:valor" value="${esc(p.valor)}" ${trava ? 'disabled' : ''} aria-label="Tempo de espera"><select class="campo" data-fp="${i}:unidade" ${trava ? 'disabled' : ''} aria-label="Unidade"><option value="dias" ${p.unidade !== 'horas' ? 'selected' : ''}>dias</option><option value="horas" ${p.unidade === 'horas' ? 'selected' : ''}>horas</option></select></div></div>${controles}</div>`;
    const c = p.campanha, ad = c?.ads?.[0], ms = c ? STATUS_MSG[c.status] || STATUS_MSG.rascunho : null;
    return `<div class="fx-liga"></div><div class="fx-no"><div class="fx-ico envia">${icon('chat')}</div><div class="fx-corpo-no"><b>Enviar mensagem <span class="nota">WhatsApp</span></b>
      ${c ? `<div class="fx-msg">${ad?.media ? `<img src="/media/${esc(ad.media)}" alt="">` : ''}<div>${balao(ad?.body || '')}
          <div class="fx-linha"><span class="pill" style="--c:${ms[1]}">${ms[0]}</span>${c.ads.length > 1 ? `<span class="nota">${c.ads.length} versões</span>` : ''}<button class="btn pequeno" data-fa="msg" data-i="${i}">Editar mensagem, imagem e botões</button></div></div></div>`
        : `<textarea class="campo" rows="3" data-fp="${i}:texto" placeholder="Oi, [nome_cliente]! …">${esc(p.texto || '')}</textarea><p class="nota">Use [nome_cliente] uma vez, com texto antes e depois. Depois de salvar, dá para adicionar imagem e botões.</p>`}</div>${controles}</div>`;
  }).join('');

  $('#app').innerHTML = `
  <div class="ed">
    <header class="ed-topo"><a class="btn pequeno" href="#/fluxos">Voltar</a>
      <input class="campo fx-nome" data-fn="name" value="${esc(fl.name)}" placeholder="Nome do fluxo" aria-label="Nome do fluxo">
      <span class="status ${st[1]}">${st[0]}</span>
      <button class="btn" id="fl-salvar">Salvar</button>
      ${fl.status === 'ativo' ? '<button class="btn" id="fl-pausar">Pausar fluxo</button>' : '<button class="btn ouro" id="fl-ativar">Ativar fluxo</button>'}
    </header>
    ${trava ? '<div class="aviso neutro" style="margin-bottom:14px">Fluxo ativo. Para mudar as etapas, pause o fluxo primeiro. Nome, regras e horários podem ser editados a qualquer momento.</div>' : ''}
    ${fl.aviso?.parado ? `<div class="aviso" style="margin-bottom:14px"><b>Parado:</b> ${esc(fl.aviso.parado)}.</div>` : ''}
    <div class="fx-grade">
      <section class="fx-trilha" id="fx-trilha">
        <div class="fx-no gatilho"><div class="fx-ico gat">${icon('raio')}</div><div class="fx-corpo-no"><b>Quando o cliente entra</b>
          <div class="fx-linha"><select class="campo" data-fg="tipo" ${trava ? 'disabled' : ''} aria-label="Gatilho">${Object.entries(GATILHOS).map(([k, [n]]) => `<option value="${k}" ${g.tipo === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
            ${g.tipo === 'sem_pedir' ? `<input class="campo" type="number" min="1" max="365" data-fg="dias" value="${esc(g.dias ?? 15)}" ${trava ? 'disabled' : ''} aria-label="Dias sem pedir"><span class="nota">dias sem pedir</span>` : ''}</div>
          <p class="nota">${GATILHOS[g.tipo][1]}</p><p class="nota" id="fl-previa" aria-live="polite"></p></div></div>
        ${passos}
        ${trava ? '' : `<div class="fx-liga"></div><div class="fx-add"><button class="btn pequeno" data-fa="add-espera">+ Esperar</button><button class="btn pequeno" data-fa="add-msg">+ Enviar mensagem</button></div>`}
        <div class="fx-liga"></div><div class="fx-fim">Fim do fluxo</div>
      </section>
      <aside class="fx-lado">
        ${fl.stats && fl.stats.entraram ? `<div class="painel pad ed-bloco"><h3>Resultados</h3><div class="numeros"><div><small>Entraram</small><b class="num">${inteiro(fl.stats.entraram)}</b></div><div><small>Em andamento</small><b class="num">${inteiro(fl.stats.andamento)}</b></div><div><small>Concluídos</small><b class="num">${inteiro(fl.stats.concluidos)}</b></div><div><small>Saíram</small><b class="num">${inteiro(fl.stats.sairam)}</b></div></div>
          <div class="numeros"><div><small>Enviadas</small><b class="num">${inteiro(fl.stats.enviadas)}</b></div><div><small>Voltaram</small><b class="num">${inteiro(fl.stats.voltaram)}</b></div><div style="grid-column:span 2"><small>Receita</small><b class="num">${brl(fl.stats.receita)}</b></div></div></div>` : ''}
        <div class="painel pad ed-bloco"><h3>Regras</h3>
          <label class="chk" style="width:auto"><input type="checkbox" data-fr="exit_on_order" ${fl.exit_on_order ? 'checked' : ''}><span>Sair do fluxo se o cliente pedir de novo</span></label>
          <label class="f">Não entrar de novo antes de<input class="campo" type="number" min="1" max="365" data-fr="reentry_days" value="${esc(fl.reentry_days)}"><small>dias</small></label></div>
        <div class="painel pad ed-bloco"><h3>Horário de envio</h3><p class="nota">As mensagens só saem nestes dias e horários. Se a espera acabar fora do horário, a mensagem espera a próxima janela.</p>
          ${DIAS.map((n, i) => { const d = s.days[i]; return `<div class="dia-linha"><label class="chk"><input type="checkbox" data-fd="${i}:on" ${d.on ? 'checked' : ''}><span>${n}</span></label>
            ${d.on ? `<span class="horas"><input class="campo" type="time" data-fd="${i}:from" value="${esc(d.from)}" aria-label="${n}, início"> <span class="nota">até</span> <input class="campo" type="time" data-fd="${i}:to" value="${esc(d.to)}" aria-label="${n}, fim"></span>` : '<span class="nota">Sem envio</span>'}</div>`; }).join('')}
          <div class="form-grid" style="margin-top:6px"><label class="f">Mensagens por minuto<input class="campo" type="number" min="1" max="60" data-fs="per_minute" value="${esc(s.per_minute)}"></label>
            <label class="f">Tentativas por cliente<input class="campo" type="number" min="1" max="10" data-fs="max_attempts" value="${esc(s.max_attempts)}"></label></div></div>
        ${fl.runs?.length ? `<div class="painel pad ed-bloco"><h3>Últimos clientes no fluxo</h3>${fl.runs.map(r => `<div class="lista-run"><div><b>${esc(nomeBonito(r.name))}</b><small>${r.state === 'ativo' ? `etapa ${r.step + 1}, próximo passo ${quando(r.next_at)}` : esc(r.exit_reason || '')}</small></div><span class="pill" style="--c:${ESTADO_RUN[r.state][1]}">${ESTADO_RUN[r.state][0]}</span></div>`).join('')}</div>` : ''}
      </aside>
    </div>
  </div>`;
  const raiz = $('#app');
  raiz.oninput = flEntrada; raiz.onchange = flMudou; raiz.onclick = flClique;
  $('#fl-salvar').onclick = async () => { try { await flSalvar(); toast('Fluxo salvo.'); flDesenhar(); } catch (e) { toast(e.message, true); } };
  if ($('#fl-ativar')) $('#fl-ativar').onclick = flAtivar;
  if ($('#fl-pausar')) $('#fl-pausar').onclick = async () => { try { fl = await api('flows/status', { id: fl.id, status: 'pausado' }); toast('Fluxo pausado.'); flDesenhar(); flPreview(); } catch (e) { toast(e.message, true); } };
  flPreviaTexto();
}

let flPrevAtrasado = null;
function flPreview() {
  flPrevAtrasado ||= debounce(async () => {
    try { fl.preview = await api('flows/preview', { id: fl.id, trigger: fl.trigger, reentry_days: fl.reentry_days }); } catch { fl.preview = null; }
    flPreviaTexto();
  }, 300);
  flPrevAtrasado();
}
function flPreviaTexto() {
  const el = $('#fl-previa'); if (!el) return;
  const p = fl.preview, t = fl.trigger.tipo;
  if (!p) { el.textContent = ''; return; }
  if (t === 'pedido_novo' || t === 'primeiro_pedido') el.innerHTML = fl.status === 'ativo' ? `Agora, <b class="num">${inteiro(p.quantos)}</b> ${p.quantos === 1 ? 'cliente entraria' : 'clientes entrariam'}.` : 'Só entram pedidos feitos depois que você ativar o fluxo.';
  else if (t === 'aniversario') el.innerHTML = p.comAniversario ? `Hoje, <b class="num">${inteiro(p.quantos)}</b> ${p.quantos === 1 ? 'cliente faz' : 'clientes fazem'} aniversário. <span class="nota">${inteiro(p.comAniversario)} clientes têm data de nascimento cadastrada.</span>` : '<b>Nenhum cliente tem data de nascimento cadastrada ainda.</b> Sem isso, o fluxo de aniversário não tem quem receber.';
  else el.innerHTML = `Hoje, <b class="num">${inteiro(p.quantos)}</b> ${p.quantos === 1 ? 'cliente entraria' : 'clientes entrariam'} neste fluxo.`;
}

/* eventos */
function flEntrada(e) {
  const t = e.target;
  if (t.type === 'checkbox') return;
  if (t.dataset.fn !== undefined) fl.name = t.value;
  else if (t.dataset.fg) { fl.trigger[t.dataset.fg] = t.type === 'number' ? (t.value === '' ? '' : +t.value) : t.value; flPreview(); }
  else if (t.dataset.fp) { const [i, k] = t.dataset.fp.split(':'); fl.steps[+i][k] = t.type === 'number' ? (t.value === '' ? '' : +t.value) : t.value; }
  else if (t.dataset.fr) fl[t.dataset.fr] = t.type === 'number' ? (t.value === '' ? '' : +t.value) : t.value;
  else if (t.dataset.fd) { const [i, k] = t.dataset.fd.split(':'); fl.schedule.days[i][k] = t.value; }
  else if (t.dataset.fs) fl.schedule[t.dataset.fs] = t.value === '' ? null : +t.value;
}
function flMudou(e) {
  const t = e.target;
  if (t.dataset.fg === 'tipo') { fl.trigger = t.value === 'sem_pedir' ? { tipo: 'sem_pedir', dias: 15 } : { tipo: t.value }; flDesenhar(); flPreview(); }
  else if (t.dataset.fp?.endsWith(':unidade')) fl.steps[+t.dataset.fp.split(':')[0]].unidade = t.value;
  else if (t.dataset.fr === 'exit_on_order') fl.exit_on_order = t.checked;
  else if (t.dataset.fd?.endsWith(':on')) { fl.schedule.days[t.dataset.fd.split(':')[0]].on = t.checked; flDesenhar(); }
}
async function flClique(e) {
  const b = e.target.closest('[data-fa]'); if (!b) return;
  const i = +b.dataset.i, a = b.dataset.fa, p = fl.steps;
  if (a === 'sobe' && i > 0) [p[i - 1], p[i]] = [p[i], p[i - 1]];
  else if (a === 'desce' && i < p.length - 1) [p[i + 1], p[i]] = [p[i], p[i + 1]];
  else if (a === 'tira') p.splice(i, 1);
  else if (a === 'add-espera') p.push(espera(1));
  else if (a === 'add-msg') p.push(msg(''));
  else if (a === 'msg') return flEditarMensagem(i);
  flDesenhar();
}

async function flSalvar() {
  const body = { id: fl.id, name: fl.name, trigger: fl.trigger, exit_on_order: fl.exit_on_order, reentry_days: fl.reentry_days, schedule: fl.schedule,
    steps: fl.steps.map(s => s.type === 'esperar' ? { type: 'esperar', valor: s.valor, unidade: s.unidade } : { type: 'enviar', campaign_id: s.campaign_id || null, texto: s.texto || '' }) };
  const r = await api('flows', body);
  if (!fl.id) history.replaceState(null, '', '#/fluxo?id=' + r.id);
  fl = await api('flow?id=' + r.id);
  return r.id;
}
async function flEditarMensagem(i) {
  try {
    await flSalvar();
    const s = fl.steps[i];
    if (!s?.campaign_id) return toast('Salve o fluxo antes de editar a mensagem.', true);
    location.hash = `#/campanha?id=${s.campaign_id}&fluxo=${fl.id}&etapa=anuncio`;
  } catch (e) { toast(e.message, true); }
}
async function flAtivar() {
  try {
    await flSalvar();
    const quem = fl.steps.filter(s => s.type === 'enviar').length;
    if (META.mode === 'live' && !await confirmar({ titulo: 'Ativar este fluxo?', html: `<p style="color:var(--texto-2)">A partir de agora o programa coloca clientes no fluxo e envia ${quem === 1 ? 'a mensagem' : `as ${quem} mensagens`} sozinho, nos horários escolhidos. Ele precisa ficar aberto neste computador. Você pode pausar quando quiser.</p>`, ok: 'Ativar' })) return flDesenhar();
    fl = await api('flows/status', { id: fl.id, status: 'ativo' });
    toast(META.mode === 'live' ? 'Fluxo ativado.' : 'Fluxo ativado em modo teste. Nada é enviado de verdade.');
    flDesenhar(); flPreview();
  } catch (e) { toast(e.message, true); flDesenhar(); }
}
