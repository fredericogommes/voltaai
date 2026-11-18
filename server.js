const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');
const core = require('./core');
const ins = require('./insights');
const pdv = require('./pdv');
const campaigns = require('./campaigns');
const scheduler = require('./scheduler');
const flows = require('./flows');
const analytics = require('./analytics');
const products = require('./products');
const { MODE } = require('./senders');
const nuvem = require('./supabase-sync');
const config = require('./config');
const promo = require('./promocoes');
const canais = require('./canais');
const sugestoes = require('./sugestoes');
const qr = require('./qr');
const fidelidade = require('./fidelidade');
const google = require('./google');
const metaApi = require('./meta');
const brand = require('./brand');

// Atualiza os pontos do clube na página pública (e traz os e-mails cadastrados lá). Nunca trava o app.
async function publicarClube() {
  if (!nuvem.configured()) return;
  try { await fidelidade.publicar(); ins.setMeta('fidelidade_erro', ''); }
  catch (e) { ins.setMeta('fidelidade_erro', String(e.message || e)); console.error('Clube de fidelidade:', e.message || e); }
}

// Cópia no Supabase: roda ao abrir, depois de cada sincronização do PDV e a cada 6 horas.
// Nunca trava o app: se falhar, o erro fica em supabase_error e a próxima rodada tenta de novo.
async function copiarParaNuvem({ lancar = false } = {}) {
  if (!nuvem.configured()) { if (lancar) throw new Error('A cópia no Supabase não está configurada no arquivo .env.'); return; }
  try {
    const r = await nuvem.enviar();
    ins.setMeta('supabase_last', new Date().toISOString());
    ins.setMeta('supabase_result', JSON.stringify(r));
    ins.setMeta('supabase_error', '');
    publicarClube();                               // pontos novos chegam ao clube junto com a cópia
    return r;
  } catch (e) {
    ins.setMeta('supabase_error', String(e.message || e)); console.error('Cópia no Supabase falhou:', e.message || e);
    if (lancar) throw e;
  }
}

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
// O healthcheck do Coolify resolve localhost como IPv6. No Linux, "::" aceita
// tanto IPv6 quanto IPv4, mantendo o proxy e o healthcheck no mesmo listener.
const LISTEN_HOST = HOST === '0.0.0.0' ? '::' : HOST;
const PUBLIC = path.join(__dirname, 'public');
// Login: o mesmo Supabase Auth do PDV, definido em brand.json (auth) ou no .env (AUTH_SUPABASE_URL/KEY).
const SUPABASE_URL = brand.auth.supabaseUrl;
const SUPABASE_KEY = brand.auth.supabaseKey;

// O mesmo login do PDV protege o CRM. Além de validar o JWT, confirma
// que o usuário é dono de uma loja no schema do PDV (as RLS fazem esse filtro).
const authCache = new Map();
async function requireAdmin(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('Faça login para continuar.'), { status: 401 });
  if (!SUPABASE_URL || !SUPABASE_KEY) throw Object.assign(new Error('Login não configurado: preencha auth em brand.json ou AUTH_SUPABASE_URL e AUTH_SUPABASE_KEY no .env.'), { status: 401 });
  const cached = authCache.get(token);
  if (cached && cached.until > Date.now()) return cached.user;
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` };
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers });
  if (!userRes.ok) throw Object.assign(new Error('Sua sessão expirou. Entre novamente.'), { status: 401 });
  const user = await userRes.json();
  const storeRes = await fetch(`${SUPABASE_URL}/rest/v1/stores?select=id&limit=1`, {
    headers: { ...headers, 'Accept-Profile': brand.pdv.schema },
  });
  const stores = storeRes.ok ? await storeRes.json() : [];
  if (!Array.isArray(stores) || !stores.length) throw Object.assign(new Error(`Esta conta não administra uma loja no ${brand.pdv.nomeCompleto}.`), { status: 403 });
  authCache.set(token, { user, until: Date.now() + 60e3 });
  if (authCache.size > 100) authCache.clear();
  return user;
}

const json = (res, data, code = 200) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
};
const body = req => new Promise((ok, no) => {
  let b = '';
  req.on('data', d => { b += d; if (b.length > 20e6) req.destroy(); });
  req.on('end', () => ok(b));
  req.on('error', no);
});
const jbody = async req => JSON.parse((await body(req)) || '{}');

let syncing = null;
async function doSync(days) {
  if (syncing) return syncing;                       // evita duas sincronizacoes ao mesmo tempo
  syncing = (async () => {
    try {
      const r = await pdv.sync({ days });
      ins.setMeta('last_items_error', '');
      ins.setMeta('last_sync', new Date().toISOString());
      ins.setMeta('last_sync_result', JSON.stringify(r));
      ins.setMeta('last_sync_error', '');
      copiarParaNuvem();                             // sem await: a resposta da sincronização não espera a cópia
      return r;
    } catch (e) { ins.setMeta('last_sync_error', String(e.message || e)); throw e; }
    finally { syncing = null; }
  })();
  return syncing;
}

// ---- logo: guardado em public/logo.<ext> (so imagens, nunca SVG) ----------
const LOGO_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const logoFile = () => ['png', 'jpg', 'webp'].map(e => path.join(PUBLIC, 'logo.' + e)).find(f => fs.existsSync(f));
const logoUrl = () => { const f = logoFile(); return f ? `/${path.basename(f)}?v=${Math.round(fs.statSync(f).mtimeMs)}` : null; };
const rawBody = (req, max = 3e6) => new Promise((ok, no) => {
  const parts = []; let n = 0;
  req.on('data', d => { n += d.length; if (n > max) { no(new Error('A imagem é grande demais (máximo 3 MB).')); req.destroy(); } else parts.push(d); });
  req.on('end', () => ok(Buffer.concat(parts)));
  req.on('error', no);
});

const campaignRow = id => db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);

const routes = {
  'GET /api/meta': async () => ({
    mode: MODE, conversionDays: core.CONVERSION_WINDOW_DAYS,
    orders: { configured: pdv.configured(), source: brand.pdv.nomeCompleto, lastSync: ins.getMeta('last_sync'),
      result: JSON.parse(ins.getMeta('last_sync_result') || 'null'), error: ins.getMeta('last_sync_error') || null,
      running: !!syncing },
    whatsapp: { configured: !!(process.env.WA_TOKEN && process.env.WA_PHONE_ID), canSubmit: !!(process.env.WA_TOKEN && process.env.WA_WABA_ID && process.env.WA_APP_ID) },
    sms: { configured: canais.smsPronto() }, email: { configured: canais.emailPronto() },
    ai: { configured: !!process.env.ANTHROPIC_API_KEY },
    supabase: { configured: nuvem.configured(), last: ins.getMeta('supabase_last'), error: ins.getMeta('supabase_error') || null },
    scheduleDefaults: scheduler.defaults(),
    launcher: !!(process.env.CRM_LAUNCHER),
    logo: logoUrl(),
  }),
  'GET /api/performance': async (req, u) => ins.performance(u.searchParams.get('from'), u.searchParams.get('to')),
  'GET /api/messages': async (req, u) => ins.listMessages({
    channel: u.searchParams.get('channel'), status: u.searchParams.get('status'), q: u.searchParams.get('q') || '',
    limit: Math.min(+u.searchParams.get('limit') || 100, 500), offset: +u.searchParams.get('offset') || 0 }),
  'GET /api/audience': async () => ins.audience(),
  'GET /api/orders': async (req, u) => ins.listOrders({
    fromStr: u.searchParams.get('from'), toStr: u.searchParams.get('to'), q: u.searchParams.get('q') || '',
    limit: Math.min(+u.searchParams.get('limit') || 100, 500), offset: +u.searchParams.get('offset') || 0 }),
  'POST /api/logo': async req => {
    const ext = LOGO_TYPES[(req.headers['content-type'] || '').split(';')[0]];
    if (!ext) throw new Error('Use uma imagem PNG, JPG ou WebP.');
    const buf = await rawBody(req);
    if (buf.length < 100) throw new Error('Arquivo de imagem inválido.');
    for (const e of ['png', 'jpg', 'webp']) fs.rmSync(path.join(PUBLIC, 'logo.' + e), { force: true });
    fs.writeFileSync(path.join(PUBLIC, 'logo.' + ext), buf);
    return { logo: logoUrl() };
  },
  'POST /api/logo/remove': async () => {
    for (const e of ['png', 'jpg', 'webp']) fs.rmSync(path.join(PUBLIC, 'logo.' + e), { force: true });
    return { logo: null };
  },
  'GET /api/dashboard': async (req, u) => ins.dashboard(u.searchParams.get('from'), u.searchParams.get('to')),
  'GET /api/customers': async (req, u) => ins.listCustomers({
    seg: u.searchParams.get('seg'), q: u.searchParams.get('q') || '', sort: u.searchParams.get('sort') || 'total',
    limit: Math.min(+u.searchParams.get('limit') || 100, 500), offset: +u.searchParams.get('offset') || 0,
    optout: u.searchParams.get('optout') === '1' }),
  'GET /api/customer': async (req, u) => ins.customerDetail(+u.searchParams.get('id')),
  // ---- produtos (itens das vendas) ----
  'GET /api/produtos': async (req, u) => products.ranking({ from: u.searchParams.get('from'), to: u.searchParams.get('to'), metric: u.searchParams.get('metric') || 'qtd', q: u.searchParams.get('q') || '' }),
  'GET /api/produtos/escolhas': async (req, u) => products.escolhas({ from: u.searchParams.get('from'), to: u.searchParams.get('to'), q: u.searchParams.get('q') || '' }),
  'POST /api/pdv/sync-items': async req => { const d = Math.min(+(await jbody(req)).days || 0, 730) || undefined; return pdv.sync({ days: d }); },
  // ---- analises de clientes ----
  'GET /api/analises/rfv': async () => analytics.rfv(),
  'GET /api/analises/tempo': async () => analytics.tempoEntreCompras(),
  'GET /api/analises/coortes': async () => analytics.coortes(),
  'GET /api/analises/recuperados': async (req, u) => analytics.recuperados(u.searchParams.get('from'), u.searchParams.get('to'), +u.searchParams.get('gap') || 90),
  'GET /api/analises/evolucao': async () => analytics.evolucao(),
  'GET /api/customers/export': async () => ({ __csv: analytics.exportarClientes(), nome: `clientes-${brand.produto.slug}-${new Date().toISOString().slice(0, 10)}.csv` }),
  // ---- fluxos de automacao ----
  'GET /api/flows': async () => flows.list(),
  'GET /api/flow': async (req, u) => flows.get(+u.searchParams.get('id')),
  'POST /api/flows': async req => flows.save(await jbody(req)),
  'POST /api/flows/preview': async req => flows.previewDraft(await jbody(req)),
  'POST /api/flows/status': async req => { const { id, status } = await jbody(req); return flows.setStatus(+id, status); },
  'POST /api/flows/delete': async req => { flows.remove(+(await jbody(req)).id); return { ok: true }; },
  'GET /api/campaigns': async () => core.campaignStats().filter(c => !campaignRow(c.id).flow_id).map(c => {
    const row = campaignRow(c.id), ads = core.parseAds(row);
    return { ...row, ...c, ads, thumb: ads.find(a => a.media)?.media || null, prontos: core.eligible(row).length,
      auto: scheduler.info(row), bloqueio: scheduler.bloqueio(row),
      templates: db.prepare('SELECT variant, status FROM templates WHERE campaign_id = ?').all(c.id) };
  }),
  'GET /api/campaign': async (req, u) => ({ ...campaigns.get(+u.searchParams.get('id')), prontos: core.eligible(campaignRow(+u.searchParams.get('id'))).length }),
  'POST /api/campaigns': async req => campaigns.save(await jbody(req)),           // cria ou atualiza (se vier id)
  'POST /api/campaigns/auto': async req => { const { id, on } = await jbody(req); return campaigns.setAuto(+id, !!on); },
  'POST /api/whatsapp/check': async () => require('./whatsapp').diagnose(MODE),
  'POST /api/campaigns/test': async req => { const { id, phone } = await jbody(req); return campaigns.sendTest(+id, phone); },
  // abre o .env no Bloco de Notas (so no Windows, so este arquivo) para a pessoa colar os dados sozinha
  'POST /api/open-env': async () => {
    if (process.platform !== 'win32') throw new Error('Abra o arquivo .env da pasta do programa com um editor de texto.');
    require('node:child_process').spawn('notepad.exe', [path.join(__dirname, '.env')], { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  },
  // reinicia o programa (so funciona quando aberto pelo atalho "Iniciar CRM", que o liga de novo)
  'POST /api/restart': async () => {
    if (!(process.env.CRM_LAUNCHER)) throw new Error(`Feche o programa e abra de novo pelo atalho “Iniciar ${brand.produto.nomeCompleto}”.`);
    setTimeout(() => process.exit(0), 400);
    return { ok: true };
  },
  'POST /api/campaigns/publish': async req => campaigns.publish((await jbody(req)).id),
  'POST /api/campaigns/refresh': async req => campaigns.refreshTemplates((await jbody(req)).id),
  'POST /api/campaigns/delete': async req => {
    const { id } = await jbody(req);
    if (db.prepare('SELECT 1 FROM messages WHERE campaign_id = ? LIMIT 1').get(id)) throw new Error('Esta campanha já enviou mensagens, então não dá para apagar. Pause-a no lugar.');
    db.prepare('DELETE FROM templates WHERE campaign_id = ?').run(id); db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
    return { ok: true };
  },
  'GET /api/media': async () => campaigns.listMedia(),
  'POST /api/media': async (req, u) => {
    const ct = (req.headers['content-type'] || '').split(';')[0];
    if (!['image/png', 'image/jpeg'].includes(ct)) throw new Error('Use uma imagem JPG ou PNG.');
    return campaigns.saveMedia(await rawBody(req, 5.5e6), u.searchParams.get('name'));
  },
  'POST /api/media/delete': async req => { campaigns.deleteMedia((await jbody(req)).file); return { ok: true }; },
  'POST /api/ai/copy': async req => campaigns.aiCopy(await jbody(req)),
  'POST /api/campaigns/preview': async req => ins.preview(await jbody(req)),
  'POST /api/campaigns/run': async req => core.runCampaign((await jbody(req)).id),
  'POST /api/campaigns/toggle': async req => {
    db.prepare('UPDATE campaigns SET active = 1 - active WHERE id = ?').run((await jbody(req)).id);
    return { ok: true };
  },
  'POST /api/import/csv': async req => core.importOrders(core.parseCsv(await body(req))),
  'POST /api/supabase/push': async () => copiarParaNuvem({ lancar: true }),
  'POST /api/pdv/sync': async req => doSync(Math.min(+(await jbody(req)).days || 0, 730) || undefined),
  'POST /api/optout': async req => {
    const { id, value = 1 } = await jbody(req);
    db.prepare('UPDATE customers SET opt_out = ? WHERE id = ?').run(value ? 1 : 0, id);
    return { ok: true };
  },
  // Ajustes: faixas do RFV, janela de atribuicao por grupo e clientes fora das listas
  'GET /api/ajustes': async () => ({
    rfv: config.rfv(), rfvPadrao: config.RFV_PADRAO, janela: config.janela(), janelaPadrao: config.JANELA_PADRAO,
    custos: config.custos(), custosPadrao: config.CUSTO_PADRAO,
    grupos: analytics.rfv().grupos.map(g => ({ nome: g.nome, clientes: g.clientes })),
    excluidos: db.prepare('SELECT id, name, phone FROM customers WHERE excluded = 1 ORDER BY name').all(),
  }),
  'POST /api/ajustes/rfv': async req => config.salvarRfv(await jbody(req)),
  'POST /api/ajustes/janela': async req => config.salvarJanela(await jbody(req)),
  'POST /api/ajustes/custos': async req => config.salvarCustos(await jbody(req)),
  'GET /api/meta-ads': async (req, u) => metaApi.ads(u.searchParams.get('from'), u.searchParams.get('to')),
  'GET /api/meta-ads/contas': async () => metaApi.contas(),
  'POST /api/meta-ads/conta': async req => metaApi.escolherConta((await jbody(req)).id),
  'GET /api/instagram': async () => metaApi.instagram(),
  'POST /api/instagram/conta': async req => metaApi.escolherInstagram((await jbody(req)).id),
  'GET /api/google': async () => google.status(),
  'GET /api/google/login': async () => ({ url: google.urlLogin() }),
  'GET /api/google/callback': async (req, u) => {
    if (u.searchParams.get('error')) throw new Error(u.searchParams.get('error') === 'access_denied' ? 'Você cancelou o login no Google.' : 'O Google recusou: ' + u.searchParams.get('error'));
    await google.trocarCodigo(u.searchParams.get('code'), u.searchParams.get('state'));
    return { __redirect: '/#/conexoes?google=ok' };
  },
  'POST /api/google/desconectar': async () => google.desconectar(),
  'GET /api/google/locais': async () => google.locais(),
  'POST /api/google/local': async req => google.escolherLocal(await jbody(req)),
  'GET /api/google/avaliacoes': async () => google.avaliacoes(),
  'GET /api/google/ads': async (req, u) => google.ads(u.searchParams.get('from'), u.searchParams.get('to')),
  'GET /api/qr': async () => qr.listar(),
  'POST /api/qr': async req => qr.criar(await jbody(req)),
  'POST /api/qr/status': async req => { const b = await jbody(req); return qr.alterar(String(b.code || ''), { active: b.active }); },
  'POST /api/qr/apagar': async req => qr.apagar(String((await jbody(req)).code || '')),
  'GET /api/fidelidade': async () => ({ ...fidelidade.resumo(), erro: ins.getMeta('fidelidade_erro') || null }),
  'POST /api/fidelidade': async req => { const c = fidelidade.salvar(await jbody(req)); await publicarClube(); return c; },
  'GET /api/fidelidade/buscar': async (req, u) => fidelidade.buscar(u.searchParams.get('q')),
  'POST /api/fidelidade/resgatar': async req => { const r = fidelidade.resgatar(await jbody(req)); publicarClube(); return r; },
  'POST /api/fidelidade/desfazer': async req => { const r = fidelidade.desfazerResgate((await jbody(req)).id); publicarClube(); return r; },
  'POST /api/fidelidade/publicar': async () => { await fidelidade.publicar(); return fidelidade.resumo(); },
  'GET /api/sugestoes': async () => sugestoes.listar(),
  'POST /api/sugestoes/usar': async req => sugestoes.usar(String((await jbody(req)).id || '')),
  'POST /api/canal/verificar': async req => canais.verificar((await jbody(req)).canal === 'email' ? 'email' : 'sms'),
  'GET /api/promocoes': async (req, u) => promo.promocoes(u.searchParams.get('from'), u.searchParams.get('to'), u.searchParams.get('canal')),
  'GET /api/bairros': async (req, u) => promo.bairros(u.searchParams.get('from'), u.searchParams.get('to')),
  'POST /api/excluir': async req => {
    const { id, value = 1 } = await jbody(req);
    const r = db.prepare('UPDATE customers SET excluded = ? WHERE id = ?').run(value ? 1 : 0, +id);
    if (!r.changes) throw new Error('Cliente não encontrado.');
    return { ok: true };
  },
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/health') {
    try {
      const counts = Object.fromEntries(['customers', 'orders', 'campaigns', 'order_items', 'item_choices']
        .map(table => [table, Number(db.prepare(`SELECT count(*) n FROM ${table}`).get().n)]));
      const lastSync = ins.getMeta('last_sync') || null;
      const syncError = ins.getMeta('last_sync_error') || '';
      return json(res, {
        ok: true,
        counts,
        pdv: {
          configured: pdv.configured(),
          lastSync,
          healthy: pdv.configured() && !!lastSync && !syncError,
        },
      });
    } catch (e) { return json(res, { ok: false }, 503); }
  }
  // marca: cores/fontes e dados públicos gerados de brand.json
  if (req.method === 'GET' && (url.pathname === '/brand.css' || url.pathname === '/brand.js')) {
    const css = url.pathname === '/brand.css';
    res.writeHead(200, { 'Content-Type': (css ? 'text/css' : 'text/javascript') + '; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(css ? brand.css() : brand.js());
  }
  const handler = routes[`${req.method} ${url.pathname}`];
  if (handler) {
    try {
      // O retorno do OAuth do Google não carrega o JWT do navegador; o state
      // temporário validado por google.trocarCodigo protege especificamente essa rota.
      if (url.pathname !== '/api/google/callback') await requireAdmin(req);
      const out = await handler(req, url);
      if (out && out.__csv !== undefined) {                       // download de planilha
        res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${out.nome}"` });
        return res.end(out.__csv);
      }
      if (out && out.__redirect) { res.writeHead(302, { Location: out.__redirect }); return res.end(); }   // login do Google
      json(res, out);
    }
    catch (e) {
      if (url.pathname === '/api/google/callback') {                 // volta do Google com erro: mostra na tela, não em JSON
        res.writeHead(302, { Location: '/#/conexoes?google_erro=' + encodeURIComponent(String(e.message || e).slice(0, 300)) }); return res.end();
      }
      json(res, { error: String(e.message || e) }, e.status || 400);
    }
    return;
  }
  const file = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('Nao encontrado');
  }
  if (path.basename(file) === 'index.html') {                     // a página principal leva o nome, o favicon e as fontes da marca
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(brand.html(fs.readFileSync(file, 'utf8')));
  }
  res.writeHead(200, { 'Content-Type': (MIME[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});

// Sincroniza com o PDV a cada minuto. A consulta é incremental e idempotente.
setInterval(async () => {
  if (!pdv.configured()) return;
  const last = ins.getMeta('last_sync');
  if (!last || Date.now() - new Date(last) > 55e3) { try { await doSync(); } catch { /* erro fica em last_sync_error */ } }
}, 60e3);

// Em produção, HOST=0.0.0.0 permite que a hospedagem encaminhe o tráfego.
server.listen(PORT, LISTEN_HOST, () => {
  console.log(`${brand.produto.nomeCompleto} em http://${HOST}:${PORT}  (envio: ${MODE})`);
  scheduler.start();   // envio automatico (so age com SEND_MODE=live)
  flows.start();       // fluxos de automacao (idem)
  if (nuvem.configured()) { console.log('Cópia no Supabase: ligada'); setTimeout(copiarParaNuvem, 10e3); setInterval(copiarParaNuvem, 6 * 3600e3); }
});
