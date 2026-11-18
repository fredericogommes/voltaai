// Teste da integração com o Google sem rede: login (PKCE e state), status, validações. Banco temporário.
const path = require('path'), fs = require('fs'), os = require('os');
const root = path.resolve(process.argv[2]);
process.env.DB_PATH = path.join(os.tmpdir(), 'google_test.db'); fs.rmSync(process.env.DB_PATH, { force: true });
for (const k of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CUSTOMER_ID']) delete process.env[k];
const google = require(path.join(root, 'google.js'));
let falhas = 0;
const ok = (c, m) => { if (!c) falhas++; console.log((c ? 'OK   ' : 'FALHOU ') + m); };
const recusa = async (fn, m) => { try { await fn(); ok(false, m + ' (não recusou)'); } catch { ok(true, m); } };
(async () => {
  const tinhaToken = fs.existsSync(google.ARQ_TOKEN);
  ok(google.status().clientePronto === false, 'sem ID e chave do Google, o cliente não está pronto');
  await recusa(() => google.urlLogin(), 'sem credencial, o login avisa em vez de abrir o Google');
  process.env.GOOGLE_CLIENT_ID = 'teste.apps.googleusercontent.com'; process.env.GOOGLE_CLIENT_SECRET = 'segredo';
  const u = new URL(google.urlLogin());
  ok(u.host === 'accounts.google.com' && u.searchParams.get('code_challenge_method') === 'S256' && u.searchParams.get('code_challenge')?.length >= 43, 'login usa PKCE (S256)');
  ok(u.searchParams.get('access_type') === 'offline' && /business\.manage/.test(u.searchParams.get('scope')) && /adwords/.test(u.searchParams.get('scope')), 'pede acesso contínuo ao Meu Negócio e ao Ads');
  ok(/^http:\/\/localhost:\d+\/api\/google\/callback$/.test(u.searchParams.get('redirect_uri')), 'volta para o localhost');
  ok(new URL(google.urlLogin()).searchParams.get('state') !== u.searchParams.get('state'), 'cada login tem um state novo');
  await recusa(() => google.trocarCodigo('x', 'state-inventado'), 'recusa volta do Google com state desconhecido');
  if (!tinhaToken) ok(google.status().conectado === false, 'sem token salvo, aparece como não conectado');
  await recusa(() => google.ads('2026-01-01', '2026-01-31'), 'Ads sem token de desenvolvedor avisa');
  await recusa(() => google.escolherLocal({ conta: 'x', local: 'y' }), 'recusa perfil fora do formato do Google');
  ok(google.escolherLocal({ conta: 'accounts/123', local: 'locations/456', titulo: 'Loja Teste' }).local === 'locations/456', 'guarda o perfil escolhido');
  ok(google.status().local?.titulo === 'Loja Teste', 'o status mostra o perfil escolhido');
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
  process.exitCode = falhas ? 1 : 0;
})();
