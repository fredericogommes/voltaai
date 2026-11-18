// Campanhas: validar, salvar, publicar (modelos na Meta), imagens e texto por IA
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('./db');
const core = require('./core');
const wa = require('./whatsapp');
const canais = require('./canais');
const { MODE } = require('./senders');
const sched = require('./scheduler');

const LABELS = ['A', 'B', 'C'];
const MEDIA_DIR = wa.MEDIA_DIR;
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// ---------- validacao ---------------------------------------------------------
function cleanAd(a, i) {
  const btn = b => ({ type: ['url', 'reply', 'copy', 'optin'].includes(b?.type) ? b.type : 'reply', text: String(b?.text || '').trim(), value: String(b?.value || '').trim() });
  return {
    label: LABELS[i], media: a.media ? path.basename(String(a.media)) : null, header: String(a.header || '').trim(),
    body: String(a.body || '').trim(), footer: String(a.footer || '').trim(),
    buttons: (a.buttons || []).slice(0, 3).map(btn).filter(b => b.text || b.value),
  };
}
const TAGS = '(\\[nome_cliente\\]|\\[produto_favorito\\]|\\{nome\\})';
const startsOrEndsWithVar = t => new RegExp('^' + TAGS).test(t) || new RegExp(TAGS + '[\\s.!?,:;]*$').test(t);

function validate(c, ads) {
  const err = [];
  if (!c.name || !String(c.name).trim()) err.push('Dê um nome à campanha.');
  if (!ads.length) err.push('Crie pelo menos um anúncio.');
  ads.forEach(a => {
    const L = `Anúncio ${a.label}`;
    if (!a.body) err.push(`${L}: escreva a mensagem.`);
    const limite = { sms: 459, email: 5000 }[c.channel] || 1024;
    if (a.body.length > limite) err.push(`${L}: a mensagem passa do limite de ${limite} caracteres.`);
    if (c.channel === 'email') {
      if (!a.header) err.push(`${L}: escreva o assunto do e-mail.`);
      if (a.header.length > 120) err.push(`${L}: o assunto passa de 120 caracteres.`);
      return;
    }
    if (c.channel !== 'whatsapp') return;
    if (a.footer.length > 60) err.push(`${L}: o rodapé passa de 60 caracteres.`);
    if (a.header && a.media) err.push(`${L}: com imagem não dá para ter cabeçalho de texto.`);
    if (a.header.length > 60) err.push(`${L}: o cabeçalho passa de 60 caracteres.`);
    const ordem = wa.varOrder(a.body);
    if (new Set(ordem).size !== ordem.length) err.push(`${L}: use cada variável (nome do cliente, pedido favorito) só uma vez na mensagem.`);
    if (ordem.length && startsOrEndsWithVar(a.body)) err.push(`${L}: a Meta não aceita uma variável no começo nem no fim da mensagem. Coloque texto antes e depois.`);
    if (a.media && !fs.existsSync(path.join(MEDIA_DIR, a.media))) err.push(`${L}: a imagem escolhida não existe mais na galeria.`);
    a.buttons.forEach((b, i) => {
      const B = `${L}, botão ${i + 1}`;
      if (b.type !== 'copy' && !b.text) err.push(`${B}: escreva o texto do botão.`);
      if (b.text.length > 25) err.push(`${B}: o texto passa de 25 caracteres.`);
      if (b.type === 'url' && !/^https?:\/\/\S+$/i.test(b.value)) err.push(`${B}: informe um link completo, começando com https://.`);
      if (b.type === 'copy' && (!b.value || b.value.length > 15)) err.push(`${B}: informe o código a copiar, com até 15 caracteres.`);
    });
  });
  return err;
}

// ---------- ler e salvar -------------------------------------------------------
function get(id) {
  const c = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  if (!c) throw new Error('Campanha não encontrada');
  return { ...c, ads: core.parseAds(c), schedule: sched.parseSchedule(c), auto: sched.info(c),
    templates: db.prepare('SELECT variant, name, status, error, updated_at FROM templates WHERE campaign_id = ?').all(id) };
}

// Liga ou desliga o envio automatico (so campanha publicada pode ligar)
function setAuto(id, on) {
  const c = get(id);
  if (on && c.status !== 'publicada') throw new Error('Publique a campanha antes de ligar o envio automático.');
  const sc = sched.normalize({ ...c.schedule, auto: !!on });
  if (sc.errors.length) throw new Error(sc.errors[0]);
  db.prepare('UPDATE campaigns SET schedule = ? WHERE id = ?').run(JSON.stringify(sc.schedule), id);
  return get(id).auto;
}

function save(data) {
  const ads = (Array.isArray(data.ads) ? data.ads : []).slice(0, 3).map(cleanAd);
  const channel = ['sms', 'email'].includes(data.channel) ? data.channel : 'whatsapp';
  const category = data.category === 'utility' ? 'utility' : 'marketing';
  const errs = validate({ ...data, channel }, ads);
  if (errs.length) throw new Error(errs[0]);
  const sc = sched.normalize(data.schedule);
  if (sc.errors.length) throw new Error(sc.errors[0]);
  const row = [String(data.name).trim(), channel, +data.min_days || 0, data.max_days === '' || data.max_days == null ? null : +data.max_days,
    +data.min_orders || 1, +data.cooldown_days || 30, ads[0].body, JSON.stringify(ads), category, JSON.stringify(sc.schedule)];
  if (data.id) {
    const old = get(+data.id);
    const mudou = JSON.stringify(old.ads) !== JSON.stringify(ads) || old.category !== category || old.channel !== channel;
    // mudou o conteudo: volta a rascunho e DESLIGA o envio automatico (precisa publicar e ligar de novo)
    if (mudou && sc.schedule.auto) { sc.schedule.auto = false; row[9] = JSON.stringify(sc.schedule); }
    db.prepare(`UPDATE campaigns SET name=?, channel=?, min_days=?, max_days=?, min_orders=?, cooldown_days=?, message=?, ads=?, category=?, schedule=?
                , updated_at=?${mudou ? ", status='rascunho'" : ''} WHERE id=?`).run(...row, new Date().toISOString(), +data.id);
    if (mudou) db.prepare('DELETE FROM templates WHERE campaign_id = ?').run(+data.id);   // texto/imagem mudou: modelo antigo nao vale mais
    return { id: +data.id, status: mudou ? 'rascunho' : old.status };
  }
  const agora = new Date().toISOString();
  const r = db.prepare(`INSERT INTO campaigns (name, channel, min_days, max_days, min_orders, cooldown_days, message, ads, category, schedule, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?, 'rascunho', ?, ?)`).run(...row, agora, agora);
  return { id: Number(r.lastInsertRowid), status: 'rascunho' };
}

// ---------- publicar -----------------------------------------------------------
const brand = require('./brand');
const tplName = (id, label) => `${brand.produto.slug.replace(/[^a-z0-9_]/g, '_')}_c${id}_${label.toLowerCase()}_${Date.now().toString(36)}`;

async function publish(id) {
  const c = get(id);
  const errs = validate(c, c.ads);
  if (errs.length) throw new Error(errs[0]);
  const up = db.prepare(`INSERT INTO templates (campaign_id, variant, name, meta_id, status, error) VALUES (?,?,?,?,?,?)
    ON CONFLICT(campaign_id, variant) DO UPDATE SET name=excluded.name, meta_id=excluded.meta_id, status=excluded.status, error=excluded.error, updated_at=datetime('now')`);
  const setStatus = s => db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run(s, id);

  // SMS, modo teste ou Meta nao configurada: so marca como publicada (nada vai para a Meta)
  if (c.channel !== 'whatsapp' || MODE !== 'live' || !wa.canSubmit()) {
    if (c.channel === 'whatsapp') c.ads.forEach(a => up.run(id, a.label, tplName(id, a.label), null, 'SIMULADO', null));
    setStatus('publicada');
    return { status: 'publicada', simulado: true };
  }
  const falhas = [];
  for (const a of c.ads) {
    const name = tplName(id, a.label);
    try { const r = await wa.submitTemplate(name, a, c.category); up.run(id, a.label, name, r.id, r.status, null); }
    catch (e) { up.run(id, a.label, name, null, 'ERRO', String(e.message).slice(0, 300)); falhas.push(`Anúncio ${a.label}: ${e.message}`); }
  }
  if (falhas.length) { setStatus('rascunho'); throw new Error(falhas[0]); }
  setStatus('aguardando');
  return { status: 'aguardando', simulado: false };
}

async function refreshTemplates(id) {
  const rows = db.prepare('SELECT * FROM templates WHERE campaign_id = ? AND meta_id IS NOT NULL').all(id);
  for (const t of rows) {
    const s = await wa.templateStatus(t.meta_id);
    db.prepare("UPDATE templates SET status = ?, error = ?, updated_at = datetime('now') WHERE id = ?").run(s.status, s.reason, t.id);
  }
  const all = db.prepare('SELECT status FROM templates WHERE campaign_id = ?').all(id);
  if (all.length && all.every(t => t.status === 'APPROVED')) db.prepare("UPDATE campaigns SET status='publicada' WHERE id=?").run(id);
  else if (all.some(t => t.status === 'REJECTED')) db.prepare("UPDATE campaigns SET status='rascunho' WHERE id=?").run(id);
  return get(id);
}

// ---------- teste para o proprio WhatsApp ---------------------------------------------
// Manda a campanha (primeiro anuncio) para UM numero informado, para ver imagem e botoes de verdade
// antes de enviar para clientes. Nao entra nas estatisticas nem usa a lista de clientes.
const ultimoTeste = new Map();
async function sendTest(id, phone) {
  const c = get(id);
  if (Date.now() - (ultimoTeste.get(id) || 0) < 15000) throw new Error('Espere alguns segundos antes de enviar outro teste.');
  const teste = { name: 'Teste', favorito: 'Cento Promocional 1' };
  if (c.channel === 'email') {
    const para = String(phone || '').trim();
    if (!canais.emailValido(para)) throw new Error('Informe um e-mail válido para o teste.');
    if (MODE !== 'live') return { simulado: true };
    ultimoTeste.set(id, Date.now());
    await canais.enviarEmail(para, core.render(c.ads[0].header, teste), core.render(c.ads[0].body, teste));
    return { simulado: false, para };
  }
  if (c.channel === 'sms') {
    let s = String(phone || '').replace(/\D/g, ''); if (s.length === 10 || s.length === 11) s = '55' + s;
    if (!/^55[1-9]\d9\d{8}$/.test(s)) throw new Error('Informe um celular com DDD, por exemplo (24) 99999-9999.');
    if (MODE !== 'live') return { simulado: true };
    ultimoTeste.set(id, Date.now());
    await canais.enviarSms(s, core.render(c.ads[0].body, teste));
    return { simulado: false, para: s };
  }
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (!/^55[1-9]\d9\d{8}$/.test(d)) throw new Error('Informe um celular com DDD, por exemplo (24) 99999-9999.');
  if (Date.now() - (ultimoTeste.get(id) || 0) < 15000) throw new Error('Espere alguns segundos antes de enviar outro teste.');
  if (MODE !== 'live') return { simulado: true };
  if (!wa.canSend()) throw new Error('O WhatsApp não está configurado (WA_TOKEN e WA_PHONE_ID).');
  const tpl = c.templates.find(t => t.variant === c.ads[0].label);
  if (!tpl || tpl.status !== 'APPROVED') throw new Error('O modelo ainda não foi aprovado pela Meta.');
  ultimoTeste.set(id, Date.now());
  await wa.sendTemplate({ name: 'Teste', phone: d, favorito: 'Cento Promocional 1' }, c.ads[0], tpl.name);
  return { simulado: false, para: d };
}

// ---------- galeria de imagens --------------------------------------------------
const isPng = b => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const isJpg = b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

function listMedia() {
  const used = db.prepare('SELECT ads FROM campaigns').all().map(r => r.ads || '').join(' ');
  return fs.readdirSync(MEDIA_DIR).filter(f => /\.(png|jpe?g)$/i.test(f)).map(f => {
    const st = fs.statSync(path.join(MEDIA_DIR, f));
    return { file: f, url: `/media/${f}?v=${Math.round(st.mtimeMs)}`, size: st.size, at: st.mtime.toISOString(), emUso: used.includes(`"${f}"`) };
  }).sort((a, b) => b.at.localeCompare(a.at));
}

function saveMedia(buf, originalName) {
  if (buf.length > 5 * 1024 * 1024) throw new Error('A imagem passa de 5 MB, limite do WhatsApp. Reduza o tamanho e tente de novo.');
  const ext = isPng(buf) ? 'png' : isJpg(buf) ? 'jpg' : null;
  if (!ext) throw new Error('Use uma imagem JPG ou PNG. O WhatsApp não aceita outros formatos nos modelos.');
  const slug = String(originalName || 'imagem').replace(/\.[^.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'imagem';
  const file = `${slug}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(MEDIA_DIR, file), buf);
  return listMedia().find(m => m.file === file);
}

function deleteMedia(file) {
  const f = path.basename(String(file));
  const m = listMedia().find(x => x.file === f);
  if (!m) throw new Error('Imagem não encontrada.');
  if (m.emUso) throw new Error('Esta imagem está em uso por uma campanha. Troque a imagem da campanha antes de apagar.');
  fs.rmSync(path.join(MEDIA_DIR, f), { force: true });
}

// ---------- texto por IA (Claude) -----------------------------------------------
async function aiCopy({ objetivo, segmento, canal }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Para gerar texto com IA, coloque ANTHROPIC_API_KEY no arquivo .env.');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'claude-haiku-5-5', max_tokens: 500,
      system: `Você escreve mensagens curtas de WhatsApp para ${brand.loja.nome === 'sua loja' ? 'uma loja' : brand.loja.nome}, ${brand.loja.descricaoParaIA || 'um negócio de foodservice'}${brand.loja.cidade ? ` em ${brand.loja.cidade}` : ''}${brand.loja.slogan ? ` ("${brand.loja.slogan}")` : ''}. ` + 'Tom caloroso, simpático e direto, em português do Brasil, sem exagero de emojis (no máximo 2). Use exatamente uma vez o marcador [nome_cliente] para o primeiro nome do cliente, com texto antes e depois dele. Se combinar, pode usar uma vez o marcador [produto_favorito], o produto que o cliente mais pede (ex.: "Bateu saudade de pedir [produto_favorito]?"). Não invente preços, promoções ou prazos. Responda só com o texto da mensagem, sem aspas.',
      messages: [{ role: 'user', content: `Escreva uma mensagem de ${canal === 'sms' ? 'SMS (até 300 caracteres)' : 'WhatsApp (até 400 caracteres)'} para este objetivo: ${objetivo || 'chamar o cliente de volta para pedir'}. Público: ${segmento || 'clientes que pararam de pedir'}.` }],
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`IA: ${j.error?.message || r.status}`);
  return { text: (j.content || []).map(p => p.text || '').join('').trim() };
}

module.exports = { get, save, setAuto, sendTest, publish, refreshTemplates, listMedia, saveMedia, deleteMedia, aiCopy, validate };
