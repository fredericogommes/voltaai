'use strict';
/* Editor de campanha (etapas + previa de celular) e galeria de imagens.
   Carregado ANTES de app.js: aqui dentro so se usam os helpers de app.js quando as funcoes rodam. */

const PASSOS = [['ajustes', 'Ajustes'], ['audiencia', 'Audiência'], ['anuncio', 'Anúncio'], ['agendamento', 'Agendamento'], ['revisao', 'Revisão']];
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const LEMBRETES = [[1, '1 dia depois'], [7, '7 dias depois'], [15, '15 dias depois'], [21, '21 dias depois']];
const resumoDias = s => {
  const on = Object.entries(s.days).filter(([, d]) => d.on);
  if (!on.length) return 'nenhum dia escolhido';
  const horas = [...new Set(on.map(([, d]) => `${d.from} às ${d.to}`))];
  return `${on.map(([i]) => DIAS_CURTOS[i]).join(', ')}, ${horas.length === 1 ? horas[0] : 'horários variados'}`;
};
const BTN_TIPOS = { url: 'Abrir link', reply: 'Resposta rápida', copy: 'Copiar código', optin: 'Aceitar receber mensagens' };
const RODAPE_SAIR = 'Para cancelar, responda SAIR.';
// dentro de um fluxo, a mensagem so tem Anuncio e Revisao (publico e horario sao do fluxo)
const edPassos = () => ed?.fluxo ? PASSOS.filter(([k]) => k === 'anuncio' || k === 'revisao') : PASSOS;
const adVazio = i => ({ label: 'ABC'[i], media: null, header: '', body: '', footer: RODAPE_SAIR, buttons: [] });
const TAG_NOME = /\[nome_cliente\]|\{nome\}/g;
const TAGS_ALL = /\[(nome_cliente|produto_favorito)\]|\{nome\}/g;
const tagsDe = t => [...String(t).matchAll(TAGS_ALL)].map(m => m[1] || 'nome_cliente');
const TAG_EXTREMO = /^(\[nome_cliente\]|\[produto_favorito\]|\{nome\})|(\[nome_cliente\]|\[produto_favorito\]|\{nome\})[\s.!?,:;]*$/;
const previaTags = t => String(t).replace(/\[produto_favorito\]/g, 'Cento Promocional 1').replace(TAG_NOME, 'Maria');
let ed = null;

/* ---------- galeria de imagens ---------- */
async function enviarImagem(file) {
  if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Use uma imagem JPG ou PNG. O WhatsApp não aceita outros formatos.');
  if (file.size > 5 * 1024 * 1024) throw new Error('A imagem passa de 5 MB, limite do WhatsApp. Reduza o tamanho e tente de novo.');
  const r = await fetch('/api/media?name=' + encodeURIComponent(file.name), { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Não consegui enviar a imagem.');
  return j;
}
const kb = n => n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

function zonaEnvio(id) {
  return `<label class="envio" for="${id}"><input type="file" id="${id}" accept="image/png,image/jpeg" hidden>
    <b>Enviar imagem</b><span>JPG ou PNG, até 5 MB. Clique ou solte aqui.</span></label>`;
}
function ligarEnvio(id, aoEnviar) {
  const inp = $('#' + id), zona = inp.closest('.envio');
  const enviar = async f => { if (!f) return; zona.classList.add('ocupada'); try { aoEnviar(await enviarImagem(f)); } catch (e) { toast(e.message, true); } zona.classList.remove('ocupada'); };
  inp.onchange = () => { enviar(inp.files[0]); inp.value = ''; };
  zona.ondragover = e => { e.preventDefault(); zona.classList.add('sobre'); };
  zona.ondragleave = () => zona.classList.remove('sobre');
  zona.ondrop = e => { e.preventDefault(); zona.classList.remove('sobre'); enviar(e.dataTransfer.files[0]); };
}

async function abrirGaleria(aoEscolher) {
  const lista = await api('media');
  abrirGaveta('Escolher imagem', `${zonaEnvio('up-gal')}
    ${lista.length ? `<div class="galeria">${lista.map(m => `<button class="foto" data-f="${esc(m.file)}" aria-label="Usar esta imagem"><img src="${esc(m.url)}" alt=""><span>${kb(m.size)}</span></button>`).join('')}</div>`
      : '<div class="vazio"><b>Sua galeria está vazia</b><span>Envie a primeira imagem acima.</span></div>'}`);
  $('#drawer-body').querySelectorAll('.foto').forEach(b => b.onclick = () => { fecharGaveta(); aoEscolher(b.dataset.f); });
  ligarEnvio('up-gal', m => { fecharGaveta(); aoEscolher(m.file); });
}

async function pgMidias() {
  const lista = await api('media');
  $('#app').innerHTML = `
  <div class="page-head"><div><h1>Galeria de mídias</h1><p class="sub">Imagens para usar nas campanhas de WhatsApp.</p></div></div>
  ${zonaEnvio('up-pag')}
  <div class="galeria grande" style="margin-top:16px">${lista.map(m => `<figure class="foto" style="margin:0"><img src="${esc(m.url)}" alt=""><figcaption><span>${kb(m.size)}${m.emUso ? ' · em uso' : ''}</span>
      <button class="btn pequeno" data-del="${esc(m.file)}" ${m.emUso ? 'disabled title="Esta imagem está em uso por uma campanha"' : ''}>Apagar</button></figcaption></figure>`).join('')}</div>
  ${lista.length ? '' : '<div class="painel vazio" style="margin-top:16px"><b>Nenhuma imagem ainda</b><span>Envie uma foto dos seus produtos para usar nas mensagens.</span></div>'}`;
  ligarEnvio('up-pag', () => { toast('Imagem enviada.'); rota(); });
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!await confirmar({ titulo: 'Apagar esta imagem?', html: '<p style="color:var(--texto-2)">Ela sai da galeria e não dá para desfazer.</p>', ok: 'Apagar', perigo: true })) return;
    try { await api('media/delete', { file: b.dataset.del }); toast('Imagem apagada.'); rota(); } catch (e) { toast(e.message, true); }
  });
}

/* ---------- estado e validacao do editor ---------- */
const edAd = () => ed.ads[ed.ad];
const nTags = t => (String(t).match(TAG_NOME) || []).length;

function edErros() {
  const e = { ajustes: [], audiencia: [], anuncio: [], agendamento: [] };
  const s = ed.schedule;
  if (s.end && s.start && s.end < s.start) e.agendamento.push('A data de término não pode ser antes da data de início.');
  Object.entries(s.days).forEach(([i, d]) => { if (d.on && (!d.from || !d.to || d.from >= d.to)) e.agendamento.push(`Em ${DIAS[i].toLowerCase()}, o horário final precisa ser depois do inicial.`); });
  if (s.auto && !Object.values(s.days).some(d => d.on)) e.agendamento.push('Escolha pelo menos um dia da semana para o envio automático.');
  if (!String(ed.name || '').trim()) e.ajustes.push('Dê um nome à campanha.');
  if (ed.max_days !== '' && ed.max_days != null && +ed.max_days < +ed.min_days) e.audiencia.push('O máximo de dias não pode ser menor que o mínimo.');
  ed.ads.forEach(a => {
    const L = `Anúncio ${a.label}`;
    if (!a.body.trim()) e.anuncio.push(`${L}: escreva a mensagem.`);
    if (ed.channel !== 'whatsapp') return;
    const tg = tagsDe(a.body);
    if (new Set(tg).size !== tg.length) e.anuncio.push(`${L}: use cada variável (nome do cliente, pedido favorito) só uma vez.`);
    if (tg.length && TAG_EXTREMO.test(a.body.trim())) e.anuncio.push(`${L}: a Meta não aceita uma variável no começo nem no fim. Coloque texto antes e depois.`);
    a.buttons.forEach((b, i) => {
      if (b.type !== 'copy' && !b.text.trim()) e.anuncio.push(`${L}, botão ${i + 1}: escreva o texto.`);
      if (b.type === 'url' && !/^https?:\/\/\S+$/i.test(b.value)) e.anuncio.push(`${L}, botão ${i + 1}: informe um link começando com https://.`);
      if (b.type === 'copy' && (!b.value || b.value.length > 15)) e.anuncio.push(`${L}, botão ${i + 1}: informe o código a copiar (até 15 caracteres).`);
    });
  });
  return e;
}
const edTemErro = () => Object.values(edErros()).some(l => l.length);

/* ---------- pagina do editor ---------- */
async function pgEditor(qs) {
  const padrao = { min_days: 30, max_days: 90, min_orders: 1, cooldown_days: 30 };
  if (qs.get('id')) {
    const c = await api('campaign?id=' + qs.get('id'));
    ed = { ...c, max_days: c.max_days ?? '', passo: qs.get('etapa') || 'ajustes', ad: 0, modo: 'final', alcance: c.prontos, fluxo: qs.get('fluxo') ? +qs.get('fluxo') : null };
    if (ed.fluxo && !['anuncio', 'revisao'].includes(ed.passo)) ed.passo = 'anuncio';
  } else {
    const p = SEG[qs.get('modelo')]?.preset;
    ed = { id: null, name: p?.name || '', channel: ['sms', 'email'].includes(qs.get('canal')) ? qs.get('canal') : 'whatsapp', category: 'marketing', status: 'rascunho', templates: [],
      schedule: JSON.parse(JSON.stringify(META.scheduleDefaults)),
      ...padrao, ...(p ? { min_days: p.min_days, max_days: p.max_days, cooldown_days: p.cooldown_days } : {}),
      ads: [{ ...adVazio(0), body: p?.message || '' }], passo: 'ajustes', ad: 0, modo: 'final', alcance: null };
  }
  edDesenhar();
  edAlcance();
}

const STATUS_CAMP = { rascunho: ['Rascunho', 'off'], aguardando: ['Aguardando aprovação da Meta', 'aviso'], publicada: ['Publicada', 'on'] };
function edDesenhar() {
  const erros = edErros(), st = STATUS_CAMP[ed.status] || STATUS_CAMP.rascunho;
  $('#app').innerHTML = `
  <div class="ed">
    <header class="ed-topo">
      <a class="btn pequeno" href="${ed.fluxo ? `#/fluxo?id=${ed.fluxo}` : '#/campanhas'}">${ed.fluxo ? 'Voltar ao fluxo' : 'Voltar'}</a>
      <div style="min-width:0;flex:1"><h1 id="ed-titulo">${esc(ed.name || 'Nova campanha')}</h1></div>
      <span class="status ${st[1] === 'aviso' ? 'off' : st[1]}">${st[0]}</span>
      <button class="btn" id="ed-salvar">Salvar rascunho</button>
      <button class="btn ouro" id="ed-publicar">${ed.fluxo ? 'Publicar mensagem' : 'Publicar campanha'}</button>
    </header>
    <div class="ed-corpo">
      <nav class="ed-passos" aria-label="Etapas">${edPassos().map(([k, n]) => {
        const falta = erros[k]?.length, ok = k !== 'revisao' && !falta;
        return `<button data-passo="${k}" ${ed.passo === k ? 'aria-current="step"' : ''}><span class="marca ${falta ? 'erro' : ok ? 'ok' : ''}">${falta ? '!' : ok ? '✓' : ''}</span>${n}</button>`; }).join('')}</nav>
      <section class="ed-main" id="ed-main"></section>
      <aside class="ed-lado" id="ed-lado"></aside>
    </div>
  </div>`;
  edPasso(); edLado();
  document.querySelectorAll('[data-passo]').forEach(b => b.onclick = () => { ed.passo = b.dataset.passo; edDesenhar(); });
  $('#ed-salvar').onclick = () => edSalvar(false);
  $('#ed-publicar').onclick = edPublicar;
  const main = $('#ed-main');
  main.oninput = edEntrada; main.onchange = edMudou; main.onclick = edClique;
}

/* ----- etapas ----- */
function edPasso() {
  const m = $('#ed-main');
  if (ed.passo === 'ajustes') m.innerHTML = `
    <div class="painel pad ed-bloco"><h3>Nome da campanha</h3><p class="nota">Só você vê este nome.</p>
      <input class="campo" data-f="name" value="${esc(ed.name)}" placeholder="Ex.: Volta pra casa" aria-label="Nome da campanha"></div>
    <div class="painel pad ed-bloco"><h3>Canal</h3><p class="nota">Por onde a mensagem vai sair.</p>
      <div class="seg" role="group" aria-label="Canal">${[['whatsapp', 'WhatsApp'], ['sms', 'SMS'], ['email', 'E-mail']].map(([k, n]) => `<button data-acao="canal" data-v="${k}" aria-pressed="${ed.channel === k}">${n}</button>`).join('')}</div>
      ${ed.channel === 'sms' ? '<p class="nota" style="margin-top:10px">SMS usa só texto. Imagem e botões valem apenas para WhatsApp. O programa acrescenta "Para não receber mais, responda SAIR." quando cabe.</p>' : ''}
      ${ed.channel === 'email' ? '<p class="nota" style="margin-top:10px">E-mail tem assunto e texto. Só recebem os clientes com e-mail cadastrado. O rodapé explica como sair da lista.</p>' : ''}</div>
    ${ed.channel === 'whatsapp' ? `<div class="painel pad ed-bloco"><h3>Categoria da mensagem</h3><p class="nota">Define como a Meta classifica e cobra este modelo.</p>
      <div class="opcoes">${[['marketing', 'Marketing', 'Promoções, novidades, convites e qualquer conteúdo de venda.'], ['utility', 'Utilidade', 'Avisos ligados a um pedido ou conta do cliente. Sem conteúdo promocional.']].map(([k, n, d]) =>
        `<button class="opcao" data-acao="cat" data-v="${k}" aria-pressed="${ed.category === k}"><b>${n}</b><span>${d}</span></button>`).join('')}</div></div>` : ''}
    <div class="painel pad ed-bloco"><h3>Controle de ruído</h3><p class="nota">Intervalo entre mensagens desta campanha para o mesmo cliente.</p>
      <label class="linha-num"><input class="campo" type="number" min="1" data-f="cooldown_days" value="${esc(ed.cooldown_days)}"> dias entre envios para o mesmo cliente</label></div>`;
  else if (ed.passo === 'audiencia') m.innerHTML = `
    <div class="painel pad ed-bloco"><h3>Modelos prontos</h3><p class="nota">Preenchem a faixa de dias para você.</p>
      <div class="chips">${SEGS.filter(s => SEG[s].preset).map(s => `<button type="button" class="chip" data-acao="modelo" data-v="${esc(s)}">${esc(SEG[s].preset.name)}</button>`).join('')}</div></div>
    <div class="painel pad ed-bloco"><h3>Lembrete depois do pedido</h3><p class="nota">Para mandar uma mensagem um tempo depois do último pedido, como um agradecimento ou um "bateu a vontade?". Com o envio automático ligado, cada cliente recebe uma vez.</p>
      <div class="chips">${LEMBRETES.map(([n, t]) => `<button type="button" class="chip" data-acao="lembrete" data-v="${n}">${t}</button>`).join('')}</div></div>
    <div class="painel pad ed-bloco"><h3>Quem recebe</h3><p class="nota">Clientes com celular válido, que não pediram descadastro e que não receberam esta campanha dentro do intervalo de ruído.</p>
      <div class="form-grid">
        <label class="f">Sem pedir há pelo menos<input class="campo" type="number" min="0" data-f="min_days" value="${esc(ed.min_days)}"><small>dias</small></label>
        <label class="f">e no máximo<input class="campo" type="number" min="0" data-f="max_days" value="${esc(ed.max_days)}" placeholder="sem limite"><small>dias, vazio para sem limite</small></label>
        <label class="f">Mínimo de pedidos feitos<input class="campo" type="number" min="1" data-f="min_orders" value="${esc(ed.min_orders)}"></label>
      </div></div>
    <div class="painel pad alcance" id="alcance-inline" aria-live="polite"></div>`;
  else if (ed.passo === 'anuncio') edPassoAnuncio(m);
  else if (ed.passo === 'agendamento') edPassoAgendamento(m);
  else edPassoRevisao(m);
  edAlcanceTexto();
}

function edPassoAnuncio(m) {
  const a = edAd(), wa = ed.channel === 'whatsapp', em = ed.channel === 'email', lim = em ? 5000 : wa ? 1024 : 459;
  m.innerHTML = `
  <div class="painel pad ed-bloco"><h3>Anúncios</h3>
    <p class="nota">${wa ? 'Crie até 3 versões. Com mais de uma, os clientes são divididos entre elas para você comparar.' : em ? 'Assunto e texto do e-mail.' : 'Mensagem de texto do SMS.'}</p>
    <div class="abas">${ed.ads.map((x, i) => `<span class="aba ${i === ed.ad ? 'on' : ''}"><button data-acao="anuncio" data-v="${i}">Anúncio ${x.label}</button>${ed.ads.length > 1 ? `<button class="x" data-acao="del-ad" data-v="${i}" aria-label="Remover anúncio ${x.label}">×</button>` : ''}</span>`).join('')}
      ${wa && ed.ads.length < 3 ? '<button class="btn pequeno" data-acao="add-ad">+ Nova versão</button>' : ''}</div></div>
  ${wa ? `<div class="painel pad ed-bloco"><h3>Imagem</h3><p class="nota">Opcional. JPG ou PNG, até 5 MB. Com imagem, o cabeçalho de texto não fica disponível.</p>
    ${a.media ? `<div class="midia-atual"><img src="/media/${esc(a.media)}" alt="Imagem do anúncio"><div style="display:grid;gap:8px"><button class="btn pequeno" data-acao="media-escolher">Trocar imagem</button><button class="btn pequeno" data-acao="media-tirar">Remover</button></div></div>`
      : '<button class="btn" data-acao="media-escolher">Adicionar imagem</button>'}
    <label class="f" style="margin-top:14px">Cabeçalho ${a.media ? '(indisponível com imagem)' : '(opcional)'}<input class="campo" data-ad="header" maxlength="60" value="${esc(a.header)}" ${a.media ? 'disabled placeholder="Remova a imagem para usar o cabeçalho"' : ''}><small><span id="c-header">${a.header.length}</span> / 60</small></label></div>` : ''}
  ${em ? `<div class="painel pad ed-bloco"><h3>Assunto</h3><p class="nota">O que aparece na caixa de entrada. Pode usar [nome_cliente].</p>
    <input class="campo" data-ad="header" maxlength="120" value="${esc(a.header)}" placeholder="[nome_cliente], bateu a vontade?"><small class="nota"><span id="c-header">${a.header.length}</span> / 120</small></div>` : ''}
  <div class="painel pad ed-bloco"><h3>Mensagem</h3>
    <textarea class="campo" data-ad="body" rows="${em ? 10 : 6}" maxlength="${lim}" placeholder="Oi, [nome_cliente]! …">${esc(a.body)}</textarea>
    <div class="ed-ferr"><span class="nota"><span id="c-body">${a.body.length}</span> / ${lim}</span>
      <button class="btn pequeno" data-acao="var">Inserir nome do cliente</button>
      <button class="btn pequeno" data-acao="var-fav" title="O produto que o cliente mais pede">Inserir pedido favorito</button>
      <button class="btn pequeno" data-acao="ia" ${META.ai.configured ? '' : 'title="Precisa da chave ANTHROPIC_API_KEY no arquivo .env"'}>Gerar com IA</button></div>
    ${wa ? '<p class="nota">O nome entra como <b>[nome_cliente]</b> e o produto que o cliente mais pede como <b>[produto_favorito]</b>. Cada um uma vez só, com texto antes e depois.</p>' : ''}</div>
  ${wa ? `<div class="painel pad ed-bloco"><h3>Rodapé</h3><p class="nota">Use para o aviso de descadastro, obrigatório por lei.</p>
    <input class="campo" data-ad="footer" maxlength="60" value="${esc(a.footer)}"><div class="ed-ferr"><span class="nota"><span id="c-footer">${a.footer.length}</span> / 60</span><button class="btn pequeno" data-acao="rodape-sair">Usar aviso de descadastro</button></div></div>
  <div class="painel pad ed-bloco"><h3>Botões</h3><p class="nota">Até 3 por mensagem.</p>
    ${a.buttons.map((b, i) => `<div class="botao-linha"><select class="campo" data-bi="${i}" data-bk="type" aria-label="Tipo do botão">${Object.entries(BTN_TIPOS).map(([k, n]) => `<option value="${k}" ${b.type === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
      ${b.type === 'copy' ? '' : `<input class="campo" data-bi="${i}" data-bk="text" maxlength="25" placeholder="Texto do botão" value="${esc(b.text)}" aria-label="Texto do botão">`}
      ${b.type === 'url' ? `<input class="campo" data-bi="${i}" data-bk="value" placeholder="https://" value="${esc(b.value)}" aria-label="Link">` : ''}
      ${b.type === 'copy' ? `<input class="campo" data-bi="${i}" data-bk="text" maxlength="25" placeholder="Texto do botão (opcional)" value="${esc(b.text)}" aria-label="Texto do botão"><input class="campo" data-bi="${i}" data-bk="value" maxlength="15" placeholder="Código, ex.: VOLTA10" value="${esc(b.value)}" aria-label="Código">` : ''}
      <button class="btn pequeno" data-acao="del-btn" data-v="${i}" aria-label="Remover botão">Remover</button></div>`).join('')}
    ${a.buttons.length < 3 ? '<button class="btn pequeno" data-acao="add-btn">+ Adicionar botão</button>' : ''}</div>` : ''}`;
}

function edPassoAgendamento(m) {
  const s = ed.schedule, live = META.mode === 'live';
  m.innerHTML = `
  <div class="painel pad ed-bloco"><h3>Como enviar</h3>
    <div class="opcoes">
      <button class="opcao" data-acao="auto" data-v="0" aria-pressed="${!s.auto}"><b>Manual</b><span>Você clica em “Enviar agora” quando quiser.</span></button>
      <button class="opcao" data-acao="auto" data-v="1" aria-pressed="${!!s.auto}"><b>Automático</b><span>O programa envia sozinho, em lotes, dentro dos horários abaixo.</span></button></div>
    ${s.auto ? `<p class="nota">O programa precisa ficar aberto neste computador durante os horários de envio. ${live ? 'Depois que a Meta aprovar o modelo, os envios começam sozinhos.' : '<b>Modo teste:</b> nada é enviado de verdade.'}</p>` : ''}</div>
  <div class="painel pad ed-bloco"><h3>Período da campanha</h3><p class="nota">Quando a campanha começa e, se quiser, quando termina.</p>
    <div class="form-grid"><label class="f">Data de início<input class="campo" type="date" data-s="start" value="${esc(s.start)}"></label>
      <label class="f">Data de término (opcional)<input class="campo" type="date" data-s="end" value="${esc(s.end || '')}"></label></div></div>
  <div class="painel pad ed-bloco"><h3>Horário de envio</h3><p class="nota">Os dias e horários em que as mensagens podem sair.</p>
    ${DIAS.map((n, i) => { const d = s.days[i]; return `<div class="dia-linha"><label class="chk"><input type="checkbox" data-sd="${i}:on" ${d.on ? 'checked' : ''}><span>${n}</span></label>
      ${d.on ? `<span class="horas"><input class="campo" type="time" data-sd="${i}:from" value="${esc(d.from)}" aria-label="${n}, início"> <span class="nota">até</span> <input class="campo" type="time" data-sd="${i}:to" value="${esc(d.to)}" aria-label="${n}, fim"></span>` : '<span class="nota">Sem envio</span>'}</div>`; }).join('')}</div>
  <div class="painel pad ed-bloco"><h3>Limites</h3><p class="nota">Deixe em branco para não limitar.</p>
    <div class="form-grid">
      <label class="f">Máximo de mensagens por dia<input class="campo" type="number" min="1" data-s="daily_cap" value="${esc(s.daily_cap ?? '')}" placeholder="sem limite"></label>
      <label class="f">Limite total da campanha<input class="campo" type="number" min="1" data-s="total_cap" value="${esc(s.total_cap ?? '')}" placeholder="sem limite"></label>
      <label class="f">Mensagens por minuto<input class="campo" type="number" min="1" max="60" data-s="per_minute" value="${esc(s.per_minute)}"><small>ritmo do envio automático</small></label>
      <label class="f">Tentativas por cliente<input class="campo" type="number" min="1" max="10" data-s="max_attempts" value="${esc(s.max_attempts)}"><small>depois disso, para de tentar aquele cliente</small></label></div></div>
  ${ed.id && ed.auto ? `<div class="aviso neutro"><b>Hoje:</b> ${inteiro(ed.auto.hoje)} enviadas · <b>Total:</b> ${inteiro(ed.auto.total)}</div>` : ''}`;
}

function edPassoRevisao(m) {
  const erros = edErros(), todos = Object.values(erros).flat(), live = META.mode === 'live';
  const nome = { rascunho: 'Rascunho', aguardando: 'Aguardando aprovação', publicada: 'Publicada' }[ed.status];
  const TPL = { SIMULADO: ['Simulado', 'var(--texto-2)'], PENDING: ['Em análise na Meta', 'var(--ambar)'], APPROVED: ['Aprovado', 'var(--folha)'], REJECTED: ['Rejeitado', 'var(--pimenta)'], ERRO: ['Erro ao enviar', 'var(--pimenta)'] };
  if (ed.fluxo) {
    const so = erros.anuncio;
    m.innerHTML = `<div class="painel pad ed-bloco"><h3>Resumo</h3><dl class="resumo"><dt>Mensagem</dt><dd>${esc(ed.name)}</dd><dt>Anúncios</dt><dd>${ed.ads.length} ${ed.ads.length === 1 ? 'versão' : 'versões'}${ed.ads.some(a => a.media) ? ', com imagem' : ''}</dd><dt>Situação</dt><dd>${nome}</dd></dl></div>
      ${so.length ? `<div class="aviso"><b>Antes de publicar, corrija:</b><ul style="margin:6px 0 0;padding-left:18px">${so.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : `<div class="aviso neutro">${live ? (META.whatsapp.canSubmit ? 'Ao publicar, o modelo vai para a aprovação da Meta. O fluxo só envia depois da aprovação.' : '<b>A Meta ainda não está conectada.</b> Faltam WA_TOKEN, WA_WABA_ID e WA_APP_ID no arquivo .env.') : '<b>Modo teste.</b> Publicar só marca a mensagem como pronta.'}</div>`}
      ${ed.templates.length ? `<div class="painel pad ed-bloco"><h3>Modelos na Meta</h3>${ed.templates.map(t => `<div class="botao-linha" style="grid-template-columns:auto 1fr auto"><b>Anúncio ${esc(t.variant)}</b><span class="nota" style="word-break:break-all">${esc(t.name)}${t.error ? ' · ' + esc(t.error) : ''}</span><span class="pill" style="--c:${(TPL[t.status] || TPL.SIMULADO)[1]}">${(TPL[t.status] || [t.status])[0]}</span></div>`).join('')}${ed.status === 'aguardando' ? '<button class="btn pequeno" data-acao="atualizar" style="margin-top:10px">Atualizar status na Meta</button>' : ''}</div>` : ''}
      <a class="btn" href="#/fluxo?id=${ed.fluxo}" style="justify-self:start">Voltar ao fluxo</a>`;
    m.insertAdjacentHTML('beforeend', blocoTeste());
    return;
  }
  m.innerHTML = `
  <div class="painel pad ed-bloco"><h3>Resumo</h3>
    <dl class="resumo"><dt>Campanha</dt><dd>${esc(ed.name || '(sem nome)')}</dd><dt>Canal</dt><dd>${ed.channel === 'sms' ? 'SMS' : 'WhatsApp, ' + (ed.category === 'utility' ? 'Utilidade' : 'Marketing')}</dd>
    <dt>Quem recebe</dt><dd>Sem pedir há ${esc(ed.min_days)}${ed.max_days !== '' && ed.max_days != null ? ` a ${esc(ed.max_days)}` : ' ou mais'} dias, ao menos ${esc(ed.min_orders)} ${+ed.min_orders === 1 ? 'pedido' : 'pedidos'}</dd>
    <dt>Alcance hoje</dt><dd><b class="num">${ed.alcance == null ? '…' : inteiro(ed.alcance)}</b> clientes</dd>
    <dt>Anúncios</dt><dd>${ed.ads.length} ${ed.ads.length === 1 ? 'versão' : 'versões'}${ed.ads.some(a => a.media) ? ', com imagem' : ''}</dd>
    <dt>Envio</dt><dd>${ed.schedule.auto ? `<b>Automático</b>, ${resumoDias(ed.schedule)}` : 'Manual'}</dd>
    ${ed.schedule.auto ? `<dt>Limites</dt><dd>${ed.schedule.daily_cap ? inteiro(ed.schedule.daily_cap) + ' por dia' : 'sem limite diário'}, ${ed.schedule.per_minute} por minuto, ${ed.schedule.max_attempts} ${ed.schedule.max_attempts === 1 ? 'tentativa' : 'tentativas'} por cliente</dd>` : ''}
    <dt>Situação</dt><dd>${nome}</dd></dl></div>
  ${todos.length ? `<div class="aviso"><b>Antes de publicar, corrija:</b><ul style="margin:6px 0 0;padding-left:18px">${todos.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`
    : `<div class="aviso neutro">${live ? (ed.channel === 'whatsapp' ? (META.whatsapp.canSubmit ? 'Ao publicar, o modelo vai para a aprovação da Meta. Só depois de aprovado a campanha pode ser enviada.' : '<b>A Meta ainda não está conectada.</b> Faltam WA_TOKEN, WA_WABA_ID e WA_APP_ID no arquivo .env para enviar o modelo para aprovação.') : 'Ao publicar, a campanha fica pronta para enviar.') : '<b>Modo teste.</b> Publicar só marca a campanha como pronta. Nada é enviado à Meta nem aos clientes.'}</div>`}
  ${ed.templates.length ? `<div class="painel pad ed-bloco"><h3>Modelos na Meta</h3>${ed.templates.map(t => `<div class="botao-linha" style="grid-template-columns:auto 1fr auto"><b>Anúncio ${esc(t.variant)}</b><span class="nota" style="word-break:break-all">${esc(t.name)}${t.error ? ' · ' + esc(t.error) : ''}</span><span class="pill" style="--c:${(TPL[t.status] || TPL.SIMULADO)[1]}">${(TPL[t.status] || [t.status])[0]}</span></div>`).join('')}
    ${ed.status === 'aguardando' ? '<button class="btn pequeno" data-acao="atualizar" style="margin-top:10px">Atualizar status na Meta</button>' : ''}</div>` : ''}`;
  m.insertAdjacentHTML('beforeend', blocoTeste());
}

// envia a campanha para UM celular (o seu) para ver imagem e botoes de verdade antes de ir para clientes
function blocoTeste() {
  if (!ed.id || ed.status !== 'publicada') return '';
  const email = ed.channel === 'email', onde = { whatsapp: 'o meu WhatsApp', sms: 'o meu celular (SMS)', email: 'o meu e-mail' }[ed.channel];
  return `<div class="painel pad ed-bloco"><h3>Enviar teste para ${onde}</h3><p class="nota">${META.mode === 'live' ? `Manda esta mensagem só para ${email ? 'o e-mail' : 'o número'} abaixo. Não conta como campanha.` : 'Modo teste: o envio é só simulado, nada sai de verdade.'}</p>
    <div class="fx-linha"><input class="campo" id="teste-fone" type="${email ? 'email' : 'tel'}" placeholder="${email ? 'voce@exemplo.com' : '(24) 99999-9999'}" aria-label="${email ? 'Seu e-mail' : 'Seu celular com DDD'}"><button class="btn" data-acao="teste">Enviar teste</button></div></div>`;
}

/* ----- coluna da direita: previa do celular ou alcance ----- */
function foneHtml(a) {
  const final = ed.modo === 'final', t = txt => esc(final ? previaTags(txt) : txt);
  const iconeBtn = { url: '↗', reply: '↩', copy: '⧉', optin: '✓' };
  const btns = ed.channel === 'whatsapp' ? a.buttons.filter(b => b.text || b.type === 'copy') : [];
  return `<div class="fone"><div class="fone-topo"><span class="fone-av">${META?.logo ? `<img src="${esc(META.logo)}" alt="">` : esc((BRAND.loja.nome || '?').charAt(0).toUpperCase())}</span><div><b>${esc(BRAND.loja.nome)}</b><small>online</small></div></div>
    <div class="fone-chat"><div class="fone-balao">
      ${ed.channel === 'whatsapp' && a.media ? `<img src="/media/${esc(a.media)}" alt="">` : ''}
      ${ed.channel === 'whatsapp' && !a.media && a.header ? `<b class="fone-cab">${t(a.header)}</b>` : ''}
      <p>${a.body ? t(a.body) : '<span style="opacity:.55">Sua mensagem aparece aqui.</span>'}</p>
      ${ed.channel === 'whatsapp' && a.footer ? `<small class="fone-rod">${t(a.footer)}</small>` : ''}<span class="fone-hora">12:16</span></div>
      ${btns.map(b => `<div class="fone-btn"><span>${iconeBtn[b.type]}</span>${t(b.text || 'Copiar código')}</div>`).join('')}</div></div>`;
}
function edLado() {
  const l = $('#ed-lado');
  if (ed.passo === 'anuncio' || ed.passo === 'revisao') {
    const a = edAd();
    l.innerHTML = `<div class="seg" role="group" aria-label="Modo da prévia" style="margin-bottom:10px">${[['final', 'Como o cliente vê'], ['digitado', 'Como você digitou']].map(([k, n]) => `<button data-acao="modo" data-v="${k}" aria-pressed="${ed.modo === k}">${n}</button>`).join('')}</div>
      ${ed.ads.length > 1 && ed.passo === 'revisao' ? `<div class="abas">${ed.ads.map((x, i) => `<span class="aba ${i === ed.ad ? 'on' : ''}"><button data-acao="anuncio" data-v="${i}">Anúncio ${x.label}</button></span>`).join('')}</div>` : ''}
      ${foneHtml(a)}`;
    l.onclick = e => { const b = e.target.closest('[data-acao]'); if (!b) return; if (b.dataset.acao === 'modo') { ed.modo = b.dataset.v; edLado(); } if (b.dataset.acao === 'anuncio') { ed.ad = +b.dataset.v; edLado(); } };
  } else {
    l.innerHTML = `<div class="painel pad alcance" id="alcance-lado" aria-live="polite"></div>`; l.onclick = null;
  }
  edAlcanceTexto();
}
function edAlcanceTexto() {
  const t = ed.alcance == null ? 'Calculando…' : `<b class="num">${inteiro(ed.alcance)}</b>${ed.alcance === 1 ? 'cliente seria atingido' : 'clientes seriam atingidos'} hoje`;
  ['#alcance-inline', '#alcance-lado'].forEach(s => { const el = $(s); if (el) el.innerHTML = t; });
}
let edAlcanceAtrasado = null;   // criado so na primeira vez: debounce vem de app.js, que carrega depois deste arquivo
function edAlcance() {
  edAlcanceAtrasado ||= debounce(async () => {
    try { ed.alcance = (await api('campaigns/preview', { min_days: ed.min_days, max_days: ed.max_days, min_orders: ed.min_orders, cooldown_days: ed.cooldown_days, id: ed.id })).count; } catch { ed.alcance = null; }
    edAlcanceTexto();
  }, 250);
  edAlcanceAtrasado();
}

/* ----- eventos ----- */
function edEntrada(e) {
  const t = e.target;
  if (t.type === 'checkbox') return;                                  // caixas de marcar tratadas em edMudou
  if (t.dataset.s) {
    ed.schedule[t.dataset.s] = t.type === 'number' ? (t.value === '' ? null : +t.value) : (t.value || null);
    if (t.dataset.s === 'start' && !t.value) ed.schedule.start = META.scheduleDefaults.start;
  } else if (t.dataset.sd) {
    const [i, k] = t.dataset.sd.split(':'); ed.schedule.days[i][k] = t.value;
  } else if (t.dataset.f) {
    ed[t.dataset.f] = t.type === 'number' ? (t.value === '' ? '' : +t.value) : t.value;
    if (t.dataset.f === 'name') $('#ed-titulo').textContent = t.value || 'Nova campanha';
    if (['min_days', 'max_days', 'min_orders', 'cooldown_days'].includes(t.dataset.f)) { ed.alcance = null; edAlcanceTexto(); edAlcance(); }
  } else if (t.dataset.ad) {
    edAd()[t.dataset.ad] = t.value;
    const c = $('#c-' + t.dataset.ad); if (c) c.textContent = t.value.length;
    edLado();
  } else if (t.dataset.bi !== undefined) { edAd().buttons[+t.dataset.bi][t.dataset.bk] = t.value; edLado(); }
}
function edMudou(e) {
  const t = e.target;
  if (t.dataset.sd?.endsWith(':on')) { ed.schedule.days[t.dataset.sd.split(':')[0]].on = t.checked; edPasso(); return; }
  if (t.dataset.bi !== undefined && t.dataset.bk === 'type') { edAd().buttons[+t.dataset.bi].type = t.value; edPasso(); edLado(); }
}
async function edClique(e) {
  const b = e.target.closest('[data-acao]'); if (!b) return;
  const v = b.dataset.v, a = edAd();
  switch (b.dataset.acao) {
    case 'canal': ed.channel = v; edDesenhar(); break;
    case 'cat': ed.category = v; edPasso(); break;
    case 'modelo': { const p = SEG[v].preset; ed.min_days = p.min_days; ed.max_days = p.max_days; ed.cooldown_days = p.cooldown_days; if (!ed.name) ed.name = p.name; edDesenhar(); edAlcance(); break; }
    case 'auto': ed.schedule.auto = v === '1'; edPasso(); break;
    case 'lembrete': ed.min_days = +v; ed.max_days = +v + 2; ed.cooldown_days = Math.max(+ed.cooldown_days || 0, 30); ed.alcance = null; edPasso(); edAlcance(); toast(`Faixa ajustada: clientes que pediram há ${v} a ${+v + 2} dias.`); break;
    case 'anuncio': ed.ad = +v; edPasso(); edLado(); break;
    case 'add-ad': ed.ads.push(adVazio(ed.ads.length)); ed.ad = ed.ads.length - 1; edDesenhar(); break;
    case 'del-ad': ed.ads.splice(+v, 1); ed.ads.forEach((x, i) => x.label = 'ABC'[i]); ed.ad = 0; edDesenhar(); break;
    case 'media-escolher': abrirGaleria(file => { a.media = file; a.header = ''; edPasso(); edLado(); }); break;
    case 'media-tirar': a.media = null; edPasso(); edLado(); break;
    case 'var-fav': { const ta = $('[data-ad="body"]'), s = ta.selectionStart ?? ta.value.length, f = ta.selectionEnd ?? s; ta.setRangeText('[produto_favorito]', s, f, 'end'); a.body = ta.value; ta.focus(); $('#c-body').textContent = a.body.length; edLado(); break; }
    case 'var': { const ta = $('[data-ad="body"]'), s = ta.selectionStart ?? ta.value.length, f = ta.selectionEnd ?? s; ta.setRangeText('[nome_cliente]', s, f, 'end'); a.body = ta.value; ta.focus(); $('#c-body').textContent = a.body.length; edLado(); break; }
    case 'rodape-sair': a.footer = RODAPE_SAIR; edPasso(); edLado(); break;
    case 'add-btn': a.buttons.push({ type: 'url', text: '', value: '' }); edPasso(); edLado(); break;
    case 'del-btn': a.buttons.splice(+v, 1); edPasso(); edLado(); break;
    case 'ia': await edIA(); break;
    case 'teste': { const f = $('#teste-fone'); try { const r = await api('campaigns/test', { id: ed.id, phone: f.value }); toast(r.simulado ? 'Modo teste: simulei o envio, nada foi mandado.' : 'Teste enviado. Confira o seu WhatsApp.'); } catch (er) { toast(er.message, true); } break; }
    case 'atualizar': try { const c = await api('campaigns/refresh', { id: ed.id }); ed.templates = c.templates; ed.status = c.status; edDesenhar(); } catch (er) { toast(er.message, true); } break;
  }
}

async function edIA() {
  if (!META.ai.configured) return toast('Para gerar texto com IA, coloque a chave ANTHROPIC_API_KEY no arquivo .env e reinicie o programa.', true);
  const ok = await confirmar({ titulo: 'Gerar mensagem com IA', ok: 'Gerar texto', html: `<label class="f">O que a mensagem deve fazer?<textarea class="campo" id="ia-obj" rows="3">Chamar de volta quem não pede há um tempo e lembrar do que ele mais gosta de pedir.</textarea></label>` });
  if (!ok) return;
  const objetivo = ($('#ia-obj')?.value || '').trim();
  const seg = `clientes sem pedir há ${ed.min_days}${ed.max_days !== '' ? ' a ' + ed.max_days : ' ou mais'} dias`;
  try { edAd().body = (await api('ai/copy', { objetivo, segmento: seg, canal: ed.channel })).text; edPasso(); edLado(); toast('Texto gerado. Revise antes de publicar.'); }
  catch (e) { toast(e.message, true); }
}

async function edSalvar(silencioso) {
  const r = await api('campaigns', { id: ed.id, name: ed.name, channel: ed.channel, category: ed.category, min_days: ed.min_days, max_days: ed.max_days, min_orders: ed.min_orders, cooldown_days: ed.cooldown_days, ads: ed.ads, schedule: ed.schedule });
  if (!ed.id) { ed.id = r.id; history.replaceState(null, '', '#/campanha?id=' + r.id); }
  ed.status = r.status;
  if (!silencioso) { toast('Rascunho salvo.'); edDesenhar(); }
  return r;
}
async function edPublicar() {
  if (edTemErro()) { ed.passo = 'revisao'; edDesenhar(); return toast('Corrija os pontos da revisão antes de publicar.', true); }
  if (ed.schedule.auto && META.mode === 'live' && !await confirmar({ titulo: 'Publicar com envio automático?',
    html: `<p style="color:var(--texto-2)">Depois que a Meta aprovar o modelo, o programa envia sozinho para até <b>${inteiro(ed.alcance ?? 0)}</b> clientes, ${resumoDias(ed.schedule)}, ${ed.schedule.per_minute} por minuto${ed.schedule.daily_cap ? `, no máximo ${inteiro(ed.schedule.daily_cap)} por dia` : ''}. Você pode desligar o envio automático quando quiser.</p>`, ok: 'Publicar' })) return;
  const btn = $('#ed-publicar'); btn.disabled = true; btn.textContent = 'Publicando…';
  try {
    await edSalvar(true);
    const r = await api('campaigns/publish', { id: ed.id });
    const c = await api('campaign?id=' + ed.id);
    ed.status = c.status; ed.templates = c.templates; ed.passo = 'revisao';
    toast(r.simulado ? 'Campanha publicada em modo teste. Nada foi enviado à Meta.' : 'Modelo enviado para aprovação da Meta.');
    edDesenhar();
  } catch (e) { toast(e.message, true); btn.disabled = false; btn.textContent = ed.fluxo ? 'Publicar mensagem' : 'Publicar campanha'; }
}
