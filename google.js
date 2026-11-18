// Integração com o Google: login (OAuth 2.0 com PKCE), Google Meu Negócio
// (nota e avaliações) e Google Ads (custo, cliques, conversões e ROAS por campanha). Sem dependências.
//
// .env:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   cliente OAuth "Aplicativo da Web" no Google Cloud,
//   GOOGLE_REDIRECT_URI                      callback público em produção; no PC usa localhost automaticamente
//   GOOGLE_TOKEN_PATH                        arquivo persistente do token em produção
//   GOOGLE_ADS_DEVELOPER_TOKEN               token de desenvolvedor (Google Ads > Ferramentas > Central de API)
//   GOOGLE_ADS_CUSTOMER_ID                   conta do Google Ads da loja (só números)
//   GOOGLE_ADS_LOGIN_CUSTOMER_ID             opcional: conta de administrador (MCC) que dá acesso à conta
//   GOOGLE_ADS_API_VERSION                   opcional, padrão v21
//
// O token de acesso fica só em google-token.json, nesta pasta (fora do Git e fora da cópia no Supabase).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('./db');

const ARQ_TOKEN = process.env.GOOGLE_TOKEN_PATH
  ? path.resolve(process.env.GOOGLE_TOKEN_PATH)
  : path.join(__dirname, 'google-token.json');
const ESCOPOS = ['https://www.googleapis.com/auth/business.manage', 'https://www.googleapis.com/auth/adwords', 'openid', 'email'];
const env = () => ({
  id: (process.env.GOOGLE_CLIENT_ID || '').trim(), segredo: (process.env.GOOGLE_CLIENT_SECRET || '').trim(),
  porta: process.env.PORT || 3000,
  adsToken: (process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '').trim(),
  adsCliente: (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/\D/g, ''),
  adsLogin: (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').replace(/\D/g, ''),
  adsVersao: (process.env.GOOGLE_ADS_API_VERSION || 'v21').trim(),
});
const redirect = () => (process.env.GOOGLE_REDIRECT_URI || `http://localhost:${env().porta}/api/google/callback`).trim();
const clientePronto = () => { const e = env(); return !!(e.id && e.segredo); };

const lerToken = () => { try { return JSON.parse(fs.readFileSync(ARQ_TOKEN, 'utf8')); } catch { return null; } };
const gravarToken = t => {
  fs.mkdirSync(path.dirname(ARQ_TOKEN), { recursive: true });
  fs.writeFileSync(ARQ_TOKEN, JSON.stringify(t, null, 2), { mode: 0o600 });
};
const lerMeta = k => { try { return JSON.parse(db.prepare('SELECT value FROM meta WHERE key = ?').get(k)?.value || 'null'); } catch { return null; } };
const gravarMeta = (k, v) => db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));

// ---------- login ----------
const pendentes = new Map();   // state -> { verificador, em }
function urlLogin() {
  if (!clientePronto()) throw new Error('Preencha GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no arquivo de configuração e reinicie o programa.');
  const verificador = crypto.randomBytes(48).toString('base64url');
  const desafio = crypto.createHash('sha256').update(verificador).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');
  for (const [k, v] of pendentes) if (Date.now() - v.em > 15 * 60e3) pendentes.delete(k);
  pendentes.set(state, { verificador, em: Date.now() });
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  Object.entries({ client_id: env().id, redirect_uri: redirect(), response_type: 'code', scope: ESCOPOS.join(' '), access_type: 'offline',
    prompt: 'consent', include_granted_scopes: 'true', state, code_challenge: desafio, code_challenge_method: 'S256' }).forEach(([k, v]) => u.searchParams.set(k, v));
  return u.toString();
}

async function trocarCodigo(code, state) {
  const p = pendentes.get(String(state || ''));
  if (!p) throw new Error('Pedido de login expirado ou desconhecido. Clique em "Conectar conta Google" de novo.');
  pendentes.delete(String(state));
  const e = env();
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: String(code), client_id: e.id, client_secret: e.segredo, redirect_uri: redirect(), grant_type: 'authorization_code', code_verifier: p.verificador }) });
  const j = await r.json();
  if (!r.ok || !j.refresh_token) throw new Error(`O Google não liberou o acesso: ${j.error_description || j.error || 'sem refresh token (desconecte o app em myaccount.google.com/permissions e tente de novo)'}`);
  let email = null;
  try { email = JSON.parse(Buffer.from(String(j.id_token).split('.')[1], 'base64url').toString()).email || null; } catch { /* sem e-mail */ }
  gravarToken({ refresh_token: j.refresh_token, access_token: j.access_token, expira: Date.now() + (j.expires_in - 60) * 1000, escopos: j.scope, email, conectado_em: new Date().toISOString() });
  return { email };
}

async function acesso() {
  const t = lerToken();
  if (!t?.refresh_token) throw new Error('Conta Google não conectada. Conecte em Conexões > Google.');
  if (t.access_token && t.expira > Date.now()) return t.access_token;
  const e = env();
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: e.id, client_secret: e.segredo, refresh_token: t.refresh_token, grant_type: 'refresh_token' }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`O Google recusou renovar o acesso (${j.error || r.status}). Conecte a conta de novo em Conexões > Google.`);
  gravarToken({ ...t, access_token: j.access_token, expira: Date.now() + (j.expires_in - 60) * 1000 });
  return j.access_token;
}

async function desconectar() {
  const t = lerToken();
  if (t?.refresh_token) await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t.refresh_token), { method: 'POST' }).catch(() => null);
  try { fs.unlinkSync(ARQ_TOKEN); } catch { /* já não existia */ }
  return { ok: true };
}

async function chamar(url, opcoes = {}, servico = 'Google') {
  const r = await fetch(url, { ...opcoes, headers: { Authorization: `Bearer ${await acesso()}`, ...(opcoes.headers || {}) }, signal: AbortSignal.timeout(60000) });
  const texto = await r.text();
  let j = null; try { j = JSON.parse(texto); } catch { /* sem JSON */ }
  if (!r.ok) {
    const erro = Array.isArray(j) ? j[0]?.error : j?.error;
    const det = erro?.details?.[0]?.errors?.[0]?.message || erro?.message || texto.slice(0, 200);
    const dica = r.status === 403 && /has not been used|disabled/i.test(det) ? ' Ative essa API no Google Cloud.' :
      r.status === 429 || /quota/i.test(det) ? ' (Sem cota: o Google ainda não aprovou o acesso desta API para o seu projeto.)' : '';
    throw new Error(`${servico} recusou (${r.status}): ${det}${dica}`);
  }
  return j;
}

function status() {
  const t = lerToken(), e = env();
  return { clientePronto: clientePronto(), conectado: !!t?.refresh_token, email: t?.email || null, conectadoEm: t?.conectado_em || null, redirect: redirect(),
    ads: { tokenPronto: !!e.adsToken, cliente: e.adsCliente || null }, local: lerMeta('google_local') };
}

// ---------- Google Meu Negócio ----------
async function locais() {
  const contas = (await chamar('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {}, 'Google Meu Negócio'))?.accounts || [];
  const lista = [];
  for (const c of contas) {
    const l = await chamar(`https://mybusinessbusinessinformation.googleapis.com/v1/${c.name}/locations?readMask=name,title,storefrontAddress&pageSize=100`, {}, 'Google Meu Negócio');
    for (const loc of l?.locations || []) lista.push({ conta: c.name, local: loc.name, titulo: loc.title, endereco: [loc.storefrontAddress?.addressLines?.[0], loc.storefrontAddress?.locality].filter(Boolean).join(', ') });
  }
  return lista;
}

function escolherLocal({ conta, local, titulo }) {
  if (!/^accounts\/\d+$/.test(String(conta)) || !/^locations\/\d+$/.test(String(local))) throw new Error('Escolha um perfil da lista.');
  const v = { conta, local, titulo: String(titulo || '').slice(0, 120) };
  gravarMeta('google_local', v);
  return v;
}

const ESTRELAS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
async function avaliacoes() {
  const loc = lerMeta('google_local');
  if (!loc) throw new Error('Escolha o perfil da loja no Google Meu Negócio.');
  const todas = []; let pagina = '', media = null, total = null;
  for (let i = 0; i < 10; i++) {   // até 500 avaliações
    const j = await chamar(`https://mybusiness.googleapis.com/v4/${loc.conta}/${loc.local}/reviews?pageSize=50${pagina ? '&pageToken=' + encodeURIComponent(pagina) : ''}`, {}, 'Google Meu Negócio');
    media = j?.averageRating ?? media; total = j?.totalReviewCount ?? total;
    todas.push(...(j?.reviews || []));
    if (!j?.nextPageToken) break;
    pagina = j.nextPageToken;
  }
  const lista = todas.map(r => ({ id: r.reviewId, autor: r.reviewer?.displayName || 'Cliente do Google', nota: ESTRELAS[r.starRating] || 0, texto: r.comment || '',
    data: r.createTime, respondida: !!r.reviewReply?.comment, resposta: r.reviewReply?.comment || null }));
  const dist = [5, 4, 3, 2, 1].map(n => ({ nota: n, qtd: lista.filter(r => r.nota === n).length }));
  const d30 = Date.now() - 30 * 864e5;
  return { local: loc, media, total: total ?? lista.length, distribuicao: dist, semResposta: lista.filter(r => !r.respondida).length,
    ultimos30: lista.filter(r => new Date(r.data).getTime() >= d30).length, negativasSemResposta: lista.filter(r => r.nota <= 3 && !r.respondida).length,
    avaliacoes: lista.sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 100) };
}

// ---------- Google Ads ----------
function adsPronto() { const e = env(); return !!(e.adsToken && e.adsCliente); }
async function ads(fromStr, toStr) {
  const e = env();
  if (!e.adsToken) throw new Error('Falta o token de desenvolvedor do Google Ads (GOOGLE_ADS_DEVELOPER_TOKEN).');
  if (!e.adsCliente) throw new Error('Falta o número da conta do Google Ads (GOOGLE_ADS_CUSTOMER_ID).');
  const ok = s => /^\d{4}-\d\d-\d\d$/.test(s || '');
  const hoje = new Date().toISOString().slice(0, 10);
  const de = ok(fromStr) ? fromStr : new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10), ate = ok(toStr) ? toStr : hoje;
  const query = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
      metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value
    FROM campaign WHERE segments.date BETWEEN '${de}' AND '${ate}' AND metrics.impressions > 0`;
  const headers = { 'developer-token': e.adsToken, 'Content-Type': 'application/json', ...(e.adsLogin ? { 'login-customer-id': e.adsLogin } : {}) };
  const linhas = [];
  let pagina = '';
  for (let i = 0; i < 20; i++) {
    const j = await chamar(`https://googleads.googleapis.com/${e.adsVersao}/customers/${e.adsCliente}/googleAds:search`,
      { method: 'POST', headers, body: JSON.stringify({ query, ...(pagina ? { pageToken: pagina } : {}) }) }, 'Google Ads');
    linhas.push(...(j?.results || []));
    if (!j?.nextPageToken) break;
    pagina = j.nextPageToken;
  }
  const porCampanha = new Map();
  for (const l of linhas) {
    const id = l.campaign?.id; const m = l.metrics || {};
    const a = porCampanha.get(id) || { id, nome: l.campaign?.name, status: l.campaign?.status, tipo: l.campaign?.advertisingChannelType, custo: 0, impressoes: 0, cliques: 0, conversoes: 0, valor: 0 };
    a.custo += Number(m.costMicros || 0) / 1e6; a.impressoes += Number(m.impressions || 0); a.cliques += Number(m.clicks || 0);
    a.conversoes += Number(m.conversions || 0); a.valor += Number(m.conversionsValue || 0);
    porCampanha.set(id, a);
  }
  const extra = a => ({ ...a, cpc: a.cliques ? a.custo / a.cliques : 0, ctr: a.impressoes ? a.cliques / a.impressoes : 0, roas: a.custo ? a.valor / a.custo : null, custoConversao: a.conversoes ? a.custo / a.conversoes : null });
  const campanhas = [...porCampanha.values()].map(extra).sort((a, b) => b.custo - a.custo);
  const soma = k => campanhas.reduce((t, c) => t + c[k], 0);
  const receitaLoja = db.prepare('SELECT COALESCE(SUM(total), 0) r FROM orders WHERE created_at >= ? AND created_at < ?')
    .get(new Date(de + 'T00:00:00').toISOString(), new Date(new Date(ate + 'T00:00:00').getTime() + 864e5).toISOString()).r;
  return { periodo: { from: de, to: ate }, campanhas, total: extra({ custo: soma('custo'), impressoes: soma('impressoes'), cliques: soma('cliques'), conversoes: soma('conversoes'), valor: soma('valor') }), receitaLoja };
}

module.exports = { status, urlLogin, trocarCodigo, desconectar, locais, escolherLocal, avaliacoes, ads, adsPronto, clientePronto, ARQ_TOKEN };
