// Meta: Meta Ads (investimento e resultado por campanha) e Instagram (perfil e posts), pela Graph API.
// Usa o token do usuário do sistema da Meta (o mesmo do WhatsApp, WA_TOKEN) ou META_TOKEN, se houver.
// Só leitura: nada é criado nem alterado na Meta.
//
// .env (opcionais):
//   META_TOKEN          token próprio para anúncios e Instagram (padrão: WA_TOKEN)
//   META_AD_ACCOUNT_ID  conta de anúncios (só números); sem ela, usa a primeira que o token alcança
//   META_GRAPH_VERSION  padrão v21.0
const db = require('./db');

const env = () => ({ token: (process.env.META_TOKEN || process.env.WA_TOKEN || '').trim(), conta: (process.env.META_AD_ACCOUNT_ID || '').replace(/\D/g, ''),
  versao: (process.env.META_GRAPH_VERSION || 'v21.0').trim() });
const pronto = () => !!env().token;

async function graph(caminho, params = {}) {
  const e = env();
  if (!e.token) throw new Error('Falta o token da Meta (o mesmo do WhatsApp, WA_TOKEN, ou META_TOKEN).');
  const u = new URL(`https://graph.facebook.com/${e.versao}${caminho}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  u.searchParams.set('access_token', e.token);
  const r = await fetch(u, { signal: AbortSignal.timeout(60000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const m = j.error?.message || `erro ${r.status}`;
    throw new Error(/permission|not authorized|does not have/i.test(m) ? `A Meta negou o acesso: ${m}` : `A Meta recusou: ${m}`);
  }
  return j;
}
async function todasAsPaginas(caminho, params) {
  const out = []; let j = await graph(caminho, params);
  for (let i = 0; i < 20; i++) {
    out.push(...(j.data || []));
    if (!j.paging?.next) break;
    const r = await fetch(j.paging.next, { signal: AbortSignal.timeout(60000) }); j = await r.json();
    if (j.error) throw new Error(`A Meta recusou: ${j.error.message}`);
  }
  return out;
}

// ---------- contas de anúncios ----------
async function contas() {
  return (await graph('/me/adaccounts', { fields: 'name,account_id,currency,account_status', limit: 50 })).data
    .map(c => ({ id: c.account_id, nome: c.name, moeda: c.currency, ativa: c.account_status === 1 }));
}
async function contaEscolhida() {
  const e = env(); if (e.conta) return e.conta;
  const salvo = db.prepare("SELECT value FROM meta WHERE key = 'meta_ads_conta'").get()?.value;
  if (salvo) return salvo;
  const lista = await contas();
  if (!lista.length) throw new Error('O token da Meta não alcança nenhuma conta de anúncios. No Gerenciador de Negócios, atribua a conta de anúncios ao usuário do sistema.');
  return (lista.find(c => c.ativa) || lista[0]).id;
}
function escolherConta(id) {
  const s = String(id || '').replace(/\D/g, '');
  if (!s) throw new Error('Escolha uma conta de anúncios.');
  db.prepare("INSERT INTO meta (key, value) VALUES ('meta_ads_conta', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(s);
  return { conta: s };
}

const num = v => Number(v || 0);
const acao = (lista, ...tipos) => { for (const t of tipos) { const a = (lista || []).find(x => x.action_type === t); if (a) return num(a.value); } return 0; };
const OBJETIVO = { OUTCOME_SALES: 'Vendas', OUTCOME_LEADS: 'Cadastros', OUTCOME_ENGAGEMENT: 'Engajamento', OUTCOME_TRAFFIC: 'Tráfego', OUTCOME_AWARENESS: 'Reconhecimento', OUTCOME_APP_PROMOTION: 'App', MESSAGES: 'Mensagens', LINK_CLICKS: 'Tráfego', CONVERSIONS: 'Conversões', POST_ENGAGEMENT: 'Engajamento', REACH: 'Alcance' };

async function ads(fromStr, toStr) {
  const ok = s => /^\d{4}-\d\d-\d\d$/.test(s || '');
  const ate = ok(toStr) ? toStr : new Date().toISOString().slice(0, 10);
  const de = ok(fromStr) ? fromStr : new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
  const conta = await contaEscolhida();
  const [linhas, status, info] = await Promise.all([
    todasAsPaginas(`/act_${conta}/insights`, { level: 'campaign', time_range: { since: de, until: ate }, limit: 100,
      fields: 'campaign_id,campaign_name,objective,spend,impressions,reach,clicks,ctr,cpc,actions,action_values,purchase_roas' }),
    todasAsPaginas(`/act_${conta}/campaigns`, { fields: 'id,effective_status', limit: 200 }).catch(() => []),
    graph(`/act_${conta}`, { fields: 'name,currency' }).catch(() => ({})),
  ]);
  const st = Object.fromEntries(status.map(s => [s.id, s.effective_status]));
  const campanhas = linhas.map(l => {
    const gasto = num(l.spend), compras = acao(l.actions, 'omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase');
    const valor = acao(l.action_values, 'omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase');
    const conversas = acao(l.actions, 'onsite_conversion.messaging_conversation_started_7d');
    const leads = acao(l.actions, 'lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead');
    return { id: l.campaign_id, nome: l.campaign_name, objetivo: OBJETIVO[l.objective] || l.objective || '—', status: st[l.campaign_id] || null,
      gasto, impressoes: num(l.impressions), alcance: num(l.reach), cliques: num(l.clicks), ctr: num(l.ctr) / 100, cpc: num(l.cpc),
      carrinho: acao(l.actions, 'omni_add_to_cart', 'add_to_cart'), checkout: acao(l.actions, 'omni_initiated_checkout', 'initiate_checkout'),
      compras, valor, conversas, leads, roas: gasto ? valor / gasto : null, custoCompra: compras ? gasto / compras : null };
  }).sort((a, b) => b.gasto - a.gasto);
  const soma = k => campanhas.reduce((t, c) => t + c[k], 0);
  const total = { gasto: soma('gasto'), impressoes: soma('impressoes'), cliques: soma('cliques'), compras: soma('compras'), valor: soma('valor'), conversas: soma('conversas'), leads: soma('leads'), checkout: soma('checkout'), carrinho: soma('carrinho') };
  Object.assign(total, { roas: total.gasto ? total.valor / total.gasto : null, cpc: total.cliques ? total.gasto / total.cliques : 0, ctr: total.impressoes ? total.cliques / total.impressoes : 0,
    custoCompra: total.compras ? total.gasto / total.compras : null });
  // contexto: o que a loja vendeu de fato no período (todas as vendas e as do site da Saipos, onde o pixel mede)
  const s = new Date(de + 'T00:00:00').toISOString(), e = new Date(new Date(ate + 'T00:00:00').getTime() + 864e5).toISOString();
  const loja = db.prepare(`SELECT COALESCE(SUM(total), 0) r, COALESCE(SUM(CASE WHEN channel LIKE 'Site%' THEN total END), 0) site,
    SUM(CASE WHEN channel LIKE 'Site%' THEN 1 ELSE 0 END) pedidosSite FROM orders WHERE created_at >= ? AND created_at < ?`).get(s, e);
  return { periodo: { from: de, to: ate }, conta: { id: conta, nome: info.name || null, moeda: info.currency || 'BRL' }, campanhas, total,
    loja: { receita: loja.r, receitaSite: loja.site, pedidosSite: loja.pedidosSite || 0 } };
}

// ---------- Instagram ----------
async function contasInstagram() {
  const achados = new Map();
  const pag = await graph('/me/accounts', { fields: 'name,instagram_business_account{id,username}', limit: 50 }).catch(() => ({ data: [] }));
  for (const p of pag.data || []) if (p.instagram_business_account) achados.set(p.instagram_business_account.id, { id: p.instagram_business_account.id, usuario: p.instagram_business_account.username, pagina: p.name });
  const neg = await graph('/me/businesses', { fields: 'id,name', limit: 20 }).catch(() => ({ data: [] }));
  for (const b of neg.data || []) {
    const ig = await graph(`/${b.id}/instagram_accounts`, { fields: 'id,username', limit: 20 }).catch(() => ({ data: [] }));
    for (const i of ig.data || []) if (!achados.has(i.id)) achados.set(i.id, { id: i.id, usuario: i.username, pagina: null });
  }
  return [...achados.values()];
}

async function instagram() {
  const lista = await contasInstagram();
  if (!lista.length) throw new Error('O token da Meta não alcança nenhum Instagram. No Gerenciador de Negócios, em Usuários do sistema, atribua a Página do Facebook e a conta do Instagram da loja ao usuário do sistema.');
  const salvo = db.prepare("SELECT value FROM meta WHERE key = 'meta_instagram'").get()?.value;
  const ig = lista.find(i => i.id === salvo) || lista[0];
  const [perfil, midia] = await Promise.all([
    graph(`/${ig.id}`, { fields: 'username,name,followers_count,follows_count,media_count,biography' }),
    graph(`/${ig.id}/media`, { fields: 'caption,media_type,like_count,comments_count,timestamp,permalink,thumbnail_url,media_url', limit: 30 }),
  ]);
  const posts = (midia.data || []).map(m => ({ legenda: (m.caption || '').slice(0, 140), tipo: m.media_type, curtidas: num(m.like_count), comentarios: num(m.comments_count),
    data: m.timestamp, link: m.permalink, imagem: m.thumbnail_url || (m.media_type !== 'VIDEO' ? m.media_url : null) }));
  const seg = num(perfil.followers_count);
  const interacoes = p => p.curtidas + p.comentarios;
  const media = posts.length ? posts.reduce((t, p) => t + interacoes(p), 0) / posts.length : 0;
  const d30 = Date.now() - 30 * 864e5;
  return { contas: lista, conta: ig, perfil: { usuario: perfil.username, nome: perfil.name, seguidores: seg, seguindo: num(perfil.follows_count), posts: num(perfil.media_count) },
    resumo: { mediaInteracoes: media, engajamento: seg ? media / seg : 0, postsUltimos30: posts.filter(p => new Date(p.data).getTime() >= d30).length },
    posts: posts.map(p => ({ ...p, engajamento: seg ? interacoes(p) / seg : 0 })),
    melhores: [...posts].sort((a, b) => interacoes(b) - interacoes(a)).slice(0, 3) };
}
function escolherInstagram(id) {
  const s = String(id || '').replace(/\D/g, '');
  if (!s) throw new Error('Escolha uma conta do Instagram.');
  db.prepare("INSERT INTO meta (key, value) VALUES ('meta_instagram', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(s);
  return { ok: true };
}

module.exports = { pronto, contas, escolherConta, ads, instagram, escolherInstagram, contasInstagram };
