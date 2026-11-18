// Teste dos Ajustes: faixas do RFV, janela de atribuicao por grupo e clientes fora das listas (banco temporario).
const path = require('path'), fs = require('fs'), os = require('os');
const root = path.resolve(process.argv[2]);
process.env.DB_PATH = path.join(os.tmpdir(), 'ajustes_test.db'); fs.rmSync(process.env.DB_PATH, { force: true });
const db = require(path.join(root, 'db.js')), core = require(path.join(root, 'core.js')), config = require(path.join(root, 'config.js'));
let falhas = 0;
const ok = (c, m) => { if (!c) falhas++; console.log((c ? 'OK   ' : 'FALHOU ') + m); };
const lanca = (fn, m) => { try { fn(); ok(false, m + ' (não recusou)'); } catch { ok(true, m); } };
const hoje = new Date(); hoje.setHours(12, 0, 0, 0);
const dia = n => new Date(hoje.getTime() - n * 864e5).toISOString();
let seq = 0;
const pedidos = (nome, fone, dias) => core.importOrders(dias.map(d => ({ external_id: 'o' + (++seq), name: nome, phone: fone, total: 50, created_at: dia(d) })));
const grupo = nome => core.customersWithRfv({ incluirExcluidos: true }).find(c => c.name === nome)?.rfv;
const id = nome => db.prepare('SELECT id FROM customers WHERE name = ?').get(nome).id;

// base: Ana com 5 pedidos recentes, Bia com 1 pedido há 40 dias, Caio com 1 pedido há 100 dias
pedidos('Ana', '24999990001', [1, 10, 20, 30, 40]);
pedidos('Bia', '24999990002', [40]);
pedidos('Caio', '24999990003', [100]);

// ===== RFV: os padrões mantêm o comportamento antigo =====
ok(JSON.stringify(config.rfv()) === JSON.stringify({ perdidos: 90, risco: 30, campeoes: 8, fieis: 4, lealdade: 2 }), 'faixas padrão = valores fixos de antes');
ok(grupo('Ana') === 'Fiéis' && grupo('Bia') === 'Em risco' && grupo('Caio') === 'Perdidos', 'com o padrão: Ana Fiéis, Bia Em risco, Caio Perdidos');

// ===== RFV: mudar as faixas reclassifica na hora =====
config.salvarRfv({ perdidos: 120, risco: 45, campeoes: 5, fieis: 3, lealdade: 2 });
ok(grupo('Ana') === 'Campeões', 'Campeões a partir de 5 pedidos: Ana sobe para Campeões');
ok(grupo('Bia') === 'Promissores', 'Em risco só a partir de 45 dias: Bia (40 dias, 1 pedido) vira Promissores');
ok(grupo('Caio') === 'Em risco', 'Perdidos só acima de 120 dias: Caio (100 dias) fica Em risco');
lanca(() => config.salvarRfv({ perdidos: 30, risco: 60, campeoes: 8, fieis: 4, lealdade: 2 }), 'recusa "Em risco" maior que "Perdidos"');
lanca(() => config.salvarRfv({ perdidos: 90, risco: 30, campeoes: 4, fieis: 4, lealdade: 2 }), 'recusa Campeões igual a Fiéis');
lanca(() => config.salvarRfv({ perdidos: 90, risco: 'x', campeoes: 8, fieis: 4, lealdade: 2 }), 'recusa campo que não é número');
config.salvarRfv(config.RFV_PADRAO);
ok(grupo('Ana') === 'Fiéis', 'voltar ao padrão desfaz');

// ===== janela de atribuição por grupo =====
db.prepare("INSERT INTO campaigns (id, name, min_days, message) VALUES (1, 'Teste', 0, 'oi')").run();
const msg = (nome, diasAtras, grupoNoEnvio) => db.prepare("INSERT INTO messages (campaign_id, customer_id, status, sent_at, rfv_group) VALUES (1, ?, 'sent', ?, ?)")
  .run(id(nome), dia(diasAtras).replace('T', ' ').slice(0, 19), grupoNoEnvio);
const convertidos = () => core.campaignStats().find(c => c.id === 1).conversoes;
// Dani: mensagem há 10 dias como Campeões, pedido 5 dias depois (há 5 dias)
pedidos('Dani', '24999990004', [200]);
msg('Dani', 10, 'Campeões');
pedidos('Dani', '24999990004', [5]);
ok(convertidos() === 1, 'janela padrão (7 dias): pedido 5 dias depois conta');
config.salvarJanela({ ...config.JANELA_PADRAO, 'Campeões': 3 });
ok(convertidos() === 0, 'Campeões com 3 dias: o mesmo pedido deixa de contar');
// Edu: mensagem antiga, sem grupo gravado, também 5 dias antes do pedido
pedidos('Edu', '24999990005', [200]);
msg('Edu', 10, null);
pedidos('Edu', '24999990005', [5]);
ok(convertidos() === 1, 'mensagem antiga sem grupo continua com 7 dias');
lanca(() => config.salvarJanela({ ...config.JANELA_PADRAO, 'Fiéis': 0 }), 'recusa janela de 0 dias');
lanca(() => config.salvarJanela({ 'Campeões': 3 }), 'recusa janela sem todos os grupos');
config.salvarJanela(config.JANELA_PADRAO);
ok(convertidos() === 2, 'todas com 7 dias: os dois pedidos contam de novo');

// ===== o envio grava o grupo do cliente =====
ok(core.rfvOf(id('Ana')) === 'Fiéis', 'rfvOf devolve o grupo atual do cliente');

// ===== clientes fora das listas e relatórios =====
const receitaAntes = db.prepare('SELECT SUM(total) t FROM orders').get().t;
db.prepare('UPDATE customers SET excluded = 1 WHERE id = ?').run(id('Ana'));
ok(!core.customersWithRfv().some(c => c.name === 'Ana'), 'excluída some da lista de clientes e do RFV');
ok(core.customersWithRfv({ incluirExcluidos: true }).some(c => c.name === 'Ana'), 'a ficha ainda acha a cliente excluída');
db.prepare("INSERT INTO campaigns (id, name, min_days, message) VALUES (2, 'Todos', 0, 'oi')").run();
const camp2 = db.prepare('SELECT * FROM campaigns WHERE id = 2').get();
ok(!core.eligible(camp2).some(c => c.name === 'Ana'), 'excluída não entra em campanha');
ok(core.eligible(camp2).some(c => c.name === 'Bia'), 'os outros continuam entrando');
ok(db.prepare('SELECT SUM(total) t FROM orders').get().t === receitaAntes, 'os pedidos dela continuam no faturamento');
db.prepare('UPDATE customers SET excluded = 0 WHERE id = ?').run(id('Ana'));
ok(core.customersWithRfv().some(c => c.name === 'Ana'), 'voltar para as listas desfaz');

console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
process.exitCode = falhas ? 1 : 0;
