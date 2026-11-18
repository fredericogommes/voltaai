'use strict';
/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = n => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCurto = n => n >= 1e6 ? 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi'
  : n >= 1e4 ? 'R$ ' + Math.round(n / 1e3) + ' mil' : n >= 1e3 ? 'R$ ' + (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : brl(n).replace(',00', '');
const inteiro = n => (n || 0).toLocaleString('pt-BR');
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
};
const api = async (path, body, raw) => {
  const token = await window.CrmAuth.token();
  const options = body === undefined ? {} : { method: 'POST', body: raw ? body : JSON.stringify(body) };
  options.headers = { Authorization: `Bearer ${token}` };
  const r = await fetch('/api/' + path, options);
  if (r.status === 401) window.CrmAuth.expired();
  if (r.status === 403) window.CrmAuth.semLoja();   // conta sem loja vinculada
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Algo deu errado. Tente de novo.');
  return j;
};
const nomeBonito = n => { n = String(n || 'Cliente').trim(); return n === n.toUpperCase() || n === n.toLowerCase() ? n.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : n; };
const fone = p => { if (!/^d+$/.test(String(p))) return 'Sem telefone'; if (String(p)[2] === '0') return 'Sem telefone válido'; const d = String(p).replace(/^55/, ''); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : p; };
const atras = d => d <= 0 ? 'hoje' : d === 1 ? 'ontem' : d < 61 ? `há ${d} dias` : `há ${Math.round(d / 30)} meses`;
const dataBr = s => new Date(s).toLocaleDateString('pt-BR');
const dataHora = s => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const mesNome = k => { const [y, m] = k.split('-'); return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''); };

const ICON = {
  inicio: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  contatos: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.2c2.6.3 4.5 2.2 4.5 5.3"/>',
  campanhas: '<path d="M3 10v4a1 1 0 0 0 1 1h3l8 4V5L7 9H4a1 1 0 0 0-1 1z"/><path d="M19 9a4 4 0 0 1 0 6"/>',
  conexoes: '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  lua: '<path d="M21 13.5A8.5 8.5 0 1 1 10.5 3a7 7 0 0 0 10.5 10.5z"/>',
  busca: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  atualizar: '<path d="M20 11a8 8 0 0 0-14.5-4M4 4v4h4M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  fluxos: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="12" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8.5 6H12a3 3 0 0 1 3 3v0M8.5 18H12a3 3 0 0 0 3-3v0"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  raio: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  caixa: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/>',
  graficos: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  vendas: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v7h-4M14 18v3"/>',
  estrela: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
  megafone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 8.5a4.5 4.5 0 0 1 0 7M18 6a8 8 0 0 1 0 12"/>',
  camera: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/>',
  google: '<path d="M20.5 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.6-3.9 2.6-6.6z"/><path d="M12 21c2.4 0 4.4-.8 5.9-2.2L15 16.6c-.8.5-1.8.9-3 .9-2.3 0-4.3-1.6-5-3.7H4v2.3A9 9 0 0 0 12 21z"/><path d="M7 13.8a5.4 5.4 0 0 1 0-3.6V7.9H4a9 9 0 0 0 0 8.2z"/><path d="M12 6.5c1.3 0 2.5.5 3.4 1.3L18 5.3A9 9 0 0 0 4 7.9l3 2.3c.7-2.1 2.7-3.7 5-3.7z"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};
const icon = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

const SEG = {
  'Campeões': { cor: 'var(--crosta)', exp: 'Os melhores: pediram há menos de 30 dias e fizeram 8 pedidos ou mais no último ano.', preset: null },
  'Fiéis': { cor: 'var(--folha)', exp: 'Pediram há menos de 30 dias e fizeram de 4 a 7 pedidos no último ano.', preset: null },
  'Lealdade potencial': { cor: 'var(--azul)', exp: 'Pediram há menos de 30 dias e já voltaram de 2 a 3 vezes no último ano. Estão perto de virar fiéis.',
    preset: { name: 'Fidelização 5 a 29 dias', min_days: 5, max_days: 29, cooldown_days: 15, message: 'Oi, [nome_cliente]! Bateu a vontade? Peça hoje e receba rapidinho.' } },
  'Promissores': { cor: 'var(--promissor)', exp: 'Pediram há menos de 30 dias e só fizeram um pedido no último ano. O próximo pedido decide se viram clientes.',
    preset: { name: 'Fidelização 5 a 29 dias', min_days: 5, max_days: 29, cooldown_days: 15, message: 'Oi, [nome_cliente]! Bateu a vontade? Peça hoje e receba rapidinho.' } },
  'Em risco': { cor: 'var(--ambar)', exp: 'Pararam de pedir há 30 a 90 dias. Ainda dá tempo de trazer de volta.',
    preset: { name: 'Recompra 30 a 90 dias', min_days: 30, max_days: 90, cooldown_days: 30, message: 'Oi, [nome_cliente], sentimos sua falta! Que tal pedir [produto_favorito] de novo?' } },
  'Perdidos': { cor: 'var(--pimenta)', exp: 'Estão há mais de 90 dias sem pedir.',
    preset: { name: 'Recuperação acima de 90 dias', min_days: 91, max_days: '', cooldown_days: 45, message: 'Faz tempo que a gente não se vê, [nome_cliente]! Preparamos uma surpresa para você voltar.' } },
};
const SEGS = Object.keys(SEG);
const pillSeg = s => `<span class="pill" style="--c:${SEG[s].cor}">${esc(s)}</span>`;

/* ---------- avisos, gaveta, confirmacao ---------- */
function toast(msg, erro) {
  const el = document.createElement('div');
  el.className = 'toast' + (erro ? ' erro' : ''); el.textContent = msg;
  $('#toasts').append(el); setTimeout(() => el.remove(), erro ? 6500 : 4200);
}
let ultimoFoco = null;
function abrirGaveta(titulo, html) {
  ultimoFoco = document.activeElement;
  $('#drawer-title').textContent = titulo; $('#drawer-body').innerHTML = html;
  $('#drawer').hidden = false; $('#drawer .icon-btn').focus();
}
function fecharGaveta() { $('#drawer').hidden = true; ultimoFoco?.focus?.(); }
$('#drawer .icon-btn').innerHTML = icon('x');
$('#drawer').addEventListener('click', e => { if (e.target.closest('[data-close]')) fecharGaveta(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#drawer').hidden) fecharGaveta(); });

function confirmar({ titulo, html, ok, perigo, soOk }) {
  const d = $('#confirmar');
  d.innerHTML = `<form method="dialog"><h2>${esc(titulo)}</h2>${html}<div class="rodape">
    ${soOk ? '' : '<button class="btn" value="no">Cancelar</button>'}<button class="btn ${perigo ? '' : 'ouro'}" value="yes" autofocus>${esc(ok)}</button></div></form>`;
  return new Promise(res => { d.onclose = () => res(d.returnValue === 'yes'); d.returnValue = ''; d.showModal(); });
}

/* ---------- tema, menu, modo ---------- */
function aplicarTema(t) {
  if (t) { document.documentElement.dataset.tema = t; store.set('tema', t); }
  const escuro = document.documentElement.dataset.tema === 'escuro' ||
    (!document.documentElement.dataset.tema && matchMedia('(prefers-color-scheme: dark)').matches);
  $('#tema').innerHTML = icon(escuro ? 'sol' : 'lua');
  $('#tema').dataset.escuro = escuro ? '1' : '';
}
$('#tema').addEventListener('click', () => aplicarTema($('#tema').dataset.escuro ? 'claro' : 'escuro'));
$('#sair').innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/></svg>';
$('#sair').addEventListener('click', () => window.CrmAuth.logout());
aplicarTema();

const PAGINAS = {
  inicio: ['Início', pgInicio],
  contatos: ['Todos os contatos', pgContatos], descadastros: ['Descadastros', pgDescadastros],
  campanhas: ['Todas as campanhas', pgCampanhas], sugeridas: ['Campanhas sugeridas', pgSugeridas], midias: ['Galeria de mídias', pgMidias], mensagens: ['Mensagens enviadas', pgMensagens],
  performance: ['Performance', pgPerformance], audiencia: ['Cobertura de audiência', pgAudiencia],
  campanha: ['Campanha', pgEditor],
  fluxos: ['Fluxos', pgFluxos], fluxo: ['Fluxo', pgFluxo],
  produtos: ['Produtos', pgProdutos],
  rfv: ['Análise RFV', pgRfv], tempo: ['Tempo entre compras', pgTempo], coortes: ['LTV e retenção', pgCoortes],
  recuperados: ['Clientes recuperados', pgRecuperados], evolucao: ['Evolução da base', pgEvolucao],   // editor: fora do menu, mas conta como parte de Campanhas
  vendas: ['Vendas', pgVendas], promocoes: ['Promoções', pgPromocoes], bairros: ['Melhores bairros', pgBairros],
  qrcodes: ['QR codes', pgQr], fidelidade: ['Programa de fidelidade', pgFidelidade],
  gnegocio: ['Google Meu Negócio', pgGoogleNegocio], gads: ['Google Ads', pgGoogleAds],
  metaads: ['Meta Ads', pgMetaAds], instagram: ['Instagram', pgInstagram],
  conexoes: ['Conexões', pgConexoes], ajustes: ['Ajustes', pgAjustes],
};
// Menu por categorias. "filhos" aparecem embaixo do item quando a pessoa está dentro daquele grupo.
const MENU = [
  { k: 'inicio', nome: 'Início', icon: 'inicio' },
  { titulo: 'Relacionamento' },
  { k: 'contatos', nome: 'Contatos', icon: 'contatos', filhos: ['contatos', 'descadastros'] },
  { k: 'campanhas', nome: 'Campanhas', icon: 'campanhas', filhos: ['campanhas', 'sugeridas', 'midias', 'mensagens', 'performance', 'audiencia'] },
  { titulo: 'Crescimento' },
  { k: 'qrcodes', nome: 'QR codes', icon: 'qr' },
  { k: 'fidelidade', nome: 'Fidelidade', icon: 'estrela' },
  { titulo: 'Marketing' },
  { k: 'metaads', nome: 'Meta', icon: 'megafone', filhos: ['metaads', 'instagram'] },
  { k: 'gnegocio', nome: 'Google', icon: 'google', filhos: ['gnegocio', 'gads'] },
  { titulo: 'Automações' },
  { k: 'fluxos', nome: 'Fluxos', icon: 'fluxos' },
  { titulo: 'Análises' },
  { k: 'vendas', nome: 'Vendas', icon: 'vendas', filhos: ['vendas', 'promocoes', 'bairros'] },
  { k: 'produtos', nome: 'Produtos', icon: 'caixa' },
  { k: 'rfv', nome: 'Clientes', icon: 'graficos', filhos: ['rfv', 'tempo', 'coortes', 'recuperados', 'evolucao'] },
  { titulo: 'Configuração' },
  { k: 'conexoes', nome: 'Conexões', icon: 'conexoes' },
  { k: 'ajustes', nome: 'Ajustes', icon: 'ajustes' },
];
const grupoDe = k => MENU.find(m => m.filhos?.includes(k));
function desenharMenu(atual) {
  $('#nav').innerHTML = MENU.map(m => {
    if (m.titulo) return `<p class="nav-titulo">${m.titulo}</p>`;
    const grupo = m.filhos ? m.filhos.includes(atual) : m.k === atual;
    const link = `<a href="#/${m.filhos ? m.filhos[0] : m.k}" data-k="${m.k}" ${grupo && !m.filhos ? 'aria-current="page"' : ''} ${m.filhos && grupo ? 'data-grupo="on"' : ''}>${icon(m.icon)}<span>${m.nome}</span></a>`;
    const filhos = m.filhos && grupo ? `<div class="nav-sub">${m.filhos.map(f => `<a href="#/${f}" ${f === atual ? 'aria-current="page"' : ''}>${PAGINAS[f][0]}</a>`).join('')}</div>` : '';
    return link + filhos;
  }).join('');
}
let META = null;
// Marca do produto (brand.json -> /brand.js). nomeMarca ["volta","ai"] pinta a 2ª parte com o gradiente da marca.
const BRAND = window.BRAND;
function marcaHtml() {
  const p = BRAND.produto, partes = Array.isArray(p.nomeMarca) && p.nomeMarca.length > 1 ? p.nomeMarca : [p.nome];
  const nome = partes.map((t, i) => i ? `<span class="brand-name-2">${esc(t)}</span>` : esc(t)).join('');
  return `${p.icone ? `<img class="brand-icone" src="${esc(p.icone)}" alt="">` : '<span class="brand-mark" aria-hidden="true"></span>'}
    <span class="brand-texto"><span class="brand-name" aria-label="${esc(p.nome)}">${nome}</span>${p.tagline ? `<span class="brand-sub">${esc(p.tagline)}</span>` : ''}</span>`;
}
async function carregarMeta() {
  META = await api('meta');
  const m = $('#modo'); m.textContent = META.mode === 'live' ? 'Envio real ligado' : 'Modo teste';
  m.className = 'modo' + (META.mode === 'live' ? ' live' : ''); m.title = META.mode === 'live' ? '' : 'Nenhuma mensagem é enviada de verdade';
  $('.brand').innerHTML = marcaHtml();
}

/* ---------- roteamento ---------- */
function rota() {
  const [, k = 'inicio', qs = ''] = location.hash.match(/^#\/([a-z]+)\??(.*)$/) || [];
  const chave = PAGINAS[k] ? k : 'inicio';
  const pg = PAGINAS[chave];
  desenharMenu(chave === 'campanha' ? (new URLSearchParams(qs).has('fluxo') ? 'fluxos' : 'campanhas') : chave === 'fluxo' ? 'fluxos' : chave);
  document.title = `${chave === 'campanha' ? 'Editar campanha' : pg[0]} · ${BRAND.produto.nomeCompleto}`;
  const app = $('#app'); app.oninput = app.onchange = app.onclick = null;   // cada pagina liga os seus eventos
  app.innerHTML = '<div class="esq" style="max-width:700px"><i style="height:38px;width:40%"></i><i style="height:220px"></i><i></i><i></i></div>';
  pg[1](new URLSearchParams(qs)).then(() => {
    // no celular o menu lateral some; as subpáginas viram abas no topo da página
    const g = grupoDe(chave);
    if (g) app.insertAdjacentHTML('afterbegin', `<nav class="subnav" aria-label="${g.nome}">${g.filhos.map(f => `<a href="#/${f}" ${f === chave ? 'aria-current="page"' : ''}>${PAGINAS[f][0]}</a>`).join('')}</nav>`);
  }).catch(e => {
    app.innerHTML = `<div class="painel vazio"><b>Não consegui carregar esta página</b><span>${esc(e.message)}</span><button class="btn" onclick="rota()">Tentar de novo</button></div>`;
  });
}
addEventListener('hashchange', rota);

/* ---------- INICIO ---------- */
const periodo = { modo: store.get('periodo') || '30', de: '', ate: '' };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function periodoQuery() {
  if (periodo.modo === 'custom' && periodo.de && periodo.ate) return `from=${periodo.de}&to=${periodo.ate}`;
  const fim = new Date(), ini = new Date(); ini.setDate(fim.getDate() - (+periodo.modo || 30) + 1);
  return `from=${iso(ini)}&to=${iso(fim)}`;
}
const delta = (a, b) => {
  if (!b) return '';
  const p = Math.round((a - b) / b * 100);
  const cls = p > 0 ? 'sobe' : p < 0 ? 'desce' : 'igual';
  return `<span class="delta ${cls}" title="Em relação ao período anterior de mesma duração">${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p)}%</span>`;
};
function spark(vals) {
  if (vals.length < 2 || !vals.some(v => v > 0)) return '<span></span>';
  const max = Math.max(...vals), w = 84, h = 28;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 3 - v / max * (h - 6)).toFixed(1)}`);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="M${pts.join('L')}"/></svg>`;
}
const agrupa = (arr, n) => { const out = [], s = Math.ceil(arr.length / n); for (let i = 0; i < arr.length; i += s) out.push(arr.slice(i, i + s)); return out; };

/* seletor de periodo, igual em Inicio, Performance e Vendas */
function periodoHtml(p) {
  return `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
    <div class="seg" role="group" aria-label="Período">
      ${[['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['custom', 'Escolher datas']].map(([k, n]) => `<button data-p="${k}" aria-pressed="${periodo.modo === k}">${n}</button>`).join('')}
    </div>
    ${periodo.modo === 'custom' ? `<span class="datas"><input type="date" id="de" value="${p.from}" aria-label="Data inicial"> até <input type="date" id="ate" value="${p.to}" aria-label="Data final"></span>` : ''}
  </div>`;
}
function ligarPeriodo(p) {
  $('#app').querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
    periodo.modo = b.dataset.p; store.set('periodo', periodo.modo);
    if (periodo.modo === 'custom' && !periodo.de) { periodo.de = p.from; periodo.ate = p.to; }
    rota();
  });
  const de = $('#de'), ate = $('#ate');
  if (de) { de.onchange = ate.onchange = () => { if (de.value && ate.value && de.value <= ate.value) { periodo.de = de.value; periodo.ate = ate.value; rota(); } }; }
}

/* grafico de receita: por dia (ou semana, em periodos longos) e por mes */
let grafico = store.get('grafico') || 'dia';
const dsem = s => new Date(s + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
const curto = s => s.slice(8, 10) + '/' + s.slice(5, 7);
function serieDia(daily) {
  const mk = (rot, arr, titulo) => {
    const total = arr.reduce((s, x) => s + x.receita, 0), camp = arr.reduce((s, x) => s + x.campanhas, 0), ped = arr.reduce((s, x) => s + x.pedidos, 0);
    return { rot, total, campanhas: camp, tip: `${titulo}<br>${brl(total)} · ${ped} ${ped === 1 ? 'pedido' : 'pedidos'}${camp ? `<br>De campanhas: ${brl(camp)}` : ''}` };
  };
  if (daily.length <= 45) return daily.map(x => mk(curto(x.d), [x], esc(dsem(x.d))));
  const out = []; for (let i = 0; i < daily.length; i += 7) { const w = daily.slice(i, i + 7); out.push(mk(curto(w[0].d), w, `Semana de ${esc(curto(w[0].d))} a ${esc(curto(w[w.length - 1].d))}`)); }
  return out;
}
const serieMes = months => months.map(m => ({ rot: mesNome(m.key), total: m.total, campanhas: m.campanhas,
  tip: `${esc(mesNome(m.key))}<br>${brl(m.total)}${m.campanhas ? `<br>De campanhas: ${brl(m.campanhas)}` : ''}` }));
function niceMax(v) {
  if (v <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
function grafRender(it) {
  const max = niceMax(Math.max(0, ...it.map(x => x.total))), valores = it.length <= 8, off = valores ? 22 : 0;
  const alt = r => `calc((100% - ${off}px) * ${r})`;
  const passo = Math.ceil(it.length / 8);
  return `<div class="graf-area" role="img" aria-label="Gráfico de receita">
    ${[1, .5].map(r => `<div class="gl" style="bottom:${alt(r)}"><span>${brlCurto(max * r)}</span></div>`).join('')}
    <div class="colunas ${it.length > 20 ? 'fino' : ''}">${it.map((x, i) => `
      <div class="col${i === 0 ? ' ini' : i === it.length - 1 ? ' fim' : ''}" tabindex="0">
        <div class="dica" style="${(() => { const r = max ? x.total / max : 0;   // perto da barra: acima dela, ou por dentro do topo se a barra for alta
          return r <= 0.55 ? `bottom:calc(${alt(r)} + 10px)` : `bottom:auto;top:calc(100% - ${alt(r)} + 10px)`; })()}">${x.tip}</div>
        ${valores ? `<span class="v num">${brlCurto(x.total)}</span>` : ''}
        <div class="pilha" style="height:${alt(x.total / max)};animation-delay:${Math.min(i * 25, 600)}ms"><i class="base" style="flex:${(x.total - x.campanhas) || 0}"></i><i class="camp" style="flex:${x.campanhas || 0}"></i></div>
      </div>`).join('')}</div></div>
    <div class="meses ${it.length > 20 ? 'fino' : ''}">${it.map((x, i) => `<span>${i % passo === 0 ? esc(x.rot) : ''}</span>`).join('')}</div>`;
}

async function pgInicio() {
  const d = await api('dashboard?' + periodoQuery());
  const { cur, prev } = d;
  const ticket = cur.pedidos ? cur.receita / cur.pedidos : 0, ticketAnt = prev.pedidos ? prev.receita / prev.pedidos : 0;
  const blocos = agrupa(d.daily, 16);
  const sparkPed = blocos.map(b => b.reduce((s, x) => s + x.pedidos, 0));
  const sparkTick = blocos.map(b => { const p = b.reduce((s, x) => s + x.pedidos, 0); return p ? b.reduce((s, x) => s + x.receita, 0) / p : 0; });
  const totClientes = d.totalClientes || 1;

  $('#app').innerHTML = `
  <div class="page-head">
    <div><h1>Início</h1><p class="sub">${dataBr(d.period.from + 'T12:00')} a ${dataBr(d.period.to + 'T12:00')}, ${d.period.days} ${d.period.days === 1 ? 'dia' : 'dias'}</p></div>
    ${periodoHtml(d.period)}
  </div>

  <section class="hero" aria-label="Receita">
    <div>
      <p class="rotulo">Receita no período</p>
      <p class="grande num">${brl(cur.receita).replace(/,00$/, '')}</p>
      <p class="nota">${cur.receitaCampanhas > 0
        ? `<b>${brl(cur.receitaCampanhas).replace(/,00$/, '')}</b> vieram de ${cur.conversoes} ${cur.conversoes === 1 ? 'pedido' : 'pedidos'} feitos depois de uma campanha.`
        : 'Nenhuma campanha enviada de verdade ainda. Quando você enviar, a parte que voltou por campanha aparece em azul-escuro no gráfico.'}</p>
      <div class="legenda"><span><i style="background:rgb(59 28 14 / .3)"></i>Todos os pedidos</span><span><i style="background:var(--tinta)"></i>Vindos de campanhas</span></div>
    </div>
    <div>
      <div class="graf-topo"><span class="rotulo">${grafico === 'dia' ? (d.daily.length > 45 ? 'Receita por semana' : 'Receita por dia') : 'Receita por mês, últimos 6 meses'}</span>
        <div class="seg ouro" role="group" aria-label="Detalhe do gráfico">
          <button data-g="dia" aria-pressed="${grafico === 'dia'}">Por dia</button><button data-g="mes" aria-pressed="${grafico === 'mes'}">Por mês</button></div></div>
      <div id="graf">${grafRender(grafico === 'dia' ? serieDia(d.daily) : serieMes(d.months))}</div>
    </div>
  </section>

  <section class="faixa" aria-label="Indicadores do período">
    <div class="ind"><span class="rot">Pedidos</span><span class="val num">${inteiro(cur.pedidos)}</span><div class="rod">${delta(cur.pedidos, prev.pedidos) || '<span></span>'}${spark(sparkPed)}</div></div>
    <div class="ind"><span class="rot">Ticket médio</span><span class="val num">${brl(ticket)}</span><div class="rod">${delta(ticket, ticketAnt) || '<span></span>'}${spark(sparkTick)}</div></div>
    <div class="ind"><span class="rot">Clientes que pediram</span><span class="val num">${inteiro(cur.clientes)}</span><div class="rod">${delta(cur.clientes, prev.clientes) || '<span></span>'}<span class="sub" style="color:var(--texto-2);font-size:13px">de ${inteiro(d.totalClientes)} na base</span></div></div>
    <div class="ind"><span class="rot">Mensagens enviadas</span><span class="val num">${inteiro(cur.mensagens)}</span><div class="rod"><span style="color:var(--texto-2);font-size:13px">${cur.conversoes ? `${inteiro(cur.conversoes)} voltaram a pedir` : 'nenhuma conversão ainda'}</span></div></div>
  </section>

  <h2 class="sec">Quem vale chamar<small>Clientes agrupados pelo tempo desde o último pedido</small></h2>
  <section class="painel">
    <div class="proporcao" role="img" aria-label="Proporção de clientes por grupo">
      ${SEGS.map(s => `<a href="#/contatos?seg=${encodeURIComponent(s)}" style="flex:${d.segments[s].clientes || 0.001};background:${SEG[s].cor}" title="${s}: ${inteiro(d.segments[s].clientes)} clientes" aria-label="${s}: ${inteiro(d.segments[s].clientes)} clientes"></a>`).join('')}
    </div>
    ${SEGS.map(s => { const g = d.segments[s], tk = g.pedidos ? g.receita / g.pedidos : 0;
      return `<div class="linha-seg">
        <div class="nome"><i style="background:${SEG[s].cor}"></i><a href="#/contatos?seg=${encodeURIComponent(s)}">${s}</a></div>
        <p class="exp"><b class="num">${inteiro(g.clientes)} clientes</b> (${Math.round(g.clientes / totClientes * 100)}%) · ticket médio ${brl(tk)}<br>${SEG[s].exp}</p>
        <div class="acao"><a class="btn pequeno" href="#/contatos?seg=${encodeURIComponent(s)}">Ver clientes</a>
          ${SEG[s].preset && g.contactaveis ? `<button class="btn pequeno ouro" data-nova="${esc(s)}">Criar campanha</button>` : ''}</div>
      </div>`; }).join('')}
  </section>

  <h2 class="sec">Por canal<small>Mensagens enviadas e pedidos que voltaram no período</small></h2>
  <section class="canais">${['whatsapp', 'sms'].map(ch => { const c = d.channels[ch], conf = ch === 'whatsapp' ? META.whatsapp.configured : META.sms.configured;
    return `<a class="painel canal" href="#/campanhas?canal=${ch}"><div class="canal-topo"><b>${CANAL[ch]}</b>${canalStatus(ch)}</div>
      <div class="numeros"><div><small>Campanhas</small><b class="num">${c.campanhas}</b></div><div><small>Enviadas</small><b class="num">${inteiro(c.enviadas)}</b></div><div><small>Voltaram</small><b class="num">${inteiro(c.conversoes)}</b></div><div><small>Receita</small><b class="num">${brlCurto(c.receita)}</b></div></div></a>`; }).join('')}</section>

  <h2 class="sec">Campanhas que mais trouxeram receita</h2>
  <section class="painel">${d.campaigns.length ? `<div class="rank">${(() => { const mx = Math.max(1, ...d.campaigns.map(c => c.receita));
    return d.campaigns.slice(0, 5).map(c => `<div class="rank-item"><div><b>${esc(c.name)}</b><small>${inteiro(c.enviadas)} enviadas · ${inteiro(c.conversoes)} conversões</small></div>
      <div class="barra"><i style="width:${c.receita / mx * 100}%"></i></div><b class="num">${brl(c.receita)}</b></div>`).join(''); })()}</div>`
    : `<div class="vazio"><b>Você ainda não criou campanhas</b><span>Crie uma para chamar de volta quem parou de pedir.</span><a class="btn ouro" href="#/campanhas">Ir para campanhas</a></div>`}</section>`;

  ligarPeriodo(d.period);
  $('#app').querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
    grafico = b.dataset.g; store.set('grafico', grafico);
    document.querySelectorAll('[data-g]').forEach(x => x.setAttribute('aria-pressed', x === b));
    $('#graf').innerHTML = grafRender(grafico === 'dia' ? serieDia(d.daily) : serieMes(d.months));
    document.querySelector('.graf-topo .rotulo').textContent = grafico === 'dia' ? (d.daily.length > 45 ? 'Receita por semana' : 'Receita por dia') : 'Receita por mês, últimos 6 meses';
  });
  $('#app').querySelectorAll('[data-nova]').forEach(b => b.onclick = () => { location.hash = '#/campanha?modelo=' + encodeURIComponent(b.dataset.nova); });
}

/* ---------- CONTATOS ---------- */
const filtro = { seg: 'Todos', q: '', sort: 'total' };
filtro.pagina = 0;
filtro.porPagina = 25;

function paginacaoHtml(id, pagina, porPagina, total, nome = 'itens', opcoes = [25, 50, 100]) {
  if (!total) return '';
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const inicio = pagina * porPagina + 1;
  const fim = Math.min((pagina + 1) * porPagina, total);
  return `<div class="paginacao" id="${id}">
    <label>${esc(nome)} por página <select class="campo" data-pag-tamanho>${opcoes.map(n => `<option value="${n}" ${porPagina === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <span class="num">${inteiro(inicio)}–${inteiro(fim)} de ${inteiro(total)} · página ${pagina + 1} de ${paginas}</span>
    <span class="paginacao-acoes"><button class="btn pequeno" data-pag-ant ${pagina === 0 ? 'disabled' : ''}>‹ Anterior</button><button class="btn pequeno" data-pag-prox ${pagina + 1 >= paginas ? 'disabled' : ''}>Próxima ›</button></span>
  </div>`;
}

function ligarPaginacao(id, estado, carregar) {
  const raiz = $('#' + id); if (!raiz) return;
  const tamanho = raiz.querySelector('[data-pag-tamanho]');
  if (tamanho) tamanho.onchange = () => { estado.porPagina = +tamanho.value; estado.pagina = 0; carregar(); };
  const ant = raiz.querySelector('[data-pag-ant]');
  const prox = raiz.querySelector('[data-pag-prox]');
  if (ant) ant.onclick = () => { estado.pagina = Math.max(0, estado.pagina - 1); carregar(); };
  if (prox) prox.onclick = () => { estado.pagina++; carregar(); };
}

async function pgContatos(qs) {
  if (qs.get('seg')) filtro.seg = qs.get('seg');
  $('#app').innerHTML = `
  <div class="page-head"><div><h1>Contatos</h1><p class="sub" id="resumo"></p></div><button class="btn" id="exportar">Exportar planilha</button></div>
  <div class="barra-filtros">
    <div class="busca">${icon('busca')}<input class="campo" id="q" type="search" placeholder="Buscar por nome ou telefone" value="${esc(filtro.q)}" aria-label="Buscar cliente"></div>
    <select class="campo" id="ord" aria-label="Ordenar por">
      ${[['total', 'Quem mais gastou'], ['pedidos', 'Mais pedidos'], ['recente', 'Pediu há menos tempo'], ['antigo', 'Sumiu há mais tempo'], ['nome', 'Nome (A a Z)']].map(([k, n]) => `<option value="${k}" ${filtro.sort === k ? 'selected' : ''}>${n}</option>`).join('')}
    </select>
  </div>
  <div class="chips" id="chips" style="margin-bottom:14px"></div>
  <div class="painel"><div class="rolagem"><table class="tabela"><thead><tr><th>Cliente</th><th>Grupo</th><th class="d">Pedidos</th><th class="d oculta-cel">Ticket médio</th><th class="d">Total gasto</th><th class="oculta-cel">Mais consome</th><th class="oculta-cel">Último pedido</th></tr></thead><tbody id="linhas"></tbody></table></div><div id="contatos-pag"></div></div>`;
  $('#exportar').onclick = async () => {
    try {
      const token = await window.CrmAuth.token();
      const r = await fetch('/api/customers/export', { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error((await r.json()).error || 'Não foi possível exportar.');
      const blob = await r.blob(); const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `clientes-${BRAND.produto.slug}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) { toast(e.message, true); }
  };
  async function carregar() {
    const off = filtro.pagina * filtro.porPagina;
    const r = await api(`customers?seg=${encodeURIComponent(filtro.seg)}&q=${encodeURIComponent(filtro.q)}&sort=${filtro.sort}&limit=${filtro.porPagina}&offset=${off}`);
    if (r.total && off >= r.total) { filtro.pagina = Math.max(0, Math.ceil(r.total / filtro.porPagina) - 1); return carregar(); }
    const linhas = r.rows, total = r.total;
    $('#chips').innerHTML = ['Todos', ...SEGS].map(s => `<button class="chip" data-s="${esc(s)}" aria-pressed="${filtro.seg === s}">${s}<b class="num">${inteiro(r.counts[s] || 0)}</b></button>`).join('');
    $('#chips').querySelectorAll('.chip').forEach(c => c.onclick = () => { filtro.seg = c.dataset.s; filtro.pagina = 0; carregar(); });
    $('#resumo').textContent = `${inteiro(total)} ${total === 1 ? 'cliente' : 'clientes'}${filtro.q ? ' encontrados' : ''}`;
    $('#linhas').innerHTML = linhas.length ? linhas.map(c => `<tr tabindex="0" data-id="${c.id}">
      <td><div class="pessoa"><span class="avatar" style="--c:${SEG[c.rfv].cor}" aria-hidden="true">${esc(nomeBonito(c.name).charAt(0))}</span><div style="min-width:0"><b>${esc(nomeBonito(c.name))}${c.opt_out ? ' <small>(não receber campanhas)</small>' : ''}</b><small class="num">${esc(fone(c.phone))}</small></div></div></td>
      <td>${pillSeg(c.rfv)}</td><td class="d num">${c.n_orders}</td><td class="d num oculta-cel">${brl(c.total / c.n_orders)}</td><td class="d num">${brl(c.total)}</td><td class="oculta-cel">${c.sabor ? `${esc(c.sabor.nome)} <small class="nota num">${pct(c.sabor.pct).replace(/,\d%$/, '%')}</small>` : c.favorito ? `<span class="nota">${esc(c.favorito)}</span>` : '<span class="nota">–</span>'}</td><td class="oculta-cel">${atras(c.recency)}</td></tr>`).join('')
      : `<tr><td colspan="7"><div class="vazio"><b>Nenhum cliente encontrado</b><span>Tente outro nome, outro grupo ou limpe a busca.</span></div></td></tr>`;
    $('#contatos-pag').innerHTML = paginacaoHtml('contatos-paginacao', filtro.pagina, filtro.porPagina, total, 'Clientes');
    ligarPaginacao('contatos-paginacao', filtro, carregar);
    $('#linhas').querySelectorAll('tr[data-id]').forEach(tr => {
      const abrir = () => gavetaCliente(+tr.dataset.id, () => carregar());
      tr.onclick = abrir; tr.onkeydown = e => { if (e.key === 'Enter') abrir(); };
    });
  }
  $('#q').oninput = debounce(e => { filtro.q = e.target.value.trim(); filtro.pagina = 0; carregar(); });
  $('#ord').onchange = e => { filtro.sort = e.target.value; filtro.pagina = 0; carregar(); };
  await carregar();
}

async function gavetaCliente(id, depois) {
  const c = await api('customer?id=' + id);
  const nome = nomeBonito(c.name);
  const endereco = [c.address, c.address_number].filter(Boolean).join(', ');
  const detalheEndereco = [c.address_complement, c.district, c.address_reference ? `Ref.: ${c.address_reference}` : ''].filter(Boolean).join(' · ');
  abrirGaveta(nome, `
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${pillSeg(c.rfv)}<span class="num">${esc(fone(c.phone))}</span></div>
    ${endereco ? `<div class="aviso neutro"><b>Endereço:</b> ${esc(endereco)}${detalheEndereco ? `<br><span class="nota">${esc(detalheEndereco)}</span>` : ''}</div>` : '<p class="nota">Endereço ainda não informado.</p>'}
    <div class="numeros"><div><small>Pedidos</small><b class="num">${c.n_orders}</b></div><div><small>Total gasto</small><b class="num">${brlCurto(c.total)}</b></div><div><small>Ticket médio</small><b class="num">${brl(c.total / c.n_orders).replace(',00', '')}</b></div><div><small>Último pedido</small><b>${atras(c.recency)}</b></div></div>
    ${c.excluded ? '<div class="aviso"><b>Fora das listas e relatórios.</b> Este cliente não aparece em contatos, análises nem campanhas. Os pedidos dele continuam somando no faturamento.</div>' : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${/^55\d{10,11}$/.test(c.phone) ? `<a class="btn ouro" target="_blank" rel="noopener" href="https://wa.me/${esc(c.phone)}">${icon('chat')}Abrir conversa no WhatsApp</a>` : '<span class="nota">Cliente sem telefone: não dá para enviar mensagem.</span>'}
      <button class="btn" id="optout">${c.opt_out ? 'Voltar a enviar campanhas' : 'Não enviar campanhas'}</button>
      <button class="btn" id="excluir">${c.excluded ? 'Voltar para as listas' : 'Tirar das listas e relatórios'}</button></div>
    ${c.consumo?.sabores?.length ? `<div><h3 style="font:700 16px var(--f-display);margin-bottom:6px">O que mais consome</h3>
      <div class="consumo">${c.consumo.sabores.map(s => `<div class="pr-barra"><div class="pr-rot"><span>${esc(s.nome)}</span><b class="num">${inteiro(s.unidades)} un. · ${pct(s.pct)}</b></div><div class="barra-pct"><i style="width:${Math.round(s.pct * 100)}%"></i></div></div>`).join('')}</div>
      <p class="nota" style="margin-top:8px">${inteiro(c.consumo.totalSalgados)} unidades nos pedidos com itens registrados${c.consumo.molho ? ` · molho preferido: <b>${esc(c.consumo.molho.nome)}</b>` : ''}.</p></div>`
      : c.n_orders ? '<p class="nota">Ainda sem os sabores dos pedidos deste cliente (os itens vêm do PDV na sincronização).</p>' : ''}
    ${c.favorito ? `<div class="aviso neutro"><b>Pedido favorito:</b> ${esc(c.favorito.curto)} <span class="nota">(pediu ${c.favorito.vezes} ${c.favorito.vezes === 1 ? 'vez' : 'vezes'})</span></div>` : ''}
    ${c.produtos?.length ? `<div><h3 style="font:700 16px var(--f-display);margin-bottom:6px">Produtos que mais pede</h3><div class="lista-ped">${c.produtos.map(p => `<div><span>${esc(p.nome)}</span><b class="num">${p.vezes} ${p.vezes === 1 ? 'pedido' : 'pedidos'}</b></div>`).join('')}</div></div>` : ''}
    <div><h3 style="font:700 16px var(--f-display);margin-bottom:6px">Pedidos</h3><div class="lista-ped">${c.orders.map(o => `<div><span>${dataBr(o.created_at)}</span><b class="num">${brl(o.total)}</b></div>`).join('')}</div></div>
    ${c.messages.length ? `<div><h3 style="font:700 16px var(--f-display);margin-bottom:6px">Mensagens recebidas</h3><div class="lista-ped">${c.messages.map(m => `<div><span>${esc(m.name)}</span><span class="num">${dataHora(m.sent_at + 'Z')}${m.status === 'dry' ? ' (teste)' : ''}</span></div>`).join('')}</div></div>` : ''}`);
  $('#optout').onclick = async () => {
    await api('optout', { id, value: c.opt_out ? 0 : 1 });
    toast(c.opt_out ? 'Esse cliente voltará a receber campanhas.' : 'Esse cliente não receberá mais campanhas.'); fecharGaveta(); depois?.();
  };
  $('#excluir').onclick = async () => {
    try { await api('excluir', { id, value: c.excluded ? 0 : 1 }); } catch (e) { return toast(e.message, true); }
    toast(c.excluded ? 'O cliente voltou para as listas e relatórios.' : 'Pronto. O cliente saiu das listas, análises e campanhas. Dá para desfazer em Ajustes.'); fecharGaveta(); depois?.();
  };
}

/* ---------- CAMPANHAS ---------- */
const balao = (txt, nome = 'Maria') => `<div class="balao">${esc(txt).replaceAll('{nome}', esc(nome)).replaceAll('[nome_cliente]', esc(nome))}</div>`;
const STATUS_CARD = { rascunho: ['Rascunho', 'off'], aguardando: ['Aguardando a Meta', 'off'], publicada: ['Publicada', 'on'] };
let canalFiltro = 'todos';
const CANAL = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'E-mail' };
function canalStatus(ch) {
  const conf = !!META[ch]?.configured, live = META.mode === 'live' && conf;
  const txt = live ? 'Envio real' : conf ? 'Pronto, em modo teste' : ch === 'whatsapp' ? 'Modo teste' : 'Falta configurar';
  return `<span class="status ${live ? 'on' : 'off'}">${txt}</span>`;
}
/* texto do envio automatico no cartao */
const hhmm = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function quando(iso) {
  const d = new Date(iso), hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dif = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - hoje) / 864e5);
  const dia = dif === 0 ? 'hoje' : dif === 1 ? 'amanhã' : d.toLocaleDateString('pt-BR', { weekday: 'long' });
  return `${dia} às ${hhmm(iso)}`;
}
function autoTexto(c) {
  const a = c.auto;
  if (!a.on) return 'Você envia manualmente. Ligue o automático para enviar sozinho nos horários escolhidos.';
  if (!a.ativoNoModo) return 'Modo teste: o automático só envia de verdade com o envio real ligado.';
  if (c.bloqueio) return `Parado: ${c.bloqueio}.`;
  if (a.ultimo?.parado) return `Parado: ${a.ultimo.parado}.`;
  const ult = a.ultimo?.enviadas != null ? ` Último lote às ${hhmm(a.ultimo.at)}: ${a.ultimo.enviadas} enviadas.` : '';
  if (!a.de) return 'Sem janela de envio nos próximos dias. Confira o período e os dias da campanha.';
  return (a.aberto ? `Enviando até ${hhmm(a.ate)}. Hoje: ${inteiro(a.hoje)} enviadas.` : `Próximo envio ${quando(a.de)}. Hoje: ${inteiro(a.hoje)} enviadas.`) + ult;
}

// Tela de campanhas no formato de vitrine: abas por situação, filtro de canal, busca, cartões com capa,
// receita gerada, números, avisos que bloqueiam o envio, dias de agendamento e ações.
const campF = { aba: 'ativas', q: '', porPagina: 12, pagina: 0 };
const CANAL_ICON = { whatsapp: 'chat', sms: 'chat', email: 'campanhas' };
const DIAS_LETRA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DIAS_NOME = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
function situacaoCamp(c) {
  if (c.status !== 'publicada') return 'rascunhos';
  if (!c.active) return 'pausa';
  return 'ativas';
}
function diasAgenda(c) {
  let s = c.schedule; try { if (typeof s === 'string') s = JSON.parse(s || '{}'); } catch { s = {}; }
  const d = s?.days || {};
  return DIAS_LETRA.map((l, i) => ({ l, on: d[i] ? d[i].on !== false : true, nome: DIAS_NOME[i] }));
}
function avisosCamp(c) {
  const a = [];
  if (c.status !== 'publicada') a.push(c.status === 'aguardando' ? 'A Meta ainda está aprovando o modelo da mensagem.' : 'A campanha é um rascunho: publique no editor para poder enviar.');
  else if (META.mode === 'live' && !META[c.channel]?.configured) a.push(`${CANAL[c.channel]} ainda não está conectado em Conexões.`);
  if (c.bloqueio && !a.some(x => x.includes(c.bloqueio))) a.push(c.bloqueio);
  if (c.status === 'publicada' && c.active && !c.prontos) a.push('Nenhum cliente pronto agora (todos fora da faixa de dias ou no intervalo de ruído).');
  return a;
}

async function pgCampanhas(qs) {
  if (qs?.get('canal')) canalFiltro = qs.get('canal');
  if (qs?.get('aba')) campF.aba = qs.get('aba');
  const todas = await api('campaigns');
  const naAba = c => campF.aba === 'agendamento' ? c.auto?.on : situacaoCamp(c) === campF.aba;
  const conta = aba => todas.filter(c => aba === 'agendamento' ? c.auto?.on : situacaoCamp(c) === aba).length;
  const filtradas = todas.filter(c => naAba(c) && (canalFiltro === 'todos' || c.channel === canalFiltro) && (!campF.q || c.name.toLowerCase().includes(campF.q.toLowerCase())));
  const paginas = Math.max(1, Math.ceil(filtradas.length / campF.porPagina));
  if (campF.pagina >= paginas) campF.pagina = 0;
  const pag = filtradas.slice(campF.pagina * campF.porPagina, (campF.pagina + 1) * campF.porPagina);
  const ABAS = [['ativas', 'Ativas'], ['agendamento', 'Agendamento'], ['pausa', 'Em pausa'], ['rascunhos', 'Rascunhos']];
  const CANAIS = [['todos', 'Todos'], ['whatsapp', 'WhatsApp Oficial'], ['email', 'E-mail'], ['sms', 'SMS']];
  const cartao = c => {
    const avisos = avisosCamp(c), taxa = c.enviadas ? c.conversoes / c.enviadas : 0, dias = diasAgenda(c);
    const capa = c.thumb ? `<img src="/media/${esc(c.thumb)}" alt="" loading="lazy">` : `<span class="cc-icone">${icon(CANAL_ICON[c.channel] || 'campanhas')}</span>`;
    return `<article class="cc ${c.thumb ? 'com-capa' : ''}" data-cc="${c.id}">
      <div class="cc-capa">${capa}
        <div class="cc-topo"><button class="cc-chip" data-ver="${c.id}">${icon('busca')}Ver conteúdo</button>
          <details class="cc-menu"><summary aria-label="Mais ações da campanha ${esc(c.name)}">⋮</summary><div class="cc-menu-lista">
            ${c.status === 'publicada' ? `<button data-run="${c.id}" ${avisos.length ? 'disabled' : ''}>${META.mode === 'live' ? 'Enviar agora' : 'Simular envio'}</button>
              <button data-auto="${c.id}" data-on="${c.auto?.on ? 0 : 1}">${c.auto?.on ? 'Desligar envio automático' : 'Ligar envio automático'}</button>
              <button data-toggle="${c.id}">${c.active ? 'Pausar' : 'Reativar'}</button>` : ''}
            <a href="#/campanha?id=${c.id}">Editar</a>
            ${c.enviadas === 0 && !c.templates.some(t => t.status !== 'SIMULADO') ? `<button class="perigo" data-apagar="${c.id}" data-nome="${esc(c.name)}">Apagar</button>` : ''}
          </div></details></div>
        <h3 class="cc-titulo">${esc(c.name)}</h3></div>
      <div class="cc-corpo">
        <div class="cc-canal"><span>${icon(CANAL_ICON[c.channel] || 'campanhas')}${esc(CANAL[c.channel] || c.channel)}</span>${c.auto?.on ? '<span class="status on">Automático</span>' : ''}</div>
        <div class="cc-receita"><small>Receita gerada</small><div><b class="num">${brl(c.receita)}</b><span class="num" title="Conversões ÷ enviadas">${pct(taxa)}</span></div></div>
        <div class="cc-nums">
          <div><b class="num">${inteiro(c.enviadas)}</b><small>Enviadas</small></div>
          <div><b class="num">${inteiro(c.prontos)}</b><small>Prontos agora</small></div>
          <div><b class="num">${inteiro(c.conversoes)}</b><small>Conversões</small></div>
        </div>
        ${avisos.length ? `<details class="cc-aviso"><summary>${icon('x')}${avisos.length} ${avisos.length === 1 ? 'aviso bloqueia' : 'avisos bloqueiam'} o envio</summary><ul>${avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul></details>`
          : `<div class="cc-ok">Pronta para enviar a ${inteiro(c.prontos)} ${c.prontos === 1 ? 'cliente' : 'clientes'}</div>`}
        <div class="cc-datas"><span title="Criada em">${icon('relogio')}${c.created_at ? dataHora(c.created_at) : '—'}</span><span title="Última edição">${icon('ajustes')}${c.updated_at ? dataHora(c.updated_at) : '—'}</span></div>
        <div class="cc-agenda"><small>Agendamento</small><div>${dias.map(d => `<span class="${d.on ? 'on' : ''}" title="${d.nome}: ${d.on ? 'envia' : 'não envia'}">${d.l}</span>`).join('')}</div></div>
      </div>
      <div class="cc-pe"><a href="#/performance">${icon('graficos')}Desempenho</a><a href="#/campanha?id=${c.id}">${icon('ajustes')}Editar</a></div>
    </article>`;
  };
  $('#app').innerHTML = `
  <div class="cc-barra">
    <div class="cc-abas" role="tablist">${ABAS.map(([k, n]) => `<button role="tab" aria-selected="${campF.aba === k}" data-aba="${k}">${n}<b class="num">${conta(k)}</b></button>`).join('')}</div>
    <div class="cc-ferr"><label class="cc-busca">${icon('busca')}<input id="cc-q" type="search" placeholder="Pesquisar…" value="${esc(campF.q)}" aria-label="Pesquisar campanhas"></label>
      <a class="btn" href="#/sugeridas">Campanhas sugeridas</a></div>
  </div>
  <div class="cc-barra">
    <div class="chips" id="canais">${CANAIS.map(([k, n]) => `<button class="chip" data-canal="${k}" aria-pressed="${canalFiltro === k}">${n}</button>`).join('')}</div>
    <button class="btn primario" id="nova">${icon('mais')}Nova campanha</button>
  </div>
  ${META.mode !== 'live' ? '<div class="aviso neutro" style="margin-bottom:14px"><b>Modo teste.</b> Nada é enviado de verdade. "Simular envio" mostra quantos clientes seriam atingidos.</div>' : ''}
  ${pag.length ? `<section class="cc-grade">${pag.map(cartao).join('')}</section>
    <div class="cc-pag"><label>Campanhas por página <select id="cc-pp" class="campo">${[12, 24, 48].map(n => `<option ${campF.porPagina === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <span class="num">${campF.pagina * campF.porPagina + 1}–${Math.min((campF.pagina + 1) * campF.porPagina, filtradas.length)} de ${filtradas.length}</span>
      <span><button class="btn pequeno" id="cc-ant" ${campF.pagina ? '' : 'disabled'} aria-label="Página anterior">‹</button> <button class="btn pequeno" id="cc-prox" ${campF.pagina + 1 < paginas ? '' : 'disabled'} aria-label="Próxima página">›</button></span></div>`
    : `<div class="painel vazio"><b>${campF.q ? 'Nenhuma campanha com esse nome' : { ativas: 'Nenhuma campanha ativa', agendamento: 'Nenhuma campanha com envio automático', pausa: 'Nenhuma campanha em pausa', rascunhos: 'Nenhum rascunho' }[campF.aba]}</b>
      <span>${campF.aba === 'rascunhos' || campF.aba === 'ativas' ? 'Crie uma campanha ou use uma das sugeridas.' : 'Troque de aba para ver as outras campanhas.'}</span>
      <span style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="btn ouro" id="nova2">Nova campanha</button><a class="btn" href="#/sugeridas">Ver sugeridas</a></span></div>`}`;

  const nova = () => { location.hash = '#/campanha?' + (['sms', 'email'].includes(canalFiltro) ? 'canal=' + canalFiltro : 'novo=1'); }; $('#nova').onclick = nova; if ($('#nova2')) $('#nova2').onclick = nova;
  document.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => { campF.aba = b.dataset.aba; campF.pagina = 0; pgCampanhas(); });
  document.querySelectorAll('[data-canal]').forEach(b => b.onclick = () => { canalFiltro = b.dataset.canal; campF.pagina = 0; pgCampanhas(); });
  $('#cc-q').oninput = debounce(e => { campF.q = e.target.value.trim(); campF.pagina = 0; pgCampanhas().then(() => { const i = $('#cc-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); });
  if ($('#cc-pp')) $('#cc-pp').onchange = e => { campF.porPagina = +e.target.value; campF.pagina = 0; pgCampanhas(); };
  if ($('#cc-ant')) $('#cc-ant').onclick = () => { campF.pagina--; pgCampanhas(); };
  if ($('#cc-prox')) $('#cc-prox').onclick = () => { campF.pagina++; pgCampanhas(); };
  // fecha o menu ⋮ ao clicar fora
  document.querySelectorAll('.cc-menu').forEach(m => m.addEventListener('toggle', () => { if (m.open) document.querySelectorAll('.cc-menu[open]').forEach(o => { if (o !== m) o.open = false; }); }));
  document.querySelectorAll('[data-ver]').forEach(b => b.onclick = () => {
    const c = todas.find(x => x.id === +b.dataset.ver);
    confirmar({ titulo: c.name, html: c.ads.map(a => `${c.ads.length > 1 ? `<p class="nota" style="margin:10px 0 4px">Anúncio ${esc(a.label)}</p>` : ''}${a.media ? `<img src="/media/${esc(a.media)}" alt="" style="max-width:100%;border-radius:10px;margin-bottom:6px">` : ''}${a.header && c.channel === 'email' ? `<p><b>Assunto:</b> ${esc(a.header)}</p>` : ''}${balao(a.body)}`).join(''), ok: 'Fechar', soOk: true });
  });
  document.querySelectorAll('[data-apagar]').forEach(b => b.onclick = async () => {
    if (!await confirmar({ titulo: `Apagar "${b.dataset.nome}"?`, html: '<p style="color:var(--texto-2)">A campanha ainda não enviou nada. Apagar não dá para desfazer.</p>', ok: 'Apagar', perigo: true })) return;
    try { await api('campaigns/delete', { id: +b.dataset.apagar }); toast('Campanha apagada.'); pgCampanhas(); } catch (e) { toast(e.message, true); }
  });
  document.querySelectorAll('[data-auto]').forEach(b => b.onclick = async () => {
    const c = todas.find(x => x.id === +b.dataset.auto), ligar = b.dataset.on === '1';
    if (ligar && META.mode === 'live' && !await confirmar({ titulo: 'Ligar o envio automático?',
      html: `<p style="color:var(--texto-2)">O programa passa a enviar sozinho, até ${c.prontos ? `<b>${inteiro(c.prontos)}</b> clientes` : 'os clientes elegíveis'}, nos dias e horários da campanha. Ele precisa ficar aberto neste computador. Você pode desligar quando quiser.</p>`, ok: 'Ligar' })) return;
    try { await api('campaigns/auto', { id: c.id, on: ligar }); toast(ligar ? 'Envio automático ligado.' : 'Envio automático desligado.'); pgCampanhas(); } catch (e) { toast(e.message, true); }
  });
  document.querySelectorAll('[data-toggle]').forEach(b => b.onclick = async () => { await api('campaigns/toggle', { id: +b.dataset.toggle }); pgCampanhas(); });
  document.querySelectorAll('[data-run]').forEach(b => b.onclick = async () => {
    const c = todas.find(x => x.id === +b.dataset.run), live = META.mode === 'live';
    const ok = await confirmar({
      titulo: live ? `Enviar para ${inteiro(c.prontos)} clientes?` : `Simular envio para ${inteiro(c.prontos)} clientes?`,
      html: `${balao(c.message)}<p style="color:var(--texto-2)">${live ? 'As mensagens saem agora e não dá para desfazer.' : 'Modo teste: nada será enviado de verdade.'}</p>`,
      ok: live ? `Enviar ${inteiro(c.prontos)} mensagens` : 'Simular envio' });
    if (!ok) return;
    try {
      const r = await api('campaigns/run', { id: c.id });
      toast(live ? `Enviadas: ${r.sent}${r.failed ? ` · com falha: ${r.failed}` : ''}.` : `Simulação: ${r.sent} clientes receberiam a mensagem.`, live && r.failed > 0);
    } catch (e) { toast(e.message, true); }
    pgCampanhas();
  });
}

/* ---------- CONEXOES ---------- */
async function pgConexoes() {
  await carregarMeta();
  const s = META.orders, w = META.whatsapp;
  const ult = s.lastSync ? new Date(s.lastSync).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
  $('#app').innerHTML = `
  <div class="page-head"><div><h1>Conexões</h1><p class="sub">De onde vêm os pedidos e por onde saem as mensagens.</p></div></div>
  <div class="conex">
    <section class="painel"><h3>${esc(BRAND.pdv.nome)} <span class="status ${s.configured && !s.error ? 'on' : 'off'}">${!s.configured ? 'Falta configurar' : s.error ? 'Com erro' : 'Conectado'}</span></h3>
      ${s.configured ? `<p>${ult ? `Última sincronização em ${ult}${s.result ? `: ${inteiro(s.result.added)} pedidos pagos novos.` : '.'}` : 'Ainda não sincronizou.'} Busca automaticamente a cada minuto; pedidos pendentes, cancelados e de homologação não entram no CRM.</p>
        ${s.error ? `<div class="aviso"><b>A última tentativa falhou.</b><br>${esc(s.error)}</div>` : ''}
        <div><button class="btn primario" id="sync">${icon('atualizar')}Sincronizar agora</button></div>`
      : `<p>Configure o acesso interno ao Supabase do PDV no servidor do CRM.</p>`}
    </section>
    <section class="painel wa" style="grid-column:1/-1"><h3>WhatsApp <span class="status ${w.configured && META.mode === 'live' ? 'on' : 'off'}">${META.mode === 'live' ? (w.configured ? 'Envio real' : 'Falta configurar') : w.configured ? 'Configurado, em modo teste' : 'Modo teste'}</span></h3>
      <p>${META.mode === 'live' ? 'As campanhas e os fluxos enviam mensagens de verdade.' : 'Nenhuma mensagem é enviada de verdade. Você pode simular campanhas à vontade.'} Cada mensagem vira um modelo que a Meta precisa aprovar antes do primeiro envio.</p>
      <div class="wa-acoes"><button class="btn primario" id="wa-check">Verificar conexão</button><button class="btn" id="wa-env">Abrir o arquivo de configuração</button><button class="btn" id="wa-restart">Reiniciar o programa</button></div>
      <div id="wa-result" aria-live="polite"></div>
      <details class="guia"><summary>Passo a passo para conectar a Meta</summary>
        <p class="nota">Os nomes dos menus da Meta mudam de tempos em tempos, então use isto como roteiro. <b>Nunca envie o token para ninguém.</b></p>
        <ol>
          <li><b>Conta da empresa.</b> Entre em <a href="https://business.facebook.com" target="_blank" rel="noopener">business.facebook.com</a> e use (ou crie) a conta da ${esc(BRAND.loja.nome)}. A Meta pode pedir a verificação da empresa.</li>
          <li><b>App.</b> Em <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com/apps</a>, crie um app do tipo Empresa e adicione o produto WhatsApp. Em <i>Configurações do app &gt; Básico</i> está o <b>ID do app</b>: copie para <code>WA_APP_ID</code>.</li>
          <li><b>Número.</b> Em <i>WhatsApp &gt; Configuração da API</i>, adicione o número da ${esc(BRAND.loja.nome)} e confirme o código que chega por SMS ou ligação. O número não pode estar ativo no WhatsApp comum, no WhatsApp Business do celular nem em outra conta de API. Nesta mesma tela ficam o <b>ID do número de telefone</b> (<code>WA_PHONE_ID</code>) e o <b>ID da conta do WhatsApp Business</b> (<code>WA_WABA_ID</code>). O ID não é o número com DDD.</li>
          <li><b>Token.</b> Em <i>Configurações da empresa &gt; Usuários &gt; Usuários do sistema</i>, crie um usuário, dê a ele acesso ao app e à conta do WhatsApp e gere um token com as permissões <code>whatsapp_business_messaging</code> e <code>whatsapp_business_management</code>. Cole em <code>WA_TOKEN</code>. Evite o token temporário de 24 horas da tela de teste.</li>
          <li><b>Colar os dados.</b> Clique em “Abrir o arquivo de configuração”, cole cada valor depois do <code>=</code>, salve e clique em “Reiniciar o programa”.</li>
          <li><b>Conferir.</b> Clique em “Verificar conexão”. Com tudo verde, publique uma campanha, espere a Meta aprovar e use “Enviar teste para o meu WhatsApp” (na revisão da campanha) antes de ligar o envio real.</li>
          <li><b>Ligar.</b> Por último, acrescente a linha <code>SEND_MODE=live</code> no mesmo arquivo e reinicie. Só então o programa passa a enviar para clientes.</li>
        </ol></details>
    </section>
    <section class="painel"><h3>Cópia no Supabase <span class="status ${META.supabase?.configured && !META.supabase.error && META.supabase.last ? 'on' : 'off'}">${!META.supabase?.configured ? 'Desligada' : META.supabase.error ? 'Com erro' : META.supabase.last ? 'Em dia' : 'Aguardando a 1ª cópia'}</span></h3>
      <p>Os dados dos clientes ficam guardados no Supabase, em São Paulo, com acesso fechado. A cópia roda ao abrir o programa, depois de cada sincronização do PDV e a cada 6 horas. Cliente apagado aqui some de lá na cópia seguinte.</p>
      ${META.supabase?.last ? `<p>Última cópia em ${new Date(META.supabase.last).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.</p>` : ''}
      ${META.supabase?.error ? `<div class="aviso"><b>A última cópia falhou.</b> A próxima tenta de novo sozinha.<br>${esc(META.supabase.error)}</div>` : ''}
      ${META.supabase?.configured ? `<div><button class="btn" id="sb-push">${icon('atualizar')}Copiar agora</button></div>` : `<p>Para ligar, preencha <code>SUPABASE_URL</code>, <code>SUPABASE_KEY</code> e <code>SUPABASE_CRM_SECRET</code> no arquivo de configuração e reinicie o programa.</p>`}
    </section>
    ${[['sms', 'SMS (Zenvia)', 'ZENVIA_TOKEN', 'ZENVIA_FROM', `
          <li><b>Conta.</b> Crie a conta em <a href="https://app.zenvia.com" target="_blank" rel="noopener">app.zenvia.com</a> e contrate um pacote de SMS (cobrado por mensagem).</li>
          <li><b>Token.</b> Em <i>Desenvolvedores &gt; Tokens e Webhooks</i>, gere um token e cole em <code>ZENVIA_TOKEN</code>.</li>
          <li><b>Remetente.</b> Em <i>Canais &gt; SMS</i>, copie o nome do remetente (palavra-chave) e cole em <code>ZENVIA_FROM</code>.</li>`],
       ['email', 'E-mail (Resend)', 'RESEND_API_KEY', 'EMAIL_FROM', `
          <li><b>Conta.</b> Crie a conta grátis em <a href="https://resend.com" target="_blank" rel="noopener">resend.com</a> (3.000 e-mails por mês).</li>
          <li><b>Domínio.</b> Em <i>Domains</i>, adicione <code>${esc(BRAND.loja.dominioEmail || 'seudominio.com.br')}</code> e crie no DNS do domínio os registros que o Resend mostrar. Sem isso os e-mails não saem.</li>
          <li><b>Chave.</b> Em <i>API Keys</i>, crie uma chave e cole em <code>RESEND_API_KEY</code>.</li>
          <li><b>Remetente.</b> Em <code>EMAIL_FROM</code>, escreva por exemplo <code>${esc(BRAND.loja.emailRemetente || (BRAND.loja.nome + ' <contato@' + (BRAND.loja.dominioEmail || 'seudominio.com.br') + '>'))}</code>. Opcional: <code>EMAIL_REPLY_TO</code> com o e-mail que recebe respostas e pedidos de descadastro.</li>`]]
      .map(([ch, nome, k1, k2, passos]) => `
    <section class="painel"><h3>${nome} ${canalStatus(ch)}</h3>
      <p>${META[ch]?.configured ? (META.mode === 'live' ? 'As campanhas deste canal enviam de verdade.' : 'Configurado. Em modo teste o envio é só simulado.') : `Preencha <code>${k1}</code> e <code>${k2}</code> no arquivo de configuração e reinicie o programa. Até lá, dá para criar e simular campanhas.`}</p>
      <div class="wa-acoes"><button class="btn" data-verif="${ch}">Verificar</button><a class="btn" href="#/campanhas?canal=${ch}">Ver campanhas</a></div>
      <div id="verif-${ch}" aria-live="polite"></div>
      <details class="guia"><summary>Passo a passo</summary><ol>${passos}
          <li><b>Colar e conferir.</b> Use “Abrir o arquivo de configuração” no cartão do WhatsApp, cole os valores, salve, reinicie e clique em Verificar.</li></ol></details>
    </section>`).join('')}
    <section class="painel" id="cartao-google" style="grid-column:1/-1"><h3>Google (Meu Negócio e Ads)</h3><p class="nota">Carregando…</p></section>
    <section class="painel"><h3>Importar planilha</h3>
      <p>Para pedidos históricos externos. Arquivo CSV com as colunas <code>external_id, name, phone, total, created_at</code>.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><input class="campo" type="file" id="csv" accept=".csv,text/csv" aria-label="Arquivo CSV"><button class="btn" id="up">Importar</button></div>
    </section>
  </div>`;
  $('#wa-check').onclick = async () => {
    const btn = $('#wa-check'), box = $('#wa-result'); btn.disabled = true; btn.textContent = 'Verificando…';
    try {
      const r = await api('whatsapp/check', {});
      box.innerHTML = `<ul class="wa-res">${r.itens.map(i => `<li class="${i.ok ? 'ok' : i.aviso ? 'aviso' : 'erro'}"><span class="marca">${i.ok ? '✓' : i.aviso ? '!' : '✗'}</span><div><b>${esc(i.titulo)}</b><span>${esc(i.detalhe)}</span>${i.ajuda ? `<small>${esc(i.ajuda)}</small>` : ''}</div></li>`).join('')}</ul>
        <p class="nota" style="margin-top:8px">${r.pronto ? '<b>Conexão pronta.</b> A Meta respondeu a tudo que o programa precisa para criar modelos e enviar.' : 'Ainda não está pronto. Corrija os itens com ✗ e clique em Verificar de novo.'}</p>`;
    } catch (e) { box.innerHTML = `<div class="aviso">${esc(e.message)}</div>`; }
    btn.disabled = false; btn.textContent = 'Verificar conexão';
  };
  $('#wa-env').onclick = async () => { try { await api('open-env', {}); toast('Abri o arquivo no Bloco de Notas. Cole os dados, salve e clique em Reiniciar o programa.'); } catch (e) { toast(e.message, true); } };
  $('#wa-restart').onclick = async () => {
    try { await api('restart', {}); } catch (e) { return toast(e.message, true); }
    toast('Reiniciando…');
    for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 1500)); try { await api('meta'); location.reload(); return; } catch { /* ainda subindo */ } }
    toast('Não consegui reconectar. Abra o programa pelo atalho de novo.', true);
  };
  cartaoGoogle();
  document.querySelectorAll('[data-verif]').forEach(b => b.onclick = async () => {
    const ch = b.dataset.verif, box = $('#verif-' + ch); b.disabled = true; b.textContent = 'Verificando…';
    try {
      const r = await api('canal/verificar', { canal: ch });
      box.innerHTML = `<ul class="wa-res">${r.itens.map(i => `<li class="${i.ok ? 'ok' : i.aviso ? 'aviso' : 'erro'}"><span class="marca">${i.ok ? '✓' : i.aviso ? '!' : '✗'}</span><div><b>${esc(i.titulo)}</b><span>${esc(i.detalhe)}</span>${i.ajuda ? `<small>${esc(i.ajuda)}</small>` : ''}</div></li>`).join('')}</ul>`;
    } catch (e) { box.innerHTML = `<div class="aviso">${esc(e.message)}</div>`; }
    b.disabled = false; b.textContent = 'Verificar';
  });
  const sp = $('#sb-push');
  if (sp) sp.onclick = async () => {
    sp.disabled = true; sp.innerHTML = `${icon('atualizar', 'girando')}Copiando…`;
    try { await api('supabase/push', {}); toast('Cópia no Supabase em dia.'); } catch (e) { toast(e.message, true); }
    pgConexoes();
  };
  const sb = $('#sync');
  if (sb) sb.onclick = async () => {
    sb.disabled = true; sb.innerHTML = `${icon('atualizar', 'girando')}Sincronizando… pode levar alguns minutos`;
    try { const r = await api('pdv/sync', {}); toast(`Pronto: ${inteiro(r.added)} pedidos novos.`); }
    catch (e) { toast(e.message, true); }
    pgConexoes();
  };
  $('#up').onclick = async () => {
    const f = $('#csv').files[0]; if (!f) return toast('Escolha um arquivo CSV primeiro.', true);
    try { const r = await api('import/csv', await f.text(), true); toast(`Importado: ${inteiro(r.added)} pedidos novos, ${inteiro(r.skipped)} ignorados.`); }
    catch (e) { toast(e.message, true); }
  };
}

/* ---------- DESCADASTROS ---------- */
const descF = { pagina: 0, porPagina: 25 };
async function pgDescadastros() {
  const r = await api(`customers?optout=1&limit=${descF.porPagina}&offset=${descF.pagina * descF.porPagina}&sort=nome`);
  if (r.total && descF.pagina * descF.porPagina >= r.total) { descF.pagina = Math.max(0, Math.ceil(r.total / descF.porPagina) - 1); return pgDescadastros(); }
  $('#app').innerHTML = `
  <div class="page-head"><div><h1>Descadastros</h1><p class="sub">Clientes que não recebem campanhas. ${inteiro(r.total)} ${r.total === 1 ? 'cliente' : 'clientes'}.</p></div></div>
  <div class="painel">${r.rows.length ? `<div class="rolagem"><table class="tabela"><thead><tr><th>Cliente</th><th>Grupo</th><th class="d"></th></tr></thead><tbody>
    ${r.rows.map(c => `<tr><td><div class="pessoa"><span class="avatar" style="--c:${SEG[c.rfv].cor}" aria-hidden="true">${esc(nomeBonito(c.name).charAt(0))}</span><div><b>${esc(nomeBonito(c.name))}</b><small class="num">${esc(fone(c.phone))}</small></div></div></td>
    <td>${pillSeg(c.rfv)}</td><td class="d"><button class="btn pequeno" data-volta="${c.id}">Voltar a enviar</button></td></tr>`).join('')}</tbody></table></div>${paginacaoHtml('desc-paginacao', descF.pagina, descF.porPagina, r.total, 'Clientes')}`
    : `<div class="vazio"><b>Ninguém pediu para sair</b><span>Quando você marcar um cliente como "não enviar campanhas" na gaveta dele em Contatos, ele aparece aqui e deixa de receber mensagens.</span><a class="btn" href="#/contatos">Ir para contatos</a></div>`}</div>`;
  ligarPaginacao('desc-paginacao', descF, pgDescadastros);
  document.querySelectorAll('[data-volta]').forEach(b => b.onclick = async () => { await api('optout', { id: +b.dataset.volta, value: 0 }); toast('Esse cliente voltará a receber campanhas.'); rota(); });
}

/* ---------- MENSAGENS ENVIADAS ---------- */
const msgF = { canal: 'todos', status: 'todos', q: '', pagina: 0, porPagina: 25 };
async function pgMensagens() {
  $('#app').innerHTML = `
  <div class="page-head"><div><h1>Mensagens enviadas</h1><p class="sub" id="resumo"></p></div></div>
  <div class="barra-filtros"><div class="busca">${icon('busca')}<input class="campo" id="q" type="search" placeholder="Buscar por nome ou telefone" value="${esc(msgF.q)}" aria-label="Buscar mensagem"></div>
    <div class="chips" id="fcanal"></div><div class="chips" id="fstatus"></div></div>
  <div class="painel"><div class="rolagem"><table class="tabela"><thead><tr><th>Quando</th><th>Cliente</th><th>Campanha</th><th>Canal</th><th>Situação</th></tr></thead><tbody id="linhas"></tbody></table></div><div id="mensagens-pag"></div></div>`;
  const ST = { sent: ['Enviada', 'var(--folha)'], dry: ['Teste', 'var(--texto-2)'], failed: ['Falhou', 'var(--pimenta)'] };
  async function carregar() {
    const r = await api(`messages?channel=${msgF.canal}&status=${msgF.status}&q=${encodeURIComponent(msgF.q)}&limit=${msgF.porPagina}&offset=${msgF.pagina * msgF.porPagina}`);
    if (r.total && msgF.pagina * msgF.porPagina >= r.total) { msgF.pagina = Math.max(0, Math.ceil(r.total / msgF.porPagina) - 1); return carregar(); }
    const linhas = r.rows;
    $('#resumo').textContent = `${inteiro(r.total)} ${r.total === 1 ? 'mensagem' : 'mensagens'}. Simulações aparecem como "Teste".`;
    const chips = (id, opts, chave) => { $(id).innerHTML = opts.map(([k, n]) => `<button class="chip" data-k="${k}" aria-pressed="${msgF[chave] === k}">${n}</button>`).join('');
      $(id).querySelectorAll('.chip').forEach(c => c.onclick = () => { msgF[chave] = c.dataset.k; msgF.pagina = 0; carregar(); }); };
    chips('#fcanal', [['todos', 'Todos os canais'], ['whatsapp', 'WhatsApp'], ['sms', 'SMS'], ['email', 'E-mail']], 'canal');
    chips('#fstatus', [['todos', 'Todas'], ['sent', 'Enviadas'], ['dry', 'Testes'], ['failed', 'Falhas']], 'status');
    $('#linhas').innerHTML = linhas.length ? linhas.map(m => `<tr style="cursor:default"><td class="num">${dataHora(m.sent_at + 'Z')}</td>
      <td><div class="pessoa"><div><b>${esc(nomeBonito(m.name))}</b><small class="num">${esc(fone(m.phone))}</small></div></div></td>
      <td>${esc(m.campaign)}</td><td>${CANAL[m.channel] || esc(m.channel)}</td>
      <td><span class="pill" style="--c:${ST[m.status][1]}" ${m.error ? `title="${esc(m.error)}"` : ''}>${ST[m.status][0]}</span></td></tr>`).join('')
      : `<tr><td colspan="5"><div class="vazio"><b>Nenhuma mensagem por aqui</b><span>Quando você disparar ou simular uma campanha, cada mensagem aparece nesta lista.</span><a class="btn ouro" href="#/campanhas">Ir para campanhas</a></div></td></tr>`;
    $('#mensagens-pag').innerHTML = paginacaoHtml('mensagens-paginacao', msgF.pagina, msgF.porPagina, r.total, 'Mensagens');
    ligarPaginacao('mensagens-paginacao', msgF, carregar);
  }
  $('#q').oninput = debounce(e => { msgF.q = e.target.value.trim(); msgF.pagina = 0; carregar(); });
  await carregar();
}

/* ---------- PERFORMANCE ---------- */
const periodoAtual = () => Object.fromEntries(new URLSearchParams(periodoQuery()));
function miniBarras(daily, chave, fmt) {
  const max = Math.max(0, ...daily.map(x => x[chave]));
  return `<div class="mini" role="img" aria-label="Gráfico diário">${daily.map(x => `<i style="height:${max ? Math.max(x[chave] / max * 100, x[chave] ? 4 : 0) : 0}%" title="${curto(x.d)}: ${esc(fmt(x[chave]))}"></i>`).join('')}</div>
    <div class="mini-eixo"><span>${curto(daily[0].d)}</span><span>${curto(daily[daily.length - 1].d)}</span></div>`;
}
const pct = n => (n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
async function pgPerformance() {
  const d = await api('performance?' + periodoQuery());
  const total = d.resumo.enviadas, r = d.resumo;
  const vezes = v => v == null ? '–' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}x`;
  const roiTxt = v => v == null ? '–' : pct(v);
  $('#app').innerHTML = `
  <div class="page-head"><div><h1>Performance</h1><p class="sub">Quanto cada campanha e cada canal trouxe de volta, de ${dataBr(d.period.from + 'T12:00')} a ${dataBr(d.period.to + 'T12:00')}.</p></div>${periodoHtml(d.period)}</div>
  <section class="painel pad perf-resumo">
    <div class="perf-destaque"><small>Receita influenciada por campanhas</small><b class="num">${brl(r.receita)}</b><span class="nota">${pct(r.influenciada)} de toda a receita do período (${brlCurto(r.receitaPeriodo)})</span></div>
    <div class="numeros">
      <div><small>Custo das mensagens</small><b class="num">${brl(r.custo)}</b></div>
      <div><small>Desconto nos pedidos</small><b class="num">${brl(r.desconto)}</b></div>
      <div><small>ROAS</small><b class="num">${vezes(r.roas)}</b></div>
      <div><small>ROI</small><b class="num">${roiTxt(r.roi)}</b></div>
    </div>
    <p class="nota">ROAS = receita ÷ custo das mensagens. ROI = (receita − custo − desconto) ÷ (custo + desconto). Custo por mensagem: WhatsApp ${brl(r.custoPorMensagem.whatsapp)}, SMS ${brl(r.custoPorMensagem.sms)}, e-mail ${brl(r.custoPorMensagem.email)} (mude em <a href="#/ajustes">Ajustes</a>).</p>
  </section>
  <section class="canais">${['whatsapp', 'sms', 'email'].map(ch => { const c = d.channels[ch];
    return `<div class="painel canal"><div class="canal-topo"><b>${CANAL[ch]}</b>${canalStatus(ch)}</div>
      <div class="numeros"><div><small>Enviadas</small><b class="num">${inteiro(c.enviadas)}</b></div><div><small>Voltaram</small><b class="num">${inteiro(c.conversoes)}</b></div><div><small>Taxa</small><b class="num">${pct(c.taxa)}</b></div><div><small>Receita</small><b class="num">${brlCurto(c.receita)}</b></div><div><small>Custo</small><b class="num">${brlCurto(c.custo)}</b></div></div></div>`; }).join('')}</section>
  ${total ? `<div class="duas">
    <section class="painel pad"><h3 class="mini-titulo">Mensagens enviadas por dia</h3>${miniBarras(d.daily, 'enviadas', v => `${v} mensagens`)}</section>
    <section class="painel pad"><h3 class="mini-titulo">Receita de campanhas por dia</h3>${miniBarras(d.daily, 'receita', brl)}</section></div>` : ''}
  <h2 class="sec">Por campanha</h2>
  <div class="painel">${d.campaigns.length ? `<div class="rolagem"><table class="tabela"><thead><tr><th>Campanha</th><th>Canal</th><th class="d">Enviadas</th><th class="d">Voltaram</th><th class="d">Taxa</th><th class="d">Ticket médio</th><th class="d">Receita</th><th class="d">Custo</th><th class="d">Desconto</th><th class="d">ROAS</th></tr></thead><tbody>
    ${d.campaigns.map(c => `<tr style="cursor:default"><td><b>${esc(c.name)}</b></td><td>${CANAL[c.channel] || esc(c.channel)}</td><td class="d num">${inteiro(c.enviadas)}</td><td class="d num">${inteiro(c.conversoes)}</td><td class="d num">${c.enviadas ? pct(c.taxa) : '–'}</td><td class="d num">${c.conversoes ? brl(c.ticket) : '–'}</td><td class="d num"><b>${brl(c.receita)}</b></td><td class="d num">${c.enviadas ? brl(c.custo) : '–'}</td><td class="d num">${c.conversoes ? brl(c.desconto) : '–'}</td><td class="d num">${vezes(c.roas)}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="vazio"><b>Sem campanhas ainda</b><a class="btn ouro" href="#/campanhas">Criar campanha</a></div>`}</div>
  ${total ? '' : `<div class="aviso neutro" style="margin-top:16px">Nenhuma mensagem foi enviada de verdade neste período. Simulações não entram aqui.</div>`}`;
  ligarPeriodo(d.period);
}

/* ---------- GOOGLE: conexão, Meu Negócio e Ads ---------- */
async function cartaoGoogle() {
  const box = $('#cartao-google'); if (!box) return;
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  let g; try { g = await api('google'); } catch (e) { box.innerHTML = `<h3>Google</h3><div class="aviso">${esc(e.message)}</div>`; return; }
  const estado = !g.clientePronto ? '<span class="status off">Falta configurar</span>' : g.conectado ? '<span class="status on">Conectado</span>' : '<span class="status off">Não conectado</span>';
  box.innerHTML = `<h3>Google (Meu Negócio e Ads) ${estado}</h3>
    ${qs.get('google') === 'ok' ? '<div class="aviso neutro"><b>Conta Google conectada.</b></div>' : ''}
    ${qs.get('google_erro') ? `<div class="aviso"><b>Não deu certo:</b> ${esc(qs.get('google_erro'))}</div>` : ''}
    <p>${g.conectado ? `Conectado como <b>${esc(g.email || 'conta Google')}</b>${g.conectadoEm ? ` desde ${dataBr(g.conectadoEm)}` : ''}. O acesso fica guardado só neste computador.`
      : g.clientePronto ? 'Clique em conectar e entre com a conta Google que administra o perfil da ' + esc(BRAND.loja.nome) + ' e o Google Ads.'
      : 'Primeiro crie o acesso no Google Cloud e preencha <code>GOOGLE_CLIENT_ID</code> e <code>GOOGLE_CLIENT_SECRET</code> no arquivo de configuração (passo a passo abaixo).'}</p>
    <div class="wa-acoes">${g.clientePronto ? (g.conectado ? '<button class="btn" id="g-sair">Desconectar</button>' : `<button class="btn primario" id="g-entrar">${icon('google')}Conectar conta Google</button>`) : ''}
      <a class="btn" href="#/gnegocio">Ver avaliações</a><a class="btn" href="#/gads">Ver Google Ads</a></div>
    <p class="nota">Google Ads: ${g.ads.tokenPronto && g.ads.cliente ? `conta ${esc(g.ads.cliente)} configurada.` : 'falta <code>GOOGLE_ADS_DEVELOPER_TOKEN</code> e <code>GOOGLE_ADS_CUSTOMER_ID</code>.'}</p>
    <details class="guia"><summary>Passo a passo (o Google pede algumas aprovações, que só você consegue pedir)</summary><ol>
      <li><b>Projeto.</b> Em <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">console.cloud.google.com</a>, crie um projeto (ex.: "${esc(BRAND.produto.nomeCompleto)}").</li>
      <li><b>APIs.</b> Em <i>APIs e serviços &gt; Biblioteca</i>, ative: <i>My Business Account Management API</i>, <i>My Business Business Information API</i>, <i>Google My Business API</i> e <i>Google Ads API</i>.</li>
      <li><b>Acesso ao Meu Negócio.</b> As APIs do Perfil da Empresa só respondem depois que o Google aprova o projeto: peça em <a href="https://developers.google.com/my-business/content/prereqs#request-access" target="_blank" rel="noopener">developers.google.com/my-business</a> (formulário de acesso; leva alguns dias).</li>
      <li><b>Tela de consentimento.</b> Em <i>APIs e serviços &gt; Tela de permissão OAuth</i>, tipo "Externo", com o seu e-mail como usuário de teste.</li>
      <li><b>Credencial.</b> Em <i>Credenciais &gt; Criar credenciais &gt; ID do cliente OAuth</i>, tipo "Aplicativo da Web", com o URI de redirecionamento <code>${esc(g.redirect)}</code>. Copie o ID e a chave secreta para <code>GOOGLE_CLIENT_ID</code> e <code>GOOGLE_CLIENT_SECRET</code>.</li>
      <li><b>Google Ads.</b> O token de desenvolvedor fica numa conta de administrador (MCC): em <a href="https://ads.google.com/aw/apicenter" target="_blank" rel="noopener">ads.google.com &gt; Central de API</a>, peça o acesso básico e copie o token para <code>GOOGLE_ADS_DEVELOPER_TOKEN</code>. O número da conta da ${esc(BRAND.loja.nome)} (só os dígitos) vai em <code>GOOGLE_ADS_CUSTOMER_ID</code>, e o da conta de administrador em <code>GOOGLE_ADS_LOGIN_CUSTOMER_ID</code>.</li>
      <li><b>Conectar.</b> Reinicie o programa e clique em "Conectar conta Google".</li></ol></details>`;
  const entrar = $('#g-entrar'); if (entrar) entrar.onclick = async () => { try { location.href = (await api('google/login')).url; } catch (e) { toast(e.message, true); } };
  const sair = $('#g-sair'); if (sair) sair.onclick = async () => { if (!confirm('Desconectar a conta Google deste computador?')) return; await api('google/desconectar', {}); toast('Conta Google desconectada.'); cartaoGoogle(); };
}

const estrelas = n => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
async function pgGoogleNegocio() {
  const g = await api('google');
  const cab = `<div class="page-head"><div><h1>Google Meu Negócio</h1><p class="sub">Nota e avaliações do perfil da ${esc(BRAND.loja.nome)} no Google.</p></div></div>`;
  if (!g.conectado) { $('#app').innerHTML = cab + `<div class="painel vazio"><b>Conta Google não conectada</b><span>Conecte em <a href="#/conexoes">Conexões &gt; Google</a>.</span></div>`; return; }
  if (!g.local) {
    $('#app').innerHTML = cab + '<div class="painel pad" id="g-locais"><p class="nota">Buscando os perfis da sua conta…</p></div>';
    try {
      const locais = await api('google/locais');
      $('#g-locais').innerHTML = locais.length ? `<h3 class="mini-titulo">Escolha o perfil da ${esc(BRAND.loja.nome)}</h3><div class="lista-ped">${locais.map((l, i) => `<div><span><b>${esc(l.titulo)}</b> <span class="nota">${esc(l.endereco)}</span></span><button class="btn pequeno" data-local="${i}">Usar este</button></div>`).join('')}</div>`
        : '<div class="vazio"><b>Nenhum perfil nesta conta Google</b><span>Conecte com a conta que administra o perfil da ${esc(BRAND.loja.nome)} no Google.</span></div>';
      document.querySelectorAll('[data-local]').forEach(b => b.onclick = async () => { await api('google/local', locais[+b.dataset.local]); toast('Perfil escolhido.'); pgGoogleNegocio(); });
    } catch (e) { $('#g-locais').innerHTML = `<div class="aviso"><b>O Google não respondeu.</b> ${esc(e.message)}</div>`; }
    return;
  }
  $('#app').innerHTML = cab + '<div class="painel pad"><p class="nota">Buscando as avaliações…</p></div>';
  let d; try { d = await api('google/avaliacoes'); } catch (e) { $('#app').innerHTML = cab + `<div class="aviso"><b>O Google não respondeu.</b> ${esc(e.message)}</div>`; return; }
  const maxD = Math.max(1, ...d.distribuicao.map(x => x.qtd));
  $('#app').innerHTML = `<div class="page-head"><div><h1>Google Meu Negócio</h1><p class="sub">${esc(d.local.titulo || 'Perfil da ' + BRAND.loja.nome)} no Google.</p></div></div>
  <section class="numeros-grandes">
    <div class="painel pad"><small>Nota média</small><b class="num">${d.media != null ? Number(d.media).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'}</b><span class="nota" aria-hidden="true">${d.media != null ? estrelas(Math.round(d.media)) : ''}</span></div>
    <div class="painel pad"><small>Avaliações</small><b class="num">${inteiro(d.total)}</b><span class="nota">${inteiro(d.ultimos30)} nos últimos 30 dias</span></div>
    <div class="painel pad"><small>Sem resposta</small><b class="num">${inteiro(d.semResposta)}</b><span class="nota">${inteiro(d.negativasSemResposta)} com 3 estrelas ou menos</span></div>
  </section>
  <div class="duas">
    <section class="painel pad"><h3 class="mini-titulo">Distribuição das notas</h3>${d.distribuicao.map(x => `<div class="pr-barra"><div class="pr-rot"><span>${x.nota} ${x.nota === 1 ? 'estrela' : 'estrelas'}</span><b class="num">${inteiro(x.qtd)}</b></div><div class="barra-pct"><i style="width:${Math.round(x.qtd / maxD * 100)}%"></i></div></div>`).join('')}</section>
    <section class="painel pad"><h3 class="mini-titulo">O que fazer agora</h3>${d.negativasSemResposta ? `<div class="aviso">Há <b>${inteiro(d.negativasSemResposta)}</b> avaliações de 3 estrelas ou menos sem resposta. Responder rápido melhora a nota percebida: responda pelo app do Google Meu Negócio.</div>` : '<p class="nota">Nenhuma avaliação negativa esperando resposta.</p>'}</section>
  </div>
  <h2 class="sec">Avaliações recentes</h2>
  <div class="painel">${d.avaliacoes.length ? `<div class="g-avals">${d.avaliacoes.map(a => `<article class="g-aval"><div class="g-aval-topo"><b>${esc(a.autor)}</b><span class="g-estrelas" aria-label="${a.nota} de 5 estrelas">${estrelas(a.nota)}</span><span class="nota">${dataBr(a.data)}</span>${a.respondida ? '<span class="status on">Respondida</span>' : '<span class="status off">Sem resposta</span>'}</div>${a.texto ? `<p>${esc(a.texto)}</p>` : '<p class="nota">Só a nota, sem comentário.</p>'}${a.resposta ? `<p class="nota"><b>Resposta:</b> ${esc(a.resposta)}</p>` : ''}</article>`).join('')}</div>`
    : '<div class="vazio"><span>Nenhuma avaliação ainda.</span></div>'}</div>`;
}

async function pgGoogleAds() {
  const g = await api('google');
  const cab = (p) => `<div class="page-head"><div><h1>Google Ads</h1><p class="sub">Quanto as campanhas do Google custaram e trouxeram${p ? `, de ${dataBr(p.from + 'T12:00')} a ${dataBr(p.to + 'T12:00')}` : ''}.</p></div>${p ? periodoHtml(p) : ''}</div>`;
  if (!g.conectado || !g.ads.tokenPronto || !g.ads.cliente) {
    $('#app').innerHTML = cab() + `<div class="painel vazio"><b>${!g.conectado ? 'Conta Google não conectada' : 'Falta configurar o Google Ads'}</b><span>Veja o passo a passo em <a href="#/conexoes">Conexões &gt; Google</a>.</span></div>`; return;
  }
  $('#app').innerHTML = cab() + '<div class="painel pad"><p class="nota">Buscando os números do Google Ads…</p></div>';
  let d; try { d = await api('google/ads?' + periodoQuery()); } catch (e) { $('#app').innerHTML = cab() + `<div class="aviso"><b>O Google Ads não respondeu.</b> ${esc(e.message)}</div>`; return; }
  const t = d.total, x = v => v == null ? '–' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}x`;
  $('#app').innerHTML = cab(d.periodo) + `
  <section class="numeros-grandes">
    <div class="painel pad"><small>Investimento</small><b class="num">${brl(t.custo)}</b><span class="nota">${inteiro(t.cliques)} cliques · CPC ${brl(t.cpc)}</span></div>
    <div class="painel pad"><small>Conversões</small><b class="num">${t.conversoes.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</b><span class="nota">${t.custoConversao != null ? `${brl(t.custoConversao)} por conversão` : 'sem conversões'}</span></div>
    <div class="painel pad"><small>ROAS (valor de conversão ÷ custo)</small><b class="num">${x(t.roas)}</b><span class="nota">${brl(t.valor)} em valor de conversão</span></div>
    <div class="painel pad"><small>Peso no faturamento</small><b class="num">${d.receitaLoja ? pct(t.custo / d.receitaLoja) : '–'}</b><span class="nota">do faturamento da loja no período (${brlCurto(d.receitaLoja)})</span></div>
  </section>
  <div class="painel">${d.campanhas.length ? `<div class="rolagem"><table class="tabela"><thead><tr><th>Campanha</th><th>Situação</th><th class="d">Custo</th><th class="d">Impressões</th><th class="d">Cliques</th><th class="d">CTR</th><th class="d">CPC</th><th class="d">Conversões</th><th class="d">ROAS</th></tr></thead><tbody>
    ${d.campanhas.map(c => `<tr style="cursor:default"><td><b>${esc(c.nome)}</b></td><td>${c.status === 'ENABLED' ? '<span class="status on">Ativa</span>' : `<span class="status off">${c.status === 'PAUSED' ? 'Pausada' : esc(c.status || '')}</span>`}</td><td class="d num"><b>${brl(c.custo)}</b></td><td class="d num">${inteiro(c.impressoes)}</td><td class="d num">${inteiro(c.cliques)}</td><td class="d num">${pct(c.ctr)}</td><td class="d num">${brl(c.cpc)}</td><td class="d num">${c.conversoes.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td><td class="d num">${x(c.roas)}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="vazio"><span>Nenhuma campanha com impressões neste período.</span></div>'}</div>
  <p class="msg-nota">O "valor de conversão" é o que o Google Ads registra (se a conversão estiver configurada com valor). Pedidos do PDV não chegam ao Google Ads sozinhos.</p>`;
  ligarPeriodo(d.periodo);
}

/* ---------- META: anúncios e Instagram ---------- */
const STATUS_META = { ACTIVE: ['Ativa', 'on'], PAUSED: ['Pausada', 'off'], CAMPAIGN_PAUSED: ['Pausada', 'off'], ARCHIVED: ['Arquivada', 'off'], DELETED: ['Apagada', 'off'], IN_PROCESS: ['Em análise', 'off'], WITH_ISSUES: ['Com problema', 'off'] };
async function pgMetaAds() {
  const cab = p => `<div class="page-head"><div><h1>Meta Ads</h1><p class="sub">Facebook e Instagram: quanto as campanhas custaram e quanto trouxeram${p ? `, de ${dataBr(p.from + 'T12:00')} a ${dataBr(p.to + 'T12:00')}` : ''}.</p></div>${p ? periodoHtml(p) : ''}</div>`;
  $('#app').innerHTML = cab() + '<div class="painel pad"><p class="nota">Buscando os números da Meta…</p></div>';
  let d; try { d = await api('meta-ads?' + periodoQuery()); }
  catch (e) { $('#app').innerHTML = cab() + `<div class="aviso"><b>A Meta não respondeu.</b> ${esc(e.message)}</div><p class="msg-nota">Os anúncios usam o mesmo token do WhatsApp (Conexões). O usuário do sistema precisa ter a conta de anúncios atribuída no Gerenciador de Negócios.</p>`; return; }
  const t = d.total, x = v => v == null ? '–' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}x`, n1 = v => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  $('#app').innerHTML = cab(d.periodo) + `
  <p class="nota" style="margin:-6px 0 12px">Conta de anúncios: <b>${esc(d.conta.nome || d.conta.id)}</b></p>
  <section class="numeros-grandes">
    <div class="painel pad"><small>Investimento</small><b class="num">${brl(t.gasto)}</b><span class="nota">${inteiro(t.cliques)} cliques · CPC ${brl(t.cpc)} · CTR ${pct(t.ctr)}</span></div>
    <div class="painel pad"><small>Compras atribuídas</small><b class="num">${n1(t.compras)}</b><span class="nota">${t.custoCompra != null ? `${brl(t.custoCompra)} por compra` : 'nenhuma compra no período'}</span></div>
    <div class="painel pad"><small>ROAS (vendas atribuídas ÷ investimento)</small><b class="num">${x(t.roas)}</b><span class="nota">${brl(t.valor)} em vendas atribuídas pela Meta</span></div>
    <div class="painel pad"><small>Conversas no WhatsApp</small><b class="num">${n1(t.conversas)}</b><span class="nota">${inteiro(t.checkout)} começaram a finalizar a compra no site</span></div>
  </section>
  <section class="painel pad" style="margin-bottom:16px;display:grid;gap:6px">
    <h3 class="mini-titulo">Para comparar com a loja</h3>
    <p>No mesmo período, a loja vendeu <b>${brl(d.loja.receita)}</b> no total, dos quais <b>${brl(d.loja.receitaSite)}</b> em ${inteiro(d.loja.pedidosSite)} pedidos pelo cardápio digital, onde o pixel da Meta mede as compras. O investimento em anúncios foi <b>${d.loja.receita ? pct(t.gasto / d.loja.receita) : '–'}</b> do faturamento.</p>
    <p class="nota">A Meta atribui uma compra ao anúncio quando a pessoa clicou ou viu o anúncio antes de comprar. O número dela não é o mesmo do PDV: são duas réguas.</p>
  </section>
  <div class="painel">${d.campanhas.length ? `<div class="rolagem"><table class="tabela"><thead><tr><th>Campanha</th><th>Objetivo</th><th>Situação</th><th class="d">Investimento</th><th class="d">Cliques</th><th class="d">CTR</th><th class="d">Compras</th><th class="d">Vendas atribuídas</th><th class="d">ROAS</th><th class="d">Conversas</th></tr></thead><tbody>
    ${d.campanhas.map(c => { const s = STATUS_META[c.status] || [c.status || '—', 'off']; return `<tr style="cursor:default"><td><b>${esc(c.nome)}</b></td><td>${esc(c.objetivo)}</td><td><span class="status ${s[1]}">${esc(s[0])}</span></td>
      <td class="d num"><b>${brl(c.gasto)}</b></td><td class="d num">${inteiro(c.cliques)}</td><td class="d num">${pct(c.ctr)}</td><td class="d num">${n1(c.compras)}</td><td class="d num">${brl(c.valor)}</td><td class="d num">${x(c.roas)}</td><td class="d num">${n1(c.conversas)}</td></tr>`; }).join('')}</tbody></table></div>`
    : '<div class="vazio"><span>Nenhuma campanha com entrega neste período.</span></div>'}</div>`;
  ligarPeriodo(d.periodo);
}

async function pgInstagram() {
  const cab = `<div class="page-head"><div><h1>Instagram</h1><p class="sub">Seguidores e desempenho dos posts da ${esc(BRAND.loja.nome)}.</p></div></div>`;
  $('#app').innerHTML = cab + '<div class="painel pad"><p class="nota">Buscando o Instagram…</p></div>';
  let d; try { d = await api('instagram'); }
  catch (e) {
    $('#app').innerHTML = cab + `<div class="aviso"><b>Ainda não dá para ler o Instagram.</b> ${esc(e.message)}</div>
    <details class="guia painel pad" open style="margin-top:14px"><summary>Como liberar (2 minutos, no Gerenciador de Negócios)</summary><ol>
      <li>Abra <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener">business.facebook.com &gt; Usuários do sistema</a> e escolha o usuário que gerou o token do WhatsApp.</li>
      <li>Clique em <b>Atribuir ativos</b>, escolha <b>Páginas</b> e marque a Página da ${esc(BRAND.loja.nome)} (acesso para ver o conteúdo e os insights).</li>
      <li>Repita em <b>Contas do Instagram</b> e marque o Instagram da ${esc(BRAND.loja.nome)}.</li>
      <li>Volte aqui e recarregue a página. Não precisa gerar outro token.</li></ol></details>`;
    return;
  }
  const p = d.perfil, r = d.resumo;
  $('#app').innerHTML = cab + `
  ${d.contas.length > 1 ? `<label class="nota" style="display:block;margin-bottom:10px">Conta: <select class="campo" id="ig-conta" style="width:auto">${d.contas.map(c => `<option value="${esc(c.id)}" ${c.id === d.conta.id ? 'selected' : ''}>@${esc(c.usuario)}</option>`).join('')}</select></label>` : ''}
  <section class="numeros-grandes">
    <div class="painel pad"><small>Seguidores</small><b class="num">${inteiro(p.seguidores)}</b><span class="nota">@${esc(p.usuario)} · ${inteiro(p.posts)} posts</span></div>
    <div class="painel pad"><small>Interações por post</small><b class="num">${r.mediaInteracoes.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</b><span class="nota">curtidas + comentários, média dos últimos ${inteiro(d.posts.length)}</span></div>
    <div class="painel pad"><small>Engajamento</small><b class="num">${pct(r.engajamento)}</b><span class="nota">interações por post ÷ seguidores</span></div>
    <div class="painel pad"><small>Posts nos últimos 30 dias</small><b class="num">${inteiro(r.postsUltimos30)}</b><span class="nota">${r.postsUltimos30 < 8 ? 'menos de 2 por semana' : 'ritmo bom'}</span></div>
  </section>
  ${d.melhores.length ? `<h2 class="sec">Posts que mais engajaram</h2><section class="ig-grade">${d.melhores.map(m => `<a class="painel ig-post" href="${esc(m.link)}" target="_blank" rel="noopener">${m.imagem ? `<img src="${esc(m.imagem)}" alt="" loading="lazy">` : ''}<div><b class="num">${inteiro(m.curtidas)} curtidas · ${inteiro(m.comentarios)} comentários</b><span class="nota">${dataBr(m.data)} · ${esc(m.legenda || 'sem legenda')}</span></div></a>`).join('')}</section>` : ''}
  <h2 class="sec">Últimos posts</h2>
  <div class="painel"><div class="rolagem"><table class="tabela"><thead><tr><th>Post</th><th>Tipo</th><th>Data</th><th class="d">Curtidas</th><th class="d">Comentários</th><th class="d">Engajamento</th></tr></thead><tbody>
    ${d.posts.map(m => `<tr style="cursor:default"><td style="max-width:360px"><a href="${esc(m.link)}" target="_blank" rel="noopener">${esc(m.legenda || 'sem legenda')}</a></td><td>${{ IMAGE: 'Foto', VIDEO: 'Vídeo', CAROUSEL_ALBUM: 'Carrossel' }[m.tipo] || esc(m.tipo || '')}</td><td>${dataBr(m.data)}</td><td class="d num">${inteiro(m.curtidas)}</td><td class="d num">${inteiro(m.comentarios)}</td><td class="d num">${pct(m.engajamento)}</td></tr>`).join('')}</tbody></table></div></div>`;
  const sel = $('#ig-conta'); if (sel) sel.onchange = async () => { await api('instagram/conta', { id: sel.value }); pgInstagram(); };
}

/* ---------- QR CODES ---------- */
// desenho do QR em SVG (biblioteca qrcode-generator, MIT, em /vendor/qrcode.js)
function qrSvg(texto, tam = 4) {
  try { const q = qrcode(0, 'M'); q.addData(texto); q.make(); return q.createSvgTag({ cellSize: tam, margin: 2, scalable: true }); }
  catch { return '<span class="nota">Não consegui desenhar o QR.</span>'; }
}
function baixarQr(texto, nome) {
  const svg = qrSvg(texto, 10).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  a.download = `qr-${nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || BRAND.produto.slug}.svg`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
let qrPeriodo = '30';
async function pgQr() {
  const d = await api('qr');
  if (!d.configurado) {
    $('#app').innerHTML = `<div class="page-head"><div><h1>QR codes</h1></div></div>
    <div class="painel vazio"><b>Os QR codes usam a cópia no Supabase</b><span>Ligue a cópia no Supabase em <a href="#/conexoes">Conexões</a> para criar QR codes que contam os scans.</span></div>`;
    return;
  }
  const k = { '7': 'scans_7d', '30': 'scans_30d', '90': 'scans_90d', tudo: 'scans' }[qrPeriodo];
  const ativos = d.codigos.filter(c => c.active && !c.expirado);
  const mais = [...d.codigos].sort((a, b) => b[k] - a[k])[0];
  const status = c => !c.active ? '<span class="status off">Desativado</span>' : c.expirado ? '<span class="status off">Expirado</span>' : '<span class="status on">Ativo</span>';
  const clube = d.clube || '';
  $('#app').innerHTML = `
  <div class="page-head"><div><h1>QR codes</h1><p class="sub">Para cardápio impresso, embalagem, panfleto e balcão. Cada QR conta quantas vezes foi escaneado e quantas pessoas diferentes escanearam.</p></div>
    <div class="seg" role="group" aria-label="Período">${[['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['tudo', 'Desde o início']].map(([v, n]) => `<button data-qp="${v}" aria-pressed="${qrPeriodo === v}">${n}</button>`).join('')}</div></div>
  <section class="numeros-grandes">
    <div class="painel pad"><small>QR codes ativos</small><b class="num">${inteiro(ativos.length)}</b><span class="nota">${inteiro(d.codigos.length - ativos.length)} desativados ou expirados</span></div>
    <div class="painel pad"><small>Scans no período</small><b class="num">${inteiro(d.codigos.reduce((a, c) => a + c[k], 0))}</b><span class="nota">${inteiro(d.codigos.reduce((a, c) => a + c.scans, 0))} desde o início</span></div>
    <div class="painel pad"><small>Pessoas diferentes</small><b class="num">${inteiro(d.codigos.reduce((a, c) => a + c.pessoas, 0))}</b><span class="nota">desde o início, somando os QR codes</span></div>
    <div class="painel pad"><small>Mais escaneado no período</small><b>${mais && mais[k] ? esc(mais.name) : '—'}</b><span class="nota">${mais && mais[k] ? inteiro(mais[k]) + ' scans' : 'sem scans ainda'}</span></div>
  </section>
  <section class="painel pad ed-bloco" style="display:grid;gap:12px">
    <h3 style="font:700 19px var(--f-display)">Criar QR code</h3>
    <div class="form-grid">
      <label class="f">Nome (só você vê)<input class="campo" id="qr-nome" maxlength="80" placeholder="Ex.: Panfleto de novembro"></label>
      <label class="f">Material<input class="campo" id="qr-material" maxlength="60" placeholder="Ex.: embalagem, panfleto, balcão"></label>
      <label class="f">Validade (opcional)<input class="campo" id="qr-validade" type="date"></label>
    </div>
    <label class="f">Para onde o QR leva<input class="campo" id="qr-destino" type="url" placeholder="https://"></label>
    <div class="chips">${[...(BRAND.loja.site ? [['Site da ' + BRAND.loja.nome, BRAND.loja.site]] : []), ...(clube ? [['Página do clube de fidelidade', clube]] : [])].map(([n, u]) => `<button type="button" class="chip" data-dest="${esc(u)}">${esc(n)}</button>`).join('')}</div>
    <div><button class="btn primario" id="qr-criar">${icon('mais')}Criar QR code</button></div>
  </section>
  <div class="painel">${d.codigos.length ? `<div class="rolagem"><table class="tabela"><thead><tr><th>QR code</th><th>Leva para</th><th>Material</th><th class="d">Scans</th><th class="d">Pessoas</th><th>Último scan</th><th>Status</th><th></th></tr></thead><tbody>
    ${d.codigos.map(c => `<tr style="cursor:default">
      <td><div style="display:flex;gap:10px;align-items:center"><span class="qr-mini">${qrSvg(c.link, 2)}</span><div><b>${esc(c.name)}</b><small class="nota" style="display:block;word-break:break-all">${esc(c.link)}</small></div></div></td>
      <td style="max-width:220px;word-break:break-all"><a href="${esc(c.destino)}" target="_blank" rel="noopener">${esc(c.destino)}</a></td>
      <td>${esc(c.material || '—')}</td><td class="d num"><b>${inteiro(c[k])}</b></td><td class="d num">${inteiro(c.pessoas)}</td>
      <td>${c.ultimo_scan ? dataHora(c.ultimo_scan) : '—'}</td><td>${status(c)}${c.expires_at ? `<small class="nota" style="display:block">até ${dataBr(c.expires_at)}</small>` : ''}</td>
      <td><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn pequeno" data-baixar="${esc(c.code)}">Baixar</button><button class="btn pequeno" data-ativo="${esc(c.code)}" data-v="${c.active ? 0 : 1}">${c.active ? 'Desativar' : 'Ativar'}</button><button class="btn pequeno" data-apagar-qr="${esc(c.code)}">Apagar</button></div></td></tr>`).join('')}</tbody></table></div>`
    : '<div class="vazio"><b>Nenhum QR code ainda</b><span>Crie o primeiro acima e baixe para imprimir.</span></div>'}</div>
  <p class="msg-nota">Nenhum dado pessoal é guardado no scan: só um código embaralhado do visitante, para contar pessoas diferentes.</p>`;
  document.querySelectorAll('[data-qp]').forEach(b => b.onclick = () => { qrPeriodo = b.dataset.qp; pgQr(); });
  document.querySelectorAll('[data-dest]').forEach(b => b.onclick = () => { $('#qr-destino').value = b.dataset.dest; });
  $('#qr-criar').onclick = async () => {
    try { await api('qr', { name: $('#qr-nome').value, destino: $('#qr-destino').value, material: $('#qr-material').value, validade: $('#qr-validade').value }); toast('QR code criado. Baixe e teste com a câmera do celular.'); pgQr(); }
    catch (e) { toast(e.message, true); }
  };
  document.querySelectorAll('[data-baixar]').forEach(b => b.onclick = () => { const c = d.codigos.find(x => x.code === b.dataset.baixar); baixarQr(c.link, c.name); });
  document.querySelectorAll('[data-ativo]').forEach(b => b.onclick = async () => { try { await api('qr/status', { code: b.dataset.ativo, active: b.dataset.v === '1' }); toast(b.dataset.v === '1' ? 'QR code ativado.' : 'QR code desativado: quem escanear vê um aviso.'); pgQr(); } catch (e) { toast(e.message, true); } });
  document.querySelectorAll('[data-apagar-qr]').forEach(b => b.onclick = async () => {
    if (!confirm('Apagar este QR code? Os scans dele também somem, e quem escanear o impresso vai ver "não encontrado".')) return;
    try { await api('qr/apagar', { code: b.dataset.apagarQr }); toast('QR code apagado.'); pgQr(); } catch (e) { toast(e.message, true); }
  });
}

/* ---------- PROGRAMA DE FIDELIDADE ---------- */
async function pgFidelidade() {
  const d = await api('fidelidade'), c = d.config;
  const recLinha = (r, i) => `<div class="fid-rec" data-rec="${i}"><input class="campo num" type="number" min="1" value="${esc(r.pontos)}" aria-label="Pontos"><span class="nota">pontos</span><input class="campo" maxlength="80" value="${esc(r.premio)}" placeholder="Ex.: R$ 10 em produtos" aria-label="Recompensa"><button class="btn pequeno" data-tira="${i}" aria-label="Remover recompensa">×</button></div>`;
  const tabela = (lista, vazio) => lista.length ? `<div class="rolagem"><table class="tabela"><thead><tr><th>Cliente</th><th class="d">Pontos</th><th>Próxima recompensa</th><th class="d">Faltam</th><th class="d">Vencem em 30 dias</th></tr></thead><tbody>
    ${lista.map(s => `<tr style="cursor:default"><td><b>${esc(nomeBonito(s.nome))}</b></td><td class="d num"><b>${inteiro(s.pontos)}</b></td><td>${esc(s.proximo || (s.disponivel ? 'Pode trocar: ' + s.disponivel : '—'))}</td><td class="d num">${s.proximo ? inteiro(s.faltam) : '—'}</td><td class="d num">${s.expirando ? inteiro(s.expirando) : '—'}</td></tr>`).join('')}</tbody></table></div>` : `<div class="vazio"><span>${vazio}</span></div>`;
  $('#app').innerHTML = `
  <div class="page-head"><div><h1>Programa de fidelidade</h1><p class="sub">Pontos por real gasto, calculados dos pedidos do PDV com o celular do cliente. O cliente consulta os pontos numa página pública.</p></div>
    <span class="status ${c.ativo ? 'on' : 'off'}">${c.ativo ? 'Clube aberto' : 'Clube fechado'}</span></div>
  ${d.erro ? `<div class="aviso" style="margin-bottom:16px"><b>A última publicação falhou.</b> ${esc(d.erro)}</div>` : ''}
  <section class="numeros-grandes">
    <div class="painel pad"><small>Clientes com pontos</small><b class="num">${inteiro(d.clientes)}</b><span class="nota">${inteiro(d.podemResgatar)} já podem trocar</span></div>
    <div class="painel pad"><small>Pontos em aberto</small><b class="num">${inteiro(d.pontos)}</b><span class="nota">${c.pontosPorReal} ponto(s) por R$ 1 · valem ${c.validadeDias} dias</span></div>
    <div class="painel pad"><small>Resgates</small><b class="num">${inteiro(d.resgates)}</b><span class="nota">${inteiro(d.pontosResgatados)} pontos trocados</span></div>
    <div class="painel pad"><small>E-mails pelo clube</small><b class="num">${inteiro(d.emailsDoClube)}</b><span class="nota">clientes que aceitaram receber e-mails</span></div>
  </section>
  <section class="painel pad ed-bloco" style="display:grid;gap:12px">
    <h3 style="font:700 19px var(--f-display)">Página do clube para o cliente</h3>
    ${c.ativo ? `<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><span class="qr-medio">${qrSvg(d.link, 3)}</span>
      <div style="display:grid;gap:8px;min-width:0"><a href="${esc(d.link)}" target="_blank" rel="noopener" style="word-break:break-all">${esc(d.link)}</a>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pequeno" id="fid-baixar">Baixar QR do clube</button><button class="btn pequeno" id="fid-publicar">${icon('atualizar')}Atualizar pontos agora</button></div>
      <span class="nota">${d.publicado ? `Pontos publicados em ${dataHora(d.publicado.em)}: ${inteiro(d.publicado.cartoes)} clientes.` : 'Pontos ainda não publicados.'} Atualiza sozinho a cada cópia no Supabase.</span></div></div>`
      : '<p class="nota">O clube está fechado: a página mostra "ainda não está aberto". Configure abaixo e abra o clube.</p>'}
  </section>
  <section class="painel pad ed-bloco" style="display:grid;gap:12px">
    <h3 style="font:700 19px var(--f-display)">Regras</h3>
    <div class="form-grid">
      <label class="f">Nome do programa<input class="campo" id="fid-nome" maxlength="60" value="${esc(c.nome)}"></label>
      <label class="f">Pontos por R$ 1<input class="campo" id="fid-ppr" type="number" min="0.1" step="0.1" value="${esc(c.pontosPorReal)}"></label>
      <label class="f">Validade dos pontos<input class="campo" id="fid-val" type="number" min="30" step="1" value="${esc(c.validadeDias)}"><small>dias</small></label>
      <label class="f">Contar pedidos desde<input class="campo" id="fid-desde" type="date" value="${esc(c.desde || '')}"><small>vazio = desde quando o clube abrir</small></label>
    </div>
    <label class="f">Texto para o cliente<textarea class="campo" id="fid-regras" rows="3" maxlength="400">${esc(c.regras)}</textarea></label>
    <div><b>Recompensas</b><div id="fid-recs" style="display:grid;gap:8px;margin-top:8px">${c.recompensas.map(recLinha).join('')}</div>
      <button class="btn pequeno" id="fid-addrec" style="margin-top:8px">+ Recompensa</button></div>
    <label class="check-linha"><input type="checkbox" id="fid-ativo" ${c.ativo ? 'checked' : ''}> Clube aberto (a página pública mostra os pontos)</label>
    <div><button class="btn primario" id="fid-salvar">Salvar e publicar</button></div>
    <p class="nota">Os pontos só valem para pedidos com o celular do cliente identificado no PDV. Clientes fora das listas (Ajustes) não entram.</p>
  </section>
  <section class="painel pad ed-bloco" style="display:grid;gap:12px">
    <h3 style="font:700 19px var(--f-display)">Registrar um resgate</h3>
    <p class="nota">Quando entregar o prêmio, procure o cliente, escolha a recompensa e confirme. Os pontos são descontados na hora.</p>
    <div class="fx-linha"><input class="campo" id="fid-busca" placeholder="Nome ou parte do celular" aria-label="Buscar cliente"><button class="btn" id="fid-buscar">Buscar</button></div>
    <div id="fid-achados"></div>
  </section>
  <div class="duas">
    <section class="painel pad"><h3 class="mini-titulo">Perto de uma recompensa</h3>${tabela(d.perto, 'Ninguém perto de uma recompensa agora.')}</section>
    <section class="painel pad"><h3 class="mini-titulo">Mais pontos</h3>${tabela(d.topo, c.ativo ? 'Nenhum cliente com pontos ainda.' : 'Abra o clube para começar a contar pontos.')}</section>
  </div>
  <h2 class="sec">Últimos resgates</h2>
  <div class="painel">${d.ultimosResgates.length ? `<div class="lista-ped" style="padding:0 16px">${d.ultimosResgates.map(r => `<div><span>${dataHora(r.created_at + 'Z')} · <b>${esc(nomeBonito(r.name))}</b> · ${esc(r.premio)} (${inteiro(r.pontos)} pontos)</span><button class="btn pequeno" data-desfaz="${r.id}">Desfazer</button></div>`).join('')}</div>` : '<div class="vazio"><span>Nenhum resgate ainda.</span></div>'}</div>`;

  const lerRecs = () => [...document.querySelectorAll('.fid-rec')].map(l => ({ pontos: Number(l.querySelector('input[type=number]').value), premio: l.querySelector('input:not([type])').value }));
  const redesenharRecs = recs => { $('#fid-recs').innerHTML = recs.map(recLinha).join(''); ligarTira(); };
  const ligarTira = () => document.querySelectorAll('[data-tira]').forEach(b => b.onclick = () => { const r = lerRecs(); r.splice(+b.dataset.tira, 1); redesenharRecs(r); });
  ligarTira();
  $('#fid-addrec').onclick = () => redesenharRecs([...lerRecs(), { pontos: '', premio: '' }]);
  $('#fid-salvar').onclick = async () => {
    try {
      await api('fidelidade', { nome: $('#fid-nome').value, pontosPorReal: $('#fid-ppr').value, validadeDias: Number($('#fid-val').value), desde: $('#fid-desde').value,
        regras: $('#fid-regras').value, recompensas: lerRecs(), ativo: $('#fid-ativo').checked });
      toast($('#fid-ativo').checked ? 'Regras salvas e pontos publicados na página do clube.' : 'Regras salvas. O clube continua fechado.'); pgFidelidade();
    } catch (e) { toast(e.message, true); }
  };
  if ($('#fid-baixar')) $('#fid-baixar').onclick = () => baixarQr(d.link, 'clube');
  if ($('#fid-publicar')) $('#fid-publicar').onclick = async () => { try { await api('fidelidade/publicar', {}); toast('Pontos atualizados na página do clube.'); pgFidelidade(); } catch (e) { toast(e.message, true); } };
  const buscar = async () => {
    const achados = await api('fidelidade/buscar?q=' + encodeURIComponent($('#fid-busca').value));
    $('#fid-achados').innerHTML = achados.length ? `<div class="lista-ped">${achados.map(s => `<div><span><b>${esc(nomeBonito(s.nome))}</b> · ${inteiro(s.pontos)} pontos</span>
      <span style="display:flex;gap:6px;flex-wrap:wrap">${c.recompensas.map(r => `<button class="btn pequeno" ${s.pontos >= r.pontos ? '' : 'disabled'} data-resgata="${s.id}" data-pontos="${r.pontos}" data-premio="${esc(r.premio)}">${esc(r.premio)} (${inteiro(r.pontos)})</button>`).join('')}</span></div>`).join('')}</div>`
      : '<p class="nota">Nenhum cliente com pontos encontrado.</p>';
    document.querySelectorAll('[data-resgata]').forEach(b => b.onclick = async () => {
      if (!confirm(`Registrar o resgate "${b.dataset.premio}" e descontar ${b.dataset.pontos} pontos?`)) return;
      try { const r = await api('fidelidade/resgatar', { id: +b.dataset.resgata, pontos: +b.dataset.pontos, premio: b.dataset.premio }); toast(`Resgate registrado. Restam ${inteiro(r.restam)} pontos.`); pgFidelidade(); }
      catch (e) { toast(e.message, true); }
    });
  };
  $('#fid-buscar').onclick = buscar;
  $('#fid-busca').onkeydown = e => { if (e.key === 'Enter') buscar(); };
  document.querySelectorAll('[data-desfaz]').forEach(b => b.onclick = async () => {
    if (!confirm('Desfazer este resgate? Os pontos voltam para o cliente.')) return;
    try { await api('fidelidade/desfazer', { id: +b.dataset.desfaz }); toast('Resgate desfeito.'); pgFidelidade(); } catch (e) { toast(e.message, true); }
  });
}

/* ---------- CAMPANHAS SUGERIDAS ---------- */
let sugFiltro = { objetivo: 'Todas', canal: 'todos' };
async function pgSugeridas() {
  const lista = await api('sugestoes');
  const objetivos = ['Todas', ...new Set(lista.map(s => s.objetivo))];
  const prev = t => esc(t).replace(/\[nome_cliente\]/g, '<b>Maria</b>').replace(/\[produto_favorito\]/g, '<b>Cento Promocional 1</b>').replace(/\n/g, '<br>');
  const faixa = s => `Sem pedir há ${s.min_days}${s.max_days != null ? ` a ${s.max_days}` : ' ou mais'} dias${s.min_orders > 1 ? `, com ${s.min_orders}+ pedidos` : ''}`;
  const desenhar = () => {
    const vis = lista.filter(s => (sugFiltro.objetivo === 'Todas' || s.objetivo === sugFiltro.objetivo) && (sugFiltro.canal === 'todos' || s.canal === sugFiltro.canal));
    $('#sug-lista').innerHTML = vis.length ? vis.map(s => `
      <article class="painel pad sug">
        <div class="sug-topo"><span class="pill">${esc(s.objetivo)}</span><span class="nota">${CANAL[s.canal]}</span></div>
        <h3>${esc(s.nome)}</h3>
        <p class="nota">${faixa(s)}</p>
        ${s.header ? `<p class="sug-assunto"><small>Assunto</small> ${prev(s.header)}</p>` : ''}
        <div class="sug-msg">${prev(s.body)}</div>
        <div class="sug-pe"><span><b class="num">${inteiro(s.alcance)}</b> clientes hoje</span><button class="btn primario" data-usar="${esc(s.id)}">Usar esta</button></div>
      </article>`).join('') : '<div class="painel vazio"><b>Nenhuma sugestão com esses filtros</b></div>';
    document.querySelectorAll('[data-usar]').forEach(b => b.onclick = async () => {
      try { const r = await api('sugestoes/usar', { id: b.dataset.usar }); toast('Rascunho criado. Revise e publique quando quiser.'); location.hash = '#/campanha?id=' + r.id; }
      catch (e) { toast(e.message, true); }
    });
  };
  $('#app').innerHTML = `
  <div class="page-head"><div><h1>Campanhas sugeridas</h1><p class="sub">Mensagens prontas por objetivo. "Usar esta" cria um rascunho com o texto e a faixa de clientes; nada é enviado.</p></div></div>
  <div class="chips" id="sug-obj" style="margin-bottom:10px">${objetivos.map(o => `<button class="chip" data-obj="${esc(o)}" aria-pressed="${sugFiltro.objetivo === o}">${esc(o)}</button>`).join('')}</div>
  <div class="chips" id="sug-canal" style="margin-bottom:16px">${[['todos', 'Todos os canais'], ['whatsapp', 'WhatsApp'], ['sms', 'SMS'], ['email', 'E-mail']].map(([k, n]) => `<button class="chip" data-can="${k}" aria-pressed="${sugFiltro.canal === k}">${n}</button>`).join('')}</div>
  <section class="sug-grade" id="sug-lista"></section>`;
  document.querySelectorAll('[data-obj]').forEach(b => b.onclick = () => { sugFiltro.objetivo = b.dataset.obj; pgSugeridas(); });
  document.querySelectorAll('[data-can]').forEach(b => b.onclick = () => { sugFiltro.canal = b.dataset.can; pgSugeridas(); });
  desenhar();
}

/* ---------- PROMOCOES (iFood e outros canais) ---------- */
let promoCanal = 'iFood';
async function pgPromocoes() {
  const d = await api('promocoes?' + periodoQuery() + '&canal=' + encodeURIComponent(promoCanal)), r = d.resumo;
  const nomeFoco = d.foco === 'todos' ? 'de todos os canais' : 'do ' + d.foco, parceiro = /ifood|99|food/i.test(d.foco) ? d.foco : 'o parceiro';
  const linhaBarra = (rot, v, total, txt) => `<div class="pr-barra"><div class="pr-rot"><span>${rot}</span><b class="num">${txt}</b></div><div class="barra-pct"><i style="width:${total ? Math.round(v / total * 100) : 0}%"></i></div></div>`;
  $('#app').innerHTML = `
  <div class="page-head"><div><h1>Promoções</h1><p class="sub">Quanto das vendas ${nomeFoco} sai com desconto, de ${dataBr(d.periodo.from + 'T12:00')} a ${dataBr(d.periodo.to + 'T12:00')}.</p></div>${periodoHtml(d.periodo)}</div>
  <div class="chips" style="margin-bottom:16px">${[...d.canais, 'todos'].map(c => `<button class="chip" data-pcanal="${esc(c)}" aria-pressed="${d.foco === c}">${c === 'todos' ? 'Todos os canais' : esc(c)}</button>`).join('')}</div>
  ${r.pedidos ? `
  <section class="painel pad pr-manchete"><p><b>${pct(r.pctComPromocao)}</b> dos pedidos ${nomeFoco} saíram com desconto. O desconto somou <b>${brl(r.desconto)}</b>, ${pct(r.pctDoBruto)} do valor bruto dos pedidos.</p>
    <p class="nota">O pedido informa o desconto total, mas nem sempre quem pagou (a loja ou o ${esc(parceiro)}). Para saber a parte da loja, confira o repasse no portal do parceiro.</p></section>
  <section class="numeros-grandes">
    <div class="painel pad"><small>Pedidos com promoção</small><b class="num">${pct(r.pctComPromocao)}</b><span class="nota">${inteiro(r.comPromocao)} de ${inteiro(r.pedidos)} · ${inteiro(r.semPromocao)} a preço cheio</span></div>
    <div class="painel pad"><small>Receita ${d.foco === 'todos' ? '' : esc(d.foco)}</small><b class="num">${brl(r.receita)}</b><span class="nota">${brlCurto(r.receitaComPromocao)} vieram de pedidos com desconto</span></div>
    <div class="painel pad"><small>Desconto concedido</small><b class="num">${brl(r.desconto)}</b><span class="nota">${pct(r.pctDoBruto)} do valor bruto</span></div>
    <div class="painel pad"><small>Ticket médio</small><b class="num">${brl(r.ticketCom)}</b><span class="nota">com desconto · ${brl(r.ticketSem)} sem desconto</span></div>
  </section>
  <div class="duas">
    <section class="painel pad"><h3 class="mini-titulo">Dependência de promoção</h3>
      ${linhaBarra('Pedidos com promoção', r.comPromocao, r.pedidos, `${inteiro(r.comPromocao)} · ${pct(r.pctComPromocao)}`)}
      ${linhaBarra('Pedidos a preço cheio', r.semPromocao, r.pedidos, `${inteiro(r.semPromocao)} · ${pct(1 - r.pctComPromocao)}`)}
      ${linhaBarra('Receita com promoção', r.receitaComPromocao, r.receita, brlCurto(r.receitaComPromocao))}
      ${linhaBarra('Receita a preço cheio', r.receitaSemPromocao, r.receita, brlCurto(r.receitaSemPromocao))}</section>
    <section class="painel pad"><h3 class="mini-titulo">Promoção por faixa de pedido do cliente</h3>
      ${d.faixas.map(f => linhaBarra(f.rotulo, f.comPromocao, f.pedidos, f.pedidos ? `${pct(f.pct)} · ${f.comPromocao}/${f.pedidos}` : 'sem pedidos')).join('')}
      <p class="nota">Só clientes identificados. Conta todo o histórico de pedidos do cliente na ${esc(BRAND.loja.nome)}.</p></section>
  </div>
  <div class="duas">
    <section class="painel pad"><h3 class="mini-titulo">Onde está o desconto</h3>
      ${linhaBarra('Com cupom informado', r.descontoComCupom, r.desconto, `${brlCurto(r.descontoComCupom)} · ${inteiro(r.comCupom)} pedidos`)}
      ${linhaBarra('Sem cupom informado (desconto em item ou do parceiro)', r.descontoSemCupom, r.desconto, `${brlCurto(r.descontoSemCupom)} · ${inteiro(r.semCupom)} pedidos`)}</section>
    <section class="painel pad"><h3 class="mini-titulo">Pedidos com desconto por dia</h3>${miniBarras(d.diario, 'com', v => `${v} com desconto`)}</section>
  </div>
  ${d.alertas.length ? `<h2 class="sec">O que olhar</h2><div class="pr-alertas">${d.alertas.map(a => `<div class="aviso neutro">${esc(a)}</div>`).join('')}</div>` : ''}
  <h2 class="sec">Por canal</h2>
  <div class="painel"><div class="rolagem"><table class="tabela"><thead><tr><th>Canal</th><th class="d">Pedidos</th><th class="d">Com desconto</th><th class="d">Desconto</th><th class="d">% do bruto</th><th class="d">Receita</th></tr></thead><tbody>
    ${d.porCanal.map(c => `<tr style="cursor:default"><td><b>${esc(c.canal)}</b></td><td class="d num">${inteiro(c.pedidos)}</td><td class="d num">${pct(c.pctComPromocao)}</td><td class="d num">${brl(c.desconto)}</td><td class="d num">${pct(c.pctDoBruto)}</td><td class="d num"><b>${brl(c.receita)}</b></td></tr>`).join('')}</tbody></table></div></div>
  ${d.cupons.length ? `<h2 class="sec">Descontos por cupom</h2>
  <div class="painel"><div class="rolagem"><table class="tabela"><thead><tr><th>Cupom ou motivo</th><th class="d">Pedidos</th><th class="d">Desconto</th><th class="d">Receita</th></tr></thead><tbody>
    ${d.cupons.map(c => `<tr style="cursor:default"><td>${esc(c.cupom)}</td><td class="d num">${inteiro(c.pedidos)}</td><td class="d num">${brl(c.desconto)}</td><td class="d num">${brl(c.receita)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
  ` : `<div class="painel vazio"><b>Sem vendas com detalhes neste período</b><span>${d.semDetalhe ? `${inteiro(d.semDetalhe)} vendas ainda não têm canal e desconto. Sincronize o PDV em Conexões para completar o histórico.` : 'Escolha outro período.'}</span></div>`}
  ${r.pedidos && d.semDetalhe ? `<p class="msg-nota">${inteiro(d.semDetalhe)} vendas do período ainda não têm detalhes completos e ficaram de fora.</p>` : ''}`;
  ligarPeriodo(d.periodo);
  document.querySelectorAll('[data-pcanal]').forEach(b => b.onclick = () => { promoCanal = b.dataset.pcanal; pgPromocoes(); });
}

/* ---------- MELHORES BAIRROS ---------- */
async function pgBairros() {
  const d = await api('bairros?' + periodoQuery());
  const max = Math.max(1, ...d.bairros.map(b => b.receita));
  $('#app').innerHTML = `
  <div class="page-head"><div><h1>Melhores bairros</h1><p class="sub">De onde vêm os pedidos com entrega, de ${dataBr(d.periodo.from + 'T12:00')} a ${dataBr(d.periodo.to + 'T12:00')}.</p></div>${periodoHtml(d.periodo)}</div>
  <div class="painel">${d.bairros.length ? `<div class="rolagem"><table class="tabela"><thead><tr><th>Bairro</th><th class="d">Clientes</th><th class="d">Pedidos</th><th class="d">Ticket médio</th><th class="d">Taxa de entrega média</th><th class="d">Pelo iFood</th><th>Receita</th></tr></thead><tbody>
    ${d.bairros.map(b => `<tr style="cursor:default"><td><b>${esc(b.bairro)}</b></td><td class="d num">${inteiro(b.clientes)}</td><td class="d num">${inteiro(b.pedidos)}</td><td class="d num">${brl(b.ticket)}</td><td class="d num">${brl(b.taxaMedia)}</td><td class="d num">${pct(b.pedidos ? b.ifood / b.pedidos : 0)}</td><td><div class="pr-rot"><b class="num">${brl(b.receita)}</b></div><div class="barra-pct"><i style="width:${Math.round(b.receita / max * 100)}%"></i></div></td></tr>`).join('')}</tbody></table></div>`
    : `<div class="vazio"><b>Nenhum pedido com bairro neste período</b><span>O bairro vem dos pedidos com entrega do PDV. Sincronize em Conexões para completar o histórico.</span></div>`}</div>
  ${d.semBairro ? `<p class="msg-nota">${inteiro(d.semBairro)} pedidos do período sem bairro (retirada, salão ou vendas antigas sem detalhes).</p>` : ''}`;
  ligarPeriodo(d.periodo);
}

/* ---------- COBERTURA DE AUDIENCIA ---------- */
async function pgAudiencia() {
  const a = await api('audience'), t = a.totals;
  const pc = n => t.total ? Math.round(n / t.total * 100) : 0;
  $('#app').innerHTML = `
  <div class="page-head"><div><h1>Cobertura de audiência</h1><p class="sub">Quantos clientes dá para alcançar por WhatsApp ou SMS.</p></div></div>
  <section class="painel pad" style="display:grid;gap:14px">
    <p style="font:800 clamp(30px,4vw,44px)/1.1 var(--f-display);letter-spacing:-.03em"><span class="num">${inteiro(t.alcancaveis)}</span> <span style="font-weight:500;color:var(--texto-2);font-size:.5em">de ${inteiro(t.total)} clientes podem receber mensagem (${pc(t.alcancaveis)}%)</span></p>
    <div class="empilha" role="img" aria-label="Divisão da base">${[[t.alcancaveis, 'var(--folha)'], [t.semCelular, 'var(--ambar)'], [t.optout, 'var(--pimenta)']].map(([n, c]) => `<i style="flex:${n || 0};background:${c}"></i>`).join('')}</div>
    <div class="legenda-tab"><span><i style="background:var(--folha)"></i>Podem receber: ${inteiro(t.alcancaveis)}</span><span><i style="background:var(--ambar)"></i>Sem celular válido: ${inteiro(t.semCelular)}</span><span><i style="background:var(--pimenta)"></i>Descadastrados: ${inteiro(t.optout)}</span></div>
  </section>
  <h2 class="sec">Por grupo</h2>
  <div class="painel"><div class="rolagem"><table class="tabela"><thead><tr><th>Grupo</th><th class="d">Clientes</th><th class="d">Podem receber</th><th class="d">Sem celular válido</th><th class="d">Descadastrados</th></tr></thead><tbody>
    ${SEGS.map(s => { const g = a.segments[s]; return `<tr style="cursor:default"><td>${pillSeg(s)}</td><td class="d num">${inteiro(g.total)}</td><td class="d num"><b>${inteiro(g.alcancaveis)}</b></td><td class="d num">${inteiro(g.semCelular)}</td><td class="d num">${inteiro(g.optout)}</td></tr>`; }).join('')}</tbody></table></div></div>
  <p class="msg-nota">“Sem celular válido” são telefones fixos ou incompletos. WhatsApp e SMS precisam de um celular com DDD.</p>`;
}

/* ---------- VENDAS ---------- */
const vendaF = { q: '', pagina: 0, porPagina: 25 };
async function pgVendas() {
  const p = periodoAtual();
  $('#app').innerHTML = `
  <div class="page-head"><div><h1>Vendas</h1><p class="sub" id="resumo"></p></div>${periodoHtml(p)}</div>
  <div class="barra-filtros"><div class="busca">${icon('busca')}<input class="campo" id="q" type="search" placeholder="Buscar por nome ou telefone" value="${esc(vendaF.q)}" aria-label="Buscar venda"></div></div>
  <section class="faixa" style="grid-template-columns:repeat(3,1fr);margin:0 0 14px" id="faixa"></section>
  <div class="painel"><div class="rolagem"><table class="tabela"><thead><tr><th>Quando</th><th>Cliente</th><th class="d">Valor</th><th>Origem</th></tr></thead><tbody id="linhas"></tbody></table></div><div id="vendas-pag"></div></div>`;
  ligarPeriodo(p);
  async function carregar() {
    const r = await api(`orders?from=${p.from}&to=${p.to}&q=${encodeURIComponent(vendaF.q)}&limit=${vendaF.porPagina}&offset=${vendaF.pagina * vendaF.porPagina}`);
    if (r.total && vendaF.pagina * vendaF.porPagina >= r.total) { vendaF.pagina = Math.max(0, Math.ceil(r.total / vendaF.porPagina) - 1); return carregar(); }
    const linhas = r.rows;
    $('#resumo').textContent = `${dataBr(p.from + 'T12:00')} a ${dataBr(p.to + 'T12:00')}`;
    $('#faixa').innerHTML = [['Pedidos', inteiro(r.total)], ['Receita', brl(r.receita)], ['Vindos de campanha', inteiro(r.deCampanha)]].map(([a, b]) => `<div class="ind"><span class="rot">${a}</span><span class="val num">${b}</span></div>`).join('');
    $('#linhas').innerHTML = linhas.length ? linhas.map(o => `<tr tabindex="0" data-id="${o.customer_id}"><td class="num">${dataHora(o.created_at)}</td>
      <td><div class="pessoa"><div><b>${esc(nomeBonito(o.name))}</b><small class="num">${esc(fone(o.phone))}</small></div></div></td>
      <td class="d num"><b>${brl(o.total)}</b></td><td>${o.campaign_id ? '<span class="pill" style="--c:var(--ambar)">Campanha</span>' : '<span style="color:var(--texto-2)">Pedido normal</span>'}</td></tr>`).join('')
      : `<tr><td colspan="4"><div class="vazio"><b>Nenhuma venda encontrada</b><span>Mude o período ou limpe a busca.</span></div></td></tr>`;
    $('#vendas-pag').innerHTML = paginacaoHtml('vendas-paginacao', vendaF.pagina, vendaF.porPagina, r.total, 'Vendas');
    ligarPaginacao('vendas-paginacao', vendaF, carregar);
    $('#linhas').querySelectorAll('tr[data-id]').forEach(tr => { const abrir = () => gavetaCliente(+tr.dataset.id); tr.onclick = abrir; tr.onkeydown = e => { if (e.key === 'Enter') abrir(); }; });
  }
  $('#q').oninput = debounce(e => { vendaF.q = e.target.value.trim(); vendaF.pagina = 0; carregar(); });
  await carregar();
}

/* ---------- AJUSTES ---------- */
async function pgAjustes() {
  await carregarMeta();
  $('#app').innerHTML = `
  <div class="page-head"><div><h1>Ajustes</h1><p class="sub">Personalize o programa para a ${esc(BRAND.loja.nome)}.</p></div></div>
  <section class="painel pad" style="display:grid;gap:14px;max-width:560px">
    <h3 style="font:700 19px var(--f-display)">Logo da loja</h3>
    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      ${META.logo ? `<img class="logo-previa" src="${esc(META.logo)}" alt="Logo atual">` : `<span class="logo-vazio" aria-hidden="true">${esc((BRAND.loja.nome || '?').charAt(0).toUpperCase())}</span>`}
      <p style="color:var(--texto-2);flex:1;min-width:200px">${META.logo ? 'Este é o logo da loja: aparece na prévia das mensagens.' : 'Ainda sem logo. Escolha uma imagem PNG, JPG ou WebP de até 3 MB; ela aparece na prévia das mensagens.'}</p>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input class="campo" type="file" id="logo" accept="image/png,image/jpeg,image/webp" aria-label="Arquivo do logo" style="max-width:100%">
      <button class="btn primario" id="salvalogo">Salvar logo</button>${META.logo ? '<button class="btn" id="tiralogo">Remover logo</button>' : ''}</div>
  </section>`;
  $('#salvalogo').onclick = async () => {
    const f = $('#logo').files[0]; if (!f) return toast('Escolha uma imagem primeiro.', true);
    try {
      const token = await window.CrmAuth.token();
      const r = await fetch('/api/logo', { method: 'POST', headers: { 'Content-Type': f.type, Authorization: `Bearer ${token}` }, body: f });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      toast('Logo salvo.'); pgAjustes();
    } catch (e) { toast(e.message, true); }
  };
  const t = $('#tiralogo'); if (t) t.onclick = async () => { await api('logo/remove', {}); toast('Logo removido.'); pgAjustes(); };
  await secoesAjustes();
}

// Ajustes do RFV, da janela de conversão e dos clientes fora das listas (abaixo do logo)
async function secoesAjustes() {
  const a = await api('ajustes');
  const n = (id, v, rot, suf) => `<label class="aj-campo"><span>${rot}</span><span class="aj-linha"><input class="campo num" type="number" min="1" step="1" id="${id}" value="${v}" inputmode="numeric"><span class="nota">${suf}</span></span></label>`;
  const qtd = Object.fromEntries(a.grupos.map(g => [g.nome, g.clientes]));
  const caixa = document.createElement('div');
  caixa.style.cssText = 'display:grid;gap:16px;max-width:760px;margin-top:16px';
  caixa.innerHTML = `
  <section class="painel pad" style="display:grid;gap:12px">
    <h3 style="font:700 19px var(--f-display)">Faixas dos grupos de clientes (RFV)</h3>
    <p class="nota">Define em que grupo cada cliente cai. Os dois grupos de baixo dependem de há quantos dias o cliente não pede. Entre os que pediram há pouco, conta quantos pedidos ele fez nos últimos 12 meses.</p>
    <div class="aj-grade">
      ${n('rfv-perdidos', a.rfv.perdidos, 'Perdidos: sem pedir há mais de', 'dias')}
      ${n('rfv-risco', a.rfv.risco, 'Em risco: sem pedir há', 'dias ou mais')}
      ${n('rfv-campeoes', a.rfv.campeoes, 'Campeões: pelo menos', 'pedidos no ano')}
      ${n('rfv-fieis', a.rfv.fieis, 'Fiéis: pelo menos', 'pedidos no ano')}
      ${n('rfv-lealdade', a.rfv.lealdade, 'Lealdade potencial: pelo menos', 'pedidos no ano')}
    </div>
    <p class="nota">Quem pediu há pouco e tem menos pedidos que "Lealdade potencial" fica em Promissores.</p>
    <p class="nota">Hoje: ${a.grupos.map(g => `${esc(g.nome)} <b class="num">${inteiro(g.clientes)}</b>`).join(' · ')}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primario" id="salva-rfv">Salvar faixas</button><button class="btn" id="padrao-rfv">Voltar ao padrão</button></div>
  </section>
  <section class="painel pad" style="display:grid;gap:12px">
    <h3 style="font:700 19px var(--f-display)">Janela de conversão por grupo</h3>
    <p class="nota">Um pedido conta como resultado de uma campanha se chegar até estes dias depois da mensagem. Vale o grupo em que o cliente estava quando recebeu. Quem pede toda semana pede de novo logo, com ou sem mensagem; por isso, use janelas menores para os grupos que mais pedem. Mensagens enviadas antes desta configuração continuam com 7 dias.</p>
    <div class="aj-grade">${Object.entries(a.janela).map(([g, v], i) => n('jan-' + i, v, `${esc(g)} <span class="nota">(${inteiro(qtd[g] || 0)} clientes)</span>`, 'dias')).join('')}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primario" id="salva-jan">Salvar janelas</button><button class="btn" id="padrao-jan">Todas com 7 dias</button></div>
  </section>
  <section class="painel pad" style="display:grid;gap:12px">
    <h3 style="font:700 19px var(--f-display)">Custo por mensagem</h3>
    <p class="nota">Usado no painel de Performance para calcular custo, ROAS e ROI. Confira o valor real na fatura de cada serviço.</p>
    <div class="aj-grade">${['whatsapp', 'sms', 'email'].map(k => `<label class="aj-campo"><span>${CANAL[k]}</span><span class="aj-linha"><span class="nota">R$</span><input class="campo num" type="number" min="0" max="10" step="0.01" id="custo-${k}" value="${a.custos[k]}" inputmode="decimal"></span></label>`).join('')}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primario" id="salva-custo">Salvar custos</button><button class="btn" id="padrao-custo">Voltar ao padrão</button></div>
  </section>
  <section class="painel pad" style="display:grid;gap:12px">
    <h3 style="font:700 19px var(--f-display)">Clientes fora das listas e relatórios</h3>
    <p class="nota">Para funcionários, números de teste ou quem pediu para sair da base. Eles não aparecem em contatos, análises, campanhas e fluxos. Os pedidos continuam somando no faturamento. Para tirar alguém, abra a ficha do cliente e use "Tirar das listas e relatórios".</p>
    ${a.excluidos.length ? `<div class="lista-ped">${a.excluidos.map(c => `<div><span>${esc(nomeBonito(c.name))} <span class="nota num">${esc(fone(c.phone))}</span></span><button class="btn" data-volta-lista="${c.id}">Voltar para as listas</button></div>`).join('')}</div>` : '<p class="nota"><b>Nenhum cliente fora das listas.</b></p>'}
  </section>`;
  $('#app').appendChild(caixa);
  const lerNums = ids => Object.fromEntries(ids.map(([k, id]) => [k, Number($('#' + id).value)]));
  const salvar = async (rota, corpo, msg) => { try { await api(rota, corpo); toast(msg); pgAjustes(); } catch (e) { toast(e.message, true); } };
  $('#salva-rfv').onclick = () => salvar('ajustes/rfv', lerNums([['perdidos', 'rfv-perdidos'], ['risco', 'rfv-risco'], ['campeoes', 'rfv-campeoes'], ['fieis', 'rfv-fieis'], ['lealdade', 'rfv-lealdade']]), 'Faixas salvas. Os grupos já foram recalculados.');
  $('#padrao-rfv').onclick = () => salvar('ajustes/rfv', a.rfvPadrao, 'Faixas voltaram ao padrão.');
  $('#salva-jan').onclick = () => salvar('ajustes/janela', lerNums(Object.keys(a.janela).map((g, i) => [g, 'jan-' + i])), 'Janelas salvas. As conversões já foram recalculadas.');
  $('#padrao-jan').onclick = () => salvar('ajustes/janela', a.janelaPadrao, 'Todas as janelas voltaram a 7 dias.');
  $('#salva-custo').onclick = () => salvar('ajustes/custos', Object.fromEntries(['whatsapp', 'sms', 'email'].map(k => [k, $('#custo-' + k).value])), 'Custos salvos. O painel de Performance já usa os novos valores.');
  $('#padrao-custo').onclick = () => salvar('ajustes/custos', a.custosPadrao, 'Custos voltaram ao padrão.');
  document.querySelectorAll('[data-volta-lista]').forEach(b => b.onclick = () => salvar('excluir', { id: +b.dataset.voltaLista, value: 0 }, 'O cliente voltou para as listas e relatórios.'));
}

/* ---------- inicio do app ---------- */
window.CrmAuth.ready.then(() => carregarMeta()).then(rota).catch(() => { $('#app').innerHTML = '<div class="painel vazio"><b>O servidor não respondeu</b><span>Confira sua conexão e recarregue a página.</span></div>'; });
