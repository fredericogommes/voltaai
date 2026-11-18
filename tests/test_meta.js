// Teste do módulo da Meta com respostas falsas da Graph API (sem rede): somas, ROAS, compras e avisos.
const path = require('path'), fs = require('fs'), os = require('os');
const root = path.resolve(process.argv[2]);
process.env.DB_PATH = path.join(os.tmpdir(), 'meta_test.db'); fs.rmSync(process.env.DB_PATH, { force: true });
process.env.WA_TOKEN = 'token-falso'; delete process.env.META_TOKEN; delete process.env.META_AD_ACCOUNT_ID;
let falhas = 0;
const ok = (c, m) => { if (!c) falhas++; console.log((c ? 'OK   ' : 'FALHOU ') + m); };
const RESP = {
  '/me/adaccounts': { data: [{ name: 'CA - 02', account_id: '111', currency: 'BRL', account_status: 1 }] },
  '/act_111/insights': { data: [
    { campaign_id: '1', campaign_name: 'Site', objective: 'OUTCOME_SALES', spend: '100', impressions: '5000', reach: '3000', clicks: '200', ctr: '4', cpc: '0.5',
      actions: [{ action_type: 'omni_purchase', value: '5' }, { action_type: 'omni_initiated_checkout', value: '12' }], action_values: [{ action_type: 'omni_purchase', value: '400' }] },
    { campaign_id: '2', campaign_name: 'WhatsApp', objective: 'OUTCOME_ENGAGEMENT', spend: '50', impressions: '2000', reach: '1500', clicks: '80', ctr: '4', cpc: '0.62',
      actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '9' }] }] },
  '/act_111/campaigns': { data: [{ id: '1', effective_status: 'ACTIVE' }, { id: '2', effective_status: 'PAUSED' }] },
  '/act_111': { name: 'CA - 02', currency: 'BRL' },
  '/me/accounts': { data: [] }, '/me/businesses': { data: [] },
};
global.fetch = async url => { const p = new URL(url).pathname.replace(/^\/v[\d.]+/, ''); const body = RESP[p] || { error: { message: 'não esperado ' + p } };
  return { ok: !body.error, status: body.error ? 400 : 200, json: async () => body }; };
const meta = require(path.join(root, 'meta.js'));
(async () => {
  const d = await meta.ads('2026-10-01', '2026-10-31');
  ok(d.conta.id === '111', 'usa a primeira conta ativa que o token alcança');
  ok(d.campanhas[0].nome === 'Site' && d.campanhas[0].status === 'ACTIVE' && d.campanhas[0].objetivo === 'Vendas', 'campanha com situação e objetivo traduzido');
  ok(d.total.gasto === 150 && d.total.compras === 5 && d.total.valor === 400, 'soma investimento, compras e vendas atribuídas');
  ok(Math.abs(d.total.roas - 400 / 150) < 1e-9, 'ROAS = vendas atribuídas ÷ investimento');
  ok(d.campanhas[0].custoCompra === 20, 'custo por compra = investimento ÷ compras');
  ok(d.total.conversas === 9 && d.campanhas[1].roas === 0, 'conta as conversas iniciadas; campanha sem venda tem ROAS 0');
  ok(Math.abs(d.campanhas[0].ctr - 0.04) < 1e-9, 'CTR da Meta vem em %, vira fração');
  let msg = ''; try { await meta.instagram(); } catch (e) { msg = e.message; }
  ok(/atribua a Página/.test(msg), 'sem Instagram atribuído, explica o que fazer');
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
  process.exitCode = falhas ? 1 : 0;
})();
