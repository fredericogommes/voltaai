// Teste do envio automatico com relogio simulado, banco temporario e Meta de mentira.
const path = require('path'), fs = require('fs'), os = require('os'), http = require('http');
const root = path.resolve(process.argv[2]);
process.env.DB_PATH = path.join(os.tmpdir(), 'sched_test.db'); fs.rmSync(process.env.DB_PATH, { force: true });
process.env.SEND_MODE = 'live';
Object.assign(process.env, { WA_TOKEN: 'tok', WA_PHONE_ID: 'PHONE1', WA_WABA_ID: 'W', WA_APP_ID: 'A', GRAPH_BASE: 'http://127.0.0.1:4569/v1' });

let falha = false, enviadas = 0;
const mock = http.createServer((req, res) => {
  req.on('data', () => {}); req.on('end', () => {
    if (req.url.includes('/PHONE1/messages')) { if (falha) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end('{"error":{"message":"token invalido"}}'); } enviadas++; }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(req.url.includes('message_templates') ? '{"id":"TPL1","status":"PENDING"}' : '{}');
  });
});

mock.listen(4569, async () => {
  const db = require(path.join(root, 'db.js')), core = require(path.join(root, 'core.js')), camp = require(path.join(root, 'campaigns.js')), sch = require(path.join(root, 'scheduler.js'));
  const ok = (c, m) => console.log((c ? 'OK   ' : 'FALHOU ') + m);
  const dias = n => new Date(Date.now() - n * 864e5).toISOString();
  const rows = []; for (let i = 0; i < 40; i++) rows.push({ external_id: 'p' + i, name: 'Cliente ' + i, phone: '2499' + String(8000000 + i * 31), total: 50, created_at: dias(60) });
  core.importOrders(rows);

  const base = { name: 'Auto', channel: 'whatsapp', min_days: 30, max_days: 90, min_orders: 1, cooldown_days: 30, ads: [{ body: 'Oi [nome_cliente], vem pedir!' }] };
  const days = {}; for (let i = 0; i < 7; i++) days[i] = { on: i !== 1, from: '16:00', to: '21:00' };       // segunda sem envio
  const s0 = { auto: true, start: '2026-01-01', end: null, days, daily_cap: 25, total_cap: null, max_attempts: 2, per_minute: 10 };
  const r = camp.save({ ...base, schedule: s0 });
  await camp.publish(r.id);                                                                                  // modo live sem Meta de verdade => ve abaixo
  db.exec("UPDATE templates SET status='APPROVED'; UPDATE campaigns SET status='publicada'");                // simula aprovacao

  const dt = (y, m, d, h, mi) => new Date(y, m - 1, d, h, mi);
  // domingo 2026-11-08
  let f = await sch.tick(dt(2026, 11, 8, 15, 0)); ok(f.length === 0, 'antes das 16h: nao envia');
  f = await sch.tick(dt(2026, 11, 8, 16, 1)); ok(f[0]?.sent === 10, `16:01 envia lote de 10 (enviou ${f[0]?.sent})`);
  f = await sch.tick(dt(2026, 11, 8, 16, 2)); ok(f[0]?.sent === 10, '16:02 mais 10');
  f = await sch.tick(dt(2026, 11, 8, 16, 3)); ok(f[0]?.sent === 5, `16:03 so 5, para chegar no limite diario de 25 (enviou ${f[0]?.sent})`);
  f = await sch.tick(dt(2026, 11, 8, 16, 4)); ok(f.length === 0, 'limite diario atingido: nao envia mais');
  console.log('     aviso:', JSON.stringify(JSON.parse(db.prepare("SELECT value FROM meta WHERE key='auto:1'").get().value).parado));
  ok(enviadas === 25, `total enviado ao WhatsApp falso = ${enviadas}`);
  // segunda-feira: dia desligado
  f = await sch.tick(dt(2026, 11, 9, 17, 0)); ok(f.length === 0, 'segunda-feira (dia desligado): nao envia');
  // terca: novo dia, cota zera? (sentToday usa a data real do banco; simulamos mexendo nas datas dos envios)
  db.exec("UPDATE messages SET sent_at = datetime('now','-1 day')");
  f = await sch.tick(dt(2026, 11, 10, 17, 0)); ok(f[0]?.sent === 10, 'terca: novo dia, volta a enviar');
  const w = sch.nextWindow(sch.parseSchedule(camp.get(r.id)), dt(2026, 11, 9, 10, 0));
  ok(w && !w.aberto && w.de.getDay() === 2 && w.de.getHours() === 16, 'proxima janela a partir da segunda: terca 16:00');

  // falha geral: para depois de 3 seguidas
  falha = true; db.exec("UPDATE campaigns SET schedule = json_set(schedule, '$.daily_cap', null)");
  f = await sch.tick(dt(2026, 11, 10, 17, 5)); ok(f[0]?.aborted === true && f[0].failed === 3, `token invalido: interrompe apos 3 falhas seguidas (falhou ${f[0]?.failed})`);
  console.log('     aviso:', JSON.parse(db.prepare("SELECT value FROM meta WHERE key='auto:1'").get().value).parado);
  const tentou = db.prepare("SELECT COUNT(DISTINCT customer_id) n FROM messages WHERE status='failed'").get().n; ok(tentou === 3, 'so 3 clientes gastaram tentativa (nao a base toda)');
  falha = false;

  // renitencia: max 2 tentativas
  falha = true; await sch.tick(dt(2026, 11, 10, 17, 6)); falha = false;       // mesmos 3 + outros ja gastaram?
  const comDuas = db.prepare("SELECT COUNT(*) n FROM (SELECT customer_id FROM messages WHERE status='failed' GROUP BY customer_id HAVING COUNT(*) >= 2)").get().n;
  const fora = core.eligible(camp.get(r.id)).filter(c => db.prepare("SELECT COUNT(*) n FROM messages WHERE customer_id=? AND status='failed'").get(c.id).n >= 2).length;
  ok(comDuas > 0 && fora === 0, `clientes com 2 falhas (${comDuas}) deixam de ser tentados`);

  // modelo nao aprovado bloqueia
  db.exec("UPDATE templates SET status='PENDING'"); f = await sch.tick(dt(2026, 11, 10, 17, 9)); ok(f.length === 0, 'modelo nao aprovado: nao envia');
  console.log('     aviso:', JSON.parse(db.prepare("SELECT value FROM meta WHERE key='auto:1'").get().value).parado);
  db.exec("UPDATE templates SET status='APPROVED'");
  // pausar
  db.exec("UPDATE campaigns SET active=0"); f = await sch.tick(dt(2026, 11, 10, 17, 10)); ok(f.length === 0, 'campanha pausada: nao envia');
  // editar conteudo desliga o automatico
  db.exec("UPDATE campaigns SET active=1");
  camp.save({ ...base, id: r.id, ads: [{ body: 'Texto novo [nome_cliente], tudo bem?' }], schedule: camp.get(r.id).schedule });
  const g = camp.get(r.id); ok(g.status === 'rascunho' && g.schedule.auto === false, 'editar a mensagem volta a rascunho e desliga o automatico');
  try { camp.setAuto(r.id, true); ok(false, 'nao deveria ligar rascunho'); } catch (e) { ok(true, 'nao liga automatico em rascunho: ' + e.message); }
  // validacao de horario
  try { camp.save({ ...base, id: r.id, schedule: { ...s0, days: { ...days, 2: { on: true, from: '21:00', to: '16:00' } } } }); ok(false, 'horario invertido'); } catch (e) { ok(true, 'recusa horario invertido: ' + e.message); }
  mock.close(); process.exit(0);
});
