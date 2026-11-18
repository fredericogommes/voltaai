// WhatsApp Business (Cloud API da Meta): modelos de mensagem com imagem, botoes e envio.
// IMPORTANTE: escrito a partir da documentacao da Meta e testado so contra um servidor de mentira.
// O primeiro teste real (com sua conta) pode pedir ajustes.
//
// Variaveis de ambiente (arquivo .env):
//   WA_TOKEN     token de acesso (de preferencia o de usuario do sistema, que nao expira)
//   WA_PHONE_ID  ID do numero de telefone do WhatsApp Business (para ENVIAR)
//   WA_WABA_ID   ID da conta do WhatsApp Business (para CRIAR modelos)
//   WA_APP_ID    ID do app da Meta (para subir a imagem de exemplo dos modelos)
//   WA_LANG      idioma dos modelos (padrao pt_BR)
const fs = require('node:fs');
const path = require('node:path');

const GRAPH = () => process.env.GRAPH_BASE || 'https://graph.facebook.com/v21.0';
const env = () => ({ token: process.env.WA_TOKEN, phoneId: process.env.WA_PHONE_ID, waba: process.env.WA_WABA_ID, app: process.env.WA_APP_ID, lang: process.env.WA_LANG || 'pt_BR' });
const MEDIA_DIR = path.join(__dirname, 'public', 'media');
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

const canSend = () => { const e = env(); return !!(e.token && e.phoneId); };
const canSubmit = () => { const e = env(); return !!(e.token && e.waba && e.app); };

async function call(url, opts = {}) {
  const r = await fetch(url, opts);
  const txt = await r.text();
  let j = {}; try { j = JSON.parse(txt); } catch { /* resposta sem JSON */ }
  if (!r.ok) throw new Error(`Meta ${r.status}: ${j.error?.error_user_msg || j.error?.message || txt.slice(0, 200)}`);
  return j;
}

// ---- variaveis: [nome_cliente] ({nome} e o formato antigo) e [produto_favorito] ---
// Cada uma pode aparecer uma vez. Na Meta viram {{1}}, {{2}} na ordem em que aparecem no texto.
const { FAVORITO_PADRAO } = require('./products');
const VAR_RE = /\[(nome_cliente|produto_favorito)\]|\{nome\}/g;
const EXEMPLOS = { nome_cliente: 'Maria', produto_favorito: 'Cento Promocional 1' };
const varOrder = t => [...String(t).matchAll(VAR_RE)].map(m => m[1] || 'nome_cliente');
const countVars = t => varOrder(t).length;
const toMeta = t => { let n = 0; return String(t).replace(VAR_RE, () => `{{${++n}}}`); };

// ---- imagem de exemplo exigida pela Meta ao criar o modelo (upload em partes) --
async function uploadHandle(file) {
  const e = env(), full = path.join(MEDIA_DIR, path.basename(file)), buf = fs.readFileSync(full);
  const type = MIME[path.extname(full).toLowerCase()] || 'image/jpeg';
  const s = await call(`${GRAPH()}/${e.app}/uploads?file_length=${buf.length}&file_type=${encodeURIComponent(type)}&file_name=${encodeURIComponent(path.basename(full))}`,
    { method: 'POST', headers: { Authorization: `Bearer ${e.token}` } });
  const u = await call(`${GRAPH()}/${s.id}`, { method: 'POST', headers: { Authorization: `OAuth ${e.token}`, file_offset: '0' }, body: buf });
  if (!u.h) throw new Error('A Meta não devolveu o código da imagem de exemplo.');
  return u.h;
}

// ---- imagem para ENVIAR: sobe para o WhatsApp e usa o id (nao precisa de site publico) ----
const mediaCache = new Map();
async function uploadMedia(file) {
  const e = env(), full = path.join(MEDIA_DIR, path.basename(file)), st = fs.statSync(full), key = `${full}:${st.mtimeMs}`;
  if (mediaCache.has(key)) return mediaCache.get(key);
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', MIME[path.extname(full).toLowerCase()] || 'image/jpeg');
  form.append('file', new Blob([fs.readFileSync(full)], { type: MIME[path.extname(full).toLowerCase()] }), path.basename(full));
  const j = await call(`${GRAPH()}/${e.phoneId}/media`, { method: 'POST', headers: { Authorization: `Bearer ${e.token}` }, body: form });
  mediaCache.set(key, j.id); return j.id;
}

// ---- botoes: url | reply | copy (copiar codigo) | optin -------------------------
// "Copiar codigo" nao tem texto proprio (a Meta usa um fixo), entao fica mesmo sem texto
const buttonsOf = ad => (ad.buttons || []).filter(b => b.text || b.type === 'copy');
function metaButtons(ad) {
  return buttonsOf(ad).map(b => {
    if (b.type === 'url') return { type: 'URL', text: b.text, url: b.value };
    if (b.type === 'copy') return { type: 'COPY_CODE', example: b.value || 'CUPOM10' };
    return { type: 'QUICK_REPLY', text: b.text };           // reply e optin
  });
}

async function buildComponents(ad) {
  const comps = [];
  if (ad.media) comps.push({ type: 'HEADER', format: 'IMAGE', example: { header_handle: [await uploadHandle(ad.media)] } });
  else if (ad.header) comps.push({ type: 'HEADER', format: 'TEXT', text: ad.header });
  comps.push({ type: 'BODY', text: toMeta(ad.body), ...(countVars(ad.body) ? { example: { body_text: [varOrder(ad.body).map(v => EXEMPLOS[v])] } } : {}) });
  if (ad.footer) comps.push({ type: 'FOOTER', text: ad.footer });
  const btns = metaButtons(ad);
  if (btns.length) comps.push({ type: 'BUTTONS', buttons: btns });
  return comps;
}

// Envia o modelo para aprovacao. Devolve { id, status }
async function submitTemplate(name, ad, category) {
  const e = env();
  const j = await call(`${GRAPH()}/${e.waba}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${e.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, language: e.lang, category: category === 'utility' ? 'UTILITY' : 'MARKETING', components: await buildComponents(ad) }),
  });
  if (!j.id) throw new Error('A Meta não devolveu o código do modelo. Confira o WA_WABA_ID e as permissões do token.');
  return { id: j.id, status: j.status || 'PENDING' };
}

async function templateStatus(metaId) {
  const e = env();
  const j = await call(`${GRAPH()}/${metaId}?fields=status,rejected_reason`, { headers: { Authorization: `Bearer ${e.token}` } });
  return { status: j.status, reason: j.rejected_reason && j.rejected_reason !== 'NONE' ? j.rejected_reason : null };
}

// Envia uma mensagem usando um modelo aprovado
async function sendTemplate(customer, ad, templateName) {
  const e = env();
  const first = String(customer.name || '').trim().split(/\s+/)[0] || 'cliente';
  const components = [];
  if (ad.media) components.push({ type: 'header', parameters: [{ type: 'image', image: { id: await uploadMedia(ad.media) } }] });
  if (countVars(ad.body)) components.push({ type: 'body', parameters: varOrder(ad.body).map(v => ({ type: 'text', text: v === 'produto_favorito' ? (customer.favorito || FAVORITO_PADRAO) : first })) });
  buttonsOf(ad).forEach((b, i) => {
    if (b.type === 'copy') components.push({ type: 'button', sub_type: 'copy_code', index: String(i), parameters: [{ type: 'coupon_code', coupon_code: b.value || 'CUPOM10' }] });
  });
  await call(`${GRAPH()}/${e.phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${e.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: customer.phone, type: 'template',
      template: { name: templateName, language: { code: e.lang }, components } }),
  });
}

// ---- verificacao da conexao (so le, nao envia nada) ---------------------------------
async function graphGet(p, token) {
  try {
    const r = await fetch(`${GRAPH()}/${p}`, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, j, err: j.error };
  } catch (e) { return { ok: false, rede: true, err: { message: e.message } }; }
}
function explica(r) {
  const c = r.err?.code;
  if (r.rede) return 'Não consegui falar com a Meta. Confira a conexão com a internet.';
  if (c === 190) return 'O token é inválido ou expirou. Gere um token novo (de preferência de usuário do sistema, que não expira).';
  if (c === 100) return 'Esse ID não existe ou o token não tem acesso a ele. Confira o número copiado, sem espaços.';
  if ([10, 200, 299, 3].includes(c)) return 'O token não tem permissão. Ao gerar o token, marque whatsapp_business_management e whatsapp_business_messaging, e dê ao usuário do sistema acesso ao app e à conta do WhatsApp.';
  return r.err?.message || 'A Meta recusou o pedido.';
}

async function diagnose(mode) {
  const e = env(), itens = [];
  const add = (id, ok, titulo, detalhe, ajuda, aviso) => itens.push({ id, ok, titulo, detalhe, ajuda: ajuda || null, aviso: !!aviso });
  const faltam = ['WA_TOKEN', 'WA_PHONE_ID', 'WA_WABA_ID', 'WA_APP_ID'].filter(k => !process.env[k]);
  add('dados', !faltam.length, 'Dados no arquivo .env', faltam.length ? `Faltam: ${faltam.join(', ')}` : 'Os 4 dados estão preenchidos',
    faltam.length ? 'Preencha o que falta no arquivo .env e reinicie o programa.' : null);
  if (e.token) {
    const me = await graphGet('me?fields=id,name', e.token);
    add('token', me.ok, 'Token de acesso', me.ok ? `Válido${me.j.name ? ` (${me.j.name})` : ''}` : explica(me));
    if (me.ok) {
      if (e.phoneId) {
        const p = await graphGet(`${e.phoneId}?fields=display_phone_number,verified_name,quality_rating`, e.token);
        add('numero', p.ok, 'Número de WhatsApp', p.ok ? [p.j.display_phone_number, p.j.verified_name, p.j.quality_rating && `qualidade ${p.j.quality_rating}`].filter(Boolean).join(' · ') : explica(p),
          p.ok ? null : 'O WA_PHONE_ID é o ID do número de telefone, não o número em si. Ele aparece em WhatsApp > Configuração da API.');
      }
      if (e.waba) {
        const w = await graphGet(`${e.waba}/message_templates?limit=1&fields=name,status`, e.token);
        add('waba', w.ok, 'Conta do WhatsApp Business', w.ok ? 'Acesso liberado para criar e consultar modelos de mensagem' : explica(w),
          w.ok ? null : 'O WA_WABA_ID é o ID da conta do WhatsApp Business (diferente do ID do número).');
      }
      if (e.app) {
        const a = await graphGet(`${e.app}?fields=name`, e.token);
        add('app', a.ok, 'App da Meta', a.ok ? (a.j.name || 'Encontrado') : explica(a),
          a.ok ? null : 'O app é usado para enviar a imagem de exemplo dos modelos. Se a imagem não for usada nos modelos, isso não impede os envios de texto.', !a.ok);
      }
    }
  }
  add('modo', mode === 'live', 'Envio real', mode === 'live' ? 'Ligado' : 'Desligado (modo teste)', mode === 'live' ? null : 'Quando as verificações acima passarem, ligue colocando SEND_MODE=live no arquivo .env e reiniciando.', true);
  const essenciais = itens.filter(i => ['dados', 'token', 'numero', 'waba'].includes(i.id));
  return { pronto: essenciais.length === 4 && essenciais.every(i => i.ok), itens };
}

module.exports = { canSend, canSubmit, countVars, varOrder, submitTemplate, templateStatus, sendTemplate, diagnose, MEDIA_DIR };
