// Verificador da conexao com a Meta + teste para o proprio numero, contra uma Meta de mentira.
const path = require('path'), fs = require('fs'), os = require('os'), http = require('http');
const root = path.resolve(process.argv[2]);
process.env.DB_PATH = path.join(os.tmpdir(), 'diag_test.db'); fs.rmSync(process.env.DB_PATH, { force: true });
process.env.GRAPH_BASE = 'http://127.0.0.1:4571/v1';
for (const k of ['WA_TOKEN', 'WA_PHONE_ID', 'WA_WABA_ID', 'WA_APP_ID', 'SEND_MODE']) delete process.env[k];

let cenario = 'ok'; const msgs = [];
const erro = (res, code, message) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { code, message } })); };
const mock = http.createServer((req, res) => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => {
  const u = req.url, auth = req.headers.authorization;
  if (u.includes('/messages')) { msgs.push(JSON.parse(Buffer.concat(c))); res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{}'); }
  if (cenario === 'token' || auth === 'Bearer vencido') return erro(res, 190, 'Error validating access token: Session has expired');
  const ok = o => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.startsWith('/v1/me?')) return ok({ id: '1', name: 'Usuario Sistema' });
  if (u.includes('/PHONE_OK')) return cenario === 'phone' ? erro(res, 100, 'Unsupported get request') : ok({ display_phone_number: '+55 24 99999-9999', verified_name: 'Loja Teste', quality_rating: 'GREEN' });
  if (u.includes('/PHONE_RUIM')) return erro(res, 100, 'Unsupported get request');
  if (u.includes('/WABA_OK')) return cenario === 'waba' ? erro(res, 200, '(#200) Requires whatsapp_business_management permission') : ok({ data: [] });
  if (u.includes('/APP_OK')) return ok({ name: 'App Loja Teste' });
  res.writeHead(404); res.end('{}'); }); });

mock.listen(4571, async () => {
  const ok = (c, m) => console.log((c ? 'OK   ' : 'FALHOU ') + m);
  const wa = require(path.join(root, 'whatsapp.js')), camp = require(path.join(root, 'campaigns.js')), db = require(path.join(root, 'db.js'));
  const set = o => Object.assign(process.env, o);
  const ver = async (mode = 'dry') => (await wa.diagnose(mode));
  const item = (r, id) => r.itens.find(i => i.id === id);

  let r = await ver(); ok(!r.pronto && !item(r, 'dados').ok && /WA_TOKEN/.test(item(r, 'dados').detalhe) && r.itens.length === 2, 'sem nada no .env: lista o que falta e nao chama a Meta');
  set({ WA_TOKEN: 'bom', WA_PHONE_ID: 'PHONE_OK', WA_WABA_ID: 'WABA_OK', WA_APP_ID: 'APP_OK' });
  r = await ver(); ok(r.pronto && item(r, 'numero').detalhe.includes('Loja Teste') && item(r, 'modo').aviso, 'tudo certo: pronto, mostra o nome do numero; envio real aparece como aviso');
  console.log('     ', r.itens.map(i => `${i.ok ? '✓' : '✗'} ${i.titulo}: ${i.detalhe}`).join('\n      '));
  set({ WA_TOKEN: 'vencido' }); r = await ver(); ok(!r.pronto && !item(r, 'token').ok && /expirou/.test(item(r, 'token').detalhe) && !item(r, 'numero'), 'token vencido: explica em portugues e nao testa o resto');
  set({ WA_TOKEN: 'bom', WA_PHONE_ID: 'PHONE_RUIM' }); r = await ver(); console.log('      ', JSON.stringify(item(r,'numero')));
  ok(!r.pronto && /ID/.test(item(r, 'numero').detalhe) && /ID do n/.test(item(r, 'numero').ajuda), 'ID do numero errado: explica a diferenca entre ID e numero');
  set({ WA_PHONE_ID: 'PHONE_OK', WA_WABA_ID: 'WABA_OK' }); cenario = 'waba'; r = await ver(); console.log('      ', JSON.stringify(item(r,'waba'))); ok(!item(r, 'waba').ok && /whatsapp_business_management/.test(item(r, 'waba').detalhe), 'falta permissao na conta: cita as permissoes necessarias');
  cenario = 'ok'; set({ WA_APP_ID: 'APP_RUIM' }); r = await ver('live'); ok(item(r, 'app').aviso && !item(r, 'app').ok && r.pronto, 'app errado: so avisa (nao bloqueia o pronto)');
  ok(item(r, 'modo').ok, 'modo live reconhecido');

  // teste para o proprio numero
  core = require(path.join(root, 'core.js'));
  const c1 = camp.save({ name: 'T', channel: 'whatsapp', min_days: 30, max_days: 90, min_orders: 1, cooldown_days: 30, ads: [{ body: 'Oi [nome_cliente], vem pedir hoje!' }] });
  await camp.publish(c1.id);                                          // dry/simulado
  let t = await camp.sendTest(c1.id, '(24) 99988-7766'); ok(t.simulado === true && msgs.length === 0, 'modo teste: simula e nao envia nada');
  try { await camp.sendTest(c1.id, '123'); ok(false, 'telefone invalido'); } catch (e) { ok(true, 'recusa telefone invalido: ' + e.message); }
  ok(db.prepare('SELECT COUNT(*) n FROM messages').get().n === 0, 'o teste nao grava mensagem nem entra nas estatisticas');
  console.log('\n(o envio de teste em modo real usa o mesmo caminho dos envios reais, ja testado em test_editor.js)');
  mock.close(); process.exit(0);
});
