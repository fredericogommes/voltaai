// Teste do motor de fluxos: relogio simulado, banco temporario, Meta de mentira.
const path = require('path'), fs = require('fs'), os = require('os'), http = require('http');
const root = path.resolve(process.argv[2]);
process.env.DB_PATH = path.join(os.tmpdir(), 'flows_test.db'); fs.rmSync(process.env.DB_PATH, { force: true });
process.env.SEND_MODE = 'live';
Object.assign(process.env, { WA_TOKEN: 'tok', WA_PHONE_ID: 'PHONE1', WA_WABA_ID: 'W', WA_APP_ID: 'A', GRAPH_BASE: 'http://127.0.0.1:4570/v1' });

const enviadas = [];
const mock = http.createServer((req, res) => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => {
  if (req.url.includes('/PHONE1/messages')) enviadas.push(JSON.parse(Buffer.concat(c)));
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(req.url.includes('message_templates') ? '{"id":"T1","status":"PENDING"}' : '{}'); }); });

mock.listen(4570, async () => {
  const db = require(path.join(root, 'db.js')), core = require(path.join(root, 'core.js')), fl = require(path.join(root, 'flows.js'));
  const ok = (c, m) => console.log((c ? 'OK   ' : 'FALHOU ') + m);
  const dt = (d, h, mi = 0) => new Date(2026, 10, d, h, mi);                    // novembro de 2026 (dia 10 = terca)
  const antes = n => new Date(Date.now() - n * 864e5).toISOString();
  const phone = i => '2499' + String(7100000 + i * 17);
  const cli = (i, created, extra = {}) => core.importOrders([{ external_id: `c${i}-${created}`, name: 'Cliente ' + i, phone: phone(i), total: 40, created_at: created, ...extra }]);
  const nomeDe = i => db.prepare('SELECT id FROM customers WHERE phone = ?').get('55' + phone(i))?.id;

  // base antiga (nenhum desses deve entrar num fluxo de "pedido novo")
  for (let i = 1; i <= 5; i++) cli(i, antes(40));

  // ===== fluxo 1: agradecimento (pedido novo -> espera 1 dia -> mensagem) =====
  const f1 = fl.save({ name: 'Agradecimento', trigger: { tipo: 'pedido_novo' }, exit_on_order: true, reentry_days: 30,
    steps: [{ type: 'esperar', valor: 1, unidade: 'dias' }, { type: 'enviar', texto: 'Obrigado, [nome_cliente]! Gostou dos salgados?' }] });
  const camp = db.prepare('SELECT * FROM campaigns WHERE flow_id = ?').all(f1.id);
  ok(camp.length === 1 && camp[0].status === 'rascunho', 'a mensagem do fluxo virou uma campanha escondida em rascunho');
  try { fl.setStatus(f1.id, 'ativo'); ok(false, 'nao deveria ativar com mensagem em rascunho'); } catch (e) { ok(true, 'nao ativa com mensagem em rascunho: ' + e.message); }
  db.prepare("UPDATE campaigns SET status='publicada' WHERE flow_id = ?").run(f1.id);
  try { fl.setStatus(f1.id, 'ativo'); ok(false, 'nao deveria ativar sem aprovacao da Meta'); } catch (e) { ok(true, 'nao ativa sem aprovacao da Meta: ' + e.message); }
  db.prepare("INSERT INTO templates (campaign_id, variant, name, status) VALUES (?, 'A', 'tpl', 'APPROVED')").run(camp[0].id);
  fl.setStatus(f1.id, 'ativo'); ok(fl.row(f1.id).status === 'ativo', 'ativa depois de aprovada');

  let r = await fl.tick(dt(10, 17)); ok(r[0].entraram === 0, 'pedidos antigos NAO entram (so os novos depois de ativar)');
  // dois pedidos novos: clientes 1 e 2
  cli(1, '2026-11-10T19:00:00.000Z'); cli(2, '2026-11-10T19:05:00.000Z');
  r = await fl.tick(dt(10, 17, 1)); ok(r[0].entraram === 2 && r[0].enviados === 0, 'tick: 2 clientes entram e comecam a esperar (nada enviado ainda)');
  r = await fl.tick(dt(10, 19)); ok(r[0].enviados === 0, '2 horas depois: ainda esperando, nada enviado');

  // cliente 2 pede descadastro durante a espera; cliente 1 pede de novo
  db.prepare('UPDATE customers SET opt_out = 1 WHERE id = ?').run(nomeDe(2));
  cli(1, '2026-11-10T23:00:00.000Z', { external_id: 'novo-pedido-1' });
  r = await fl.tick(dt(11, 17, 5)); ok(r[0].enviados === 0, 'cliente descadastrado nao recebe');
  ok(db.prepare("SELECT exit_reason FROM flow_runs WHERE customer_id = ?").get(nomeDe(2)).exit_reason === 'descadastrou', 'saiu do fluxo por descadastro');
  r = await fl.tick(dt(11, 17, 6)); ok(r[0].enviados === 0, 'cliente 1 pediu de novo: nao recebe o agradecimento');
  ok(db.prepare("SELECT exit_reason FROM flow_runs WHERE customer_id = ?").get(nomeDe(1)).exit_reason === 'pediu de novo', 'saiu do fluxo porque pediu de novo');

  // cliente 3 entra, espera 1 dia, recebe dentro da janela; fora da janela adia
  cli(3, '2026-11-11T20:00:00.000Z');
  r = await fl.tick(dt(11, 17, 10)); ok(r[0].entraram === 1, 'cliente 3 entra');
  r = await fl.tick(dt(12, 22, 0)); ok(r[0].enviados === 0, 'passou 1 dia, mas 22h esta fora da janela (16h-21h): adia');
  const prox = db.prepare('SELECT next_at FROM flow_runs WHERE customer_id = ?').get(nomeDe(3)).next_at;
  ok(new Date(prox).getDate() === 13 && new Date(prox).getHours() === 16, 'proximo envio marcado para sexta 16h (' + new Date(prox).toLocaleString('pt-BR') + ')');
  r = await fl.tick(dt(13, 16, 5)); ok(r[0].enviados === 1, 'sexta 16h05 envia a mensagem');
  ok(enviadas.length === 1 && enviadas[0].to === '55' + phone(3) && enviadas[0].template.components.some(c => c.parameters?.[0]?.text === 'Cliente'), 'enviou para o cliente certo, com o primeiro nome');
  r = await fl.tick(dt(13, 16, 6)); ok(r[0].enviados === 0, 'sem segundo envio para o mesmo cliente');
  ok(fl.get(f1.id).stats.concluidos === 1, 'estatisticas: 1 concluido, ' + JSON.stringify((({ entraram, andamento, concluidos, sairam }) => ({ entraram, andamento, concluidos, sairam }))(fl.get(f1.id).stats)));

  // reentrada: cliente 3 pede de novo logo apos concluir -> dentro de 30 dias nao reentra
  cli(3, '2026-11-12T22:00:00.000Z', { external_id: 'novo-3' });
  r = await fl.tick(dt(13, 16, 10)); ok(r[0].entraram === 0, 'cliente 3 pediu de novo dentro de 30 dias: nao reentra');

  // editar etapas de fluxo ativo / apagar
  try { fl.save({ id: f1.id, name: 'Agradecimento', trigger: { tipo: 'pedido_novo' }, steps: [{ type: 'enviar', campaign_id: camp[0].id }] }); ok(false, 'nao deveria editar etapas ativas'); } catch (e) { ok(true, 'etapas de fluxo ativo nao mudam: ' + e.message); }
  try { fl.remove(f1.id); ok(false, 'nao deveria apagar ativo'); } catch (e) { ok(true, 'fluxo ativo nao e apagado: ' + e.message); }
  fl.setStatus(f1.id, 'pausado');

  // ===== fluxo 2: sem pedir ha 30 dias =====
  for (let i = 10; i <= 15; i++) cli(i, antes(i === 10 ? 30 : i === 11 ? 31 : i === 12 ? 32 : i === 13 ? 33 : i === 14 ? 60 : 5));
  const f2 = fl.save({ name: 'Sentimos sua falta', trigger: { tipo: 'sem_pedir', dias: 30 }, exit_on_order: true, reentry_days: 60, steps: [{ type: 'enviar', texto: 'Oi [nome_cliente], sumiu! Volte hoje.' }] });
  const c2 = db.prepare('SELECT id FROM campaigns WHERE flow_id = ?').get(f2.id).id;
  db.prepare("UPDATE campaigns SET status='publicada' WHERE id = ?").run(c2); db.prepare("INSERT INTO templates (campaign_id, variant, name, status) VALUES (?, 'A', 't2', 'APPROVED')").run(c2);
  ok(fl.previewDraft({ trigger: { tipo: 'sem_pedir', dias: 30 }, reentry_days: 60 }).quantos === 3, 'previa: entrariam 3 clientes (30, 31 e 32 dias; 33 e 60 ficam de fora)');
  fl.setStatus(f2.id, 'ativo'); enviadas.length = 0;
  r = await fl.tick(dt(13, 17)); const t2 = r.find(x => x.id === f2.id);
  ok(t2.entraram === 3 && t2.enviados === 3, `sem pedir 30 dias: entraram ${t2.entraram} e enviou ${t2.enviados} no mesmo minuto (sem etapa de espera)`);
  r = await fl.tick(dt(13, 17, 2)); ok((r.find(x => x.id === f2.id)?.entraram || 0) === 0, 'nao entram de novo');
  fl.setStatus(f2.id, 'pausado');

  // ===== fluxo 3: primeiro pedido e aniversario =====
  const f3 = fl.save({ name: 'Boas-vindas', trigger: { tipo: 'primeiro_pedido' }, steps: [{ type: 'enviar', texto: 'Bem-vindo, [nome_cliente]! Que bom ter voce.' }] });
  const c3 = db.prepare('SELECT id FROM campaigns WHERE flow_id = ?').get(f3.id).id;
  db.prepare("UPDATE campaigns SET status='publicada' WHERE id = ?").run(c3); db.prepare("INSERT INTO templates (campaign_id, variant, name, status) VALUES (?, 'A', 't3', 'APPROVED')").run(c3);
  fl.setStatus(f3.id, 'ativo');
  cli(20, '2026-11-13T21:00:00.000Z');                 // cliente novo (1o pedido)
  cli(4, '2026-11-13T21:10:00.000Z', { external_id: 'x4' });   // cliente antigo (nao e o 1o)
  r = await fl.tick(dt(13, 17, 5)); ok(r.find(x => x.id === f3.id).entraram === 1, 'primeiro pedido: so o cliente novo entra');
  fl.setStatus(f3.id, 'pausado');

  const f4 = fl.save({ name: 'Aniversario', trigger: { tipo: 'aniversario' }, steps: [{ type: 'enviar', texto: 'Parabens, [nome_cliente]! Hoje o dia e seu.' }] });
  const c4 = db.prepare('SELECT id FROM campaigns WHERE flow_id = ?').get(f4.id).id;
  db.prepare("UPDATE campaigns SET status='publicada' WHERE id = ?").run(c4); db.prepare("INSERT INTO templates (campaign_id, variant, name, status) VALUES (?, 'A', 't4', 'APPROVED')").run(c4);
  db.prepare("UPDATE customers SET birth_date = '1990-11-14' WHERE id = ?").run(nomeDe(5));
  db.prepare("UPDATE customers SET birth_date = '1990-11-15' WHERE id = ?").run(nomeDe(1));
  fl.setStatus(f4.id, 'ativo'); enviadas.length = 0;
  r = await fl.tick(dt(14, 17)); const t4 = r.find(x => x.id === f4.id); ok(t4.entraram === 1 && t4.enviados === 1, `aniversario: so quem faz anos hoje entra (${t4.entraram}) e recebe (${t4.enviados})`);

  // ===== validacoes =====
  for (const [nome, d] of [['sem etapa de envio', { name: 'x', trigger: { tipo: 'pedido_novo' }, steps: [{ type: 'esperar', valor: 1, unidade: 'dias' }] }],
    ['espera invalida', { name: 'x', trigger: { tipo: 'pedido_novo' }, steps: [{ type: 'esperar', valor: 0, unidade: 'dias' }, { type: 'enviar', texto: 'a' }] }],
    ['sem dias', { name: 'x', trigger: { tipo: 'sem_pedir' }, steps: [{ type: 'enviar', texto: 'a' }] }], ['sem nome', { name: ' ', trigger: { tipo: 'pedido_novo' }, steps: [{ type: 'enviar', texto: 'a' }] }]]) {
    try { fl.save(d); ok(false, 'deveria recusar: ' + nome); } catch (e) { ok(true, `recusa (${nome}): ${e.message}`); } }
  ok(db.prepare('SELECT COUNT(*) n FROM campaigns WHERE flow_id = -1').get().n === 0, 'validacao nao deixa mensagens orfas');
  mock.close(); process.exit(0);
});
