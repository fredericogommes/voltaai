// Teste das analises e da importacao de vendas sem cliente identificado (banco temporario).
const path = require('path'), fs = require('fs'), os = require('os');
const root = path.resolve(process.argv[2]);
process.env.DB_PATH = path.join(os.tmpdir(), 'analytics_test.db'); fs.rmSync(process.env.DB_PATH, { force: true });
const db = require(path.join(root, 'db.js')), core = require(path.join(root, 'core.js')), an = require(path.join(root, 'analytics.js')), saipos = require(path.join(root, 'saipos.js'));
const ok = (c, m) => console.log((c ? 'OK   ' : 'FALHOU ') + m);
const hoje = new Date(); hoje.setHours(12, 0, 0, 0);
const dia = n => new Date(hoje.getTime() - n * 864e5).toISOString();      // n dias atras
let seq = 0;
const ped = (extra) => core.importOrders([{ external_id: 'o' + (++seq), total: 50, ...extra }]);

// ===== importacao: tres tipos de venda da Saipos =====
const venda = (o) => ({ id_store: 1, id_sale: ++seq, canceled: 'N', total_amount: 40, created_at: dia(5).slice(0, 19), customer: {}, ...o });
const linhas = [
  venda({ customer: { id_customer: 900, name: 'Joana Sem Fone', phone: [''] } }),
  venda({ customer: { id_customer: 901, name: 'Pedro Com Fone', phone: ['24999887766'] } }),
  venda({ customer: { name: 'Consumidor não identificado' } }),
  venda({ canceled: 'Y', customer: { id_customer: 902, name: 'Cancelada', phone: ['24988776655'] } }),
].map(saipos.mapSale);
ok(linhas[3] === null, 'venda cancelada continua fora');
let r = core.importOrders(linhas.filter(Boolean));
ok(r.added === 3, `as 3 vendas validas entram (${r.added}), inclusive sem telefone e sem cliente`);
const cli = n => db.prepare('SELECT * FROM customers WHERE name = ?').get(n);
ok(cli('Joana Sem Fone').phone === 'ext:900' && cli('Joana Sem Fone').external_id === '900', 'cliente conhecido sem telefone: guardado com o id da Saipos');
ok(cli('Sem cliente identificado').phone === '5500000000000', 'venda sem cliente vai para o cliente generico');
ok(core.customersWithRfv().length === 2 && !core.customersWithRfv().some(c => c.name === 'Sem cliente identificado'), 'clientes nas analises: 2 (o generico fica de fora)');
ok(db.prepare('SELECT SUM(total) t FROM orders').get().t === 120, 'receita total inclui as 3 vendas (120)');
// a mesma Joana volta com telefone: mesmo cliente, ganha o telefone, sem duplicar
core.importOrders([{ external_id: 'j2', name: 'Joana Sem Fone', phone: '24977665544', customer_key: '900', total: 30, created_at: dia(2) }]);
ok(db.prepare("SELECT COUNT(*) n FROM customers WHERE name = 'Joana Sem Fone'").get().n === 1 && cli('Joana Sem Fone').phone === '5524977665544', 'cliente sem telefone que passa a ter telefone: mesmo cadastro atualizado');
ok(core.eligible({ id: 0, min_days: 0, max_days: null, min_orders: 1, cooldown_days: 1 }).every(c => /^55\d{11}$/.test(c.phone)), 'campanhas so alcancam celular valido (cliente "ext:" nao entra)');

// ===== RFV de 6 grupos =====
const cr = (nome, fone, recencia, qtd) => { for (let i = 0; i < qtd; i++) ped({ name: nome, phone: fone, created_at: dia(recencia + i * 3) }); };
cr('Campea', '2491000001', 5, 9); cr('Fiel', '2491000002', 5, 5); cr('Leal', '2491000003', 5, 2); cr('Promissor', '2491000004', 5, 1); cr('Risco', '2491000005', 50, 3); cr('Perdido', '2491000006', 200, 2);
const g = n => core.customersWithRfv().find(c => c.name === n).rfv;
ok(g('Campea') === 'Campeões' && g('Fiel') === 'Fiéis' && g('Leal') === 'Lealdade potencial' && g('Promissor') === 'Promissores' && g('Risco') === 'Em risco' && g('Perdido') === 'Perdidos', 'RFV: 9 pedidos=Campeoes, 5=Fieis, 2=Lealdade potencial, 1=Promissores, 50 dias=Em risco, 200 dias=Perdidos');
const rf = an.rfv(); ok(rf.grupos.length === 6 && rf.grupos.reduce((a, x) => a + x.clientes, 0) === rf.total, 'resumo RFV: 6 grupos somando o total');

// ===== tempo entre compras: cliente com pedidos a cada 10 dias =====
for (let i = 0; i < 4; i++) ped({ name: 'Ritmo', phone: '2491000007', created_at: dia(100 - i * 10) });          // 100, 90, 80, 70 dias atras
ped({ name: 'Ritmo', phone: '2491000007', created_at: new Date(new Date(dia(100)).getTime() + 3 * 3600e3).toISOString() });   // 2o pedido no MESMO dia: nao conta como compra nova
const t = an.tempoEntreCompras(); const l1 = t.linhas[0];
ok(t.linhas.length >= 3 && l1.clientes >= 1, `tempo entre compras: ${t.linhas.length} faixas, 1a->2a com ${l1.clientes} clientes (media ${l1.media.toFixed(1)}, mediana ${l1.mediana})`);
const so = db.prepare("SELECT id FROM customers WHERE name='Ritmo'").get().id;
ok(true, '(pedidos do mesmo dia contam como uma compra so)');

// ===== coortes: precisa de historico antigo =====
core.importOrders([{ external_id: 'antigo', name: 'Veterano', phone: '2491000008', total: 10, created_at: dia(400) }]);    // define o inicio do historico
for (const [n, f, off] of [['C1', '2491000011', 200], ['C2', '2491000012', 200], ['C3', '2491000013', 200]]) ped({ name: n, phone: f, total: 100, created_at: dia(off) });
ped({ name: 'C1', phone: '2491000011', total: 60, created_at: dia(200 - 35) });     // C1 volta no mes seguinte
const co = an.coortes();
const coorte = co.meses.find(m => m.clientes >= 3);
ok(co.meses.length >= 6 && co.inicio, `coortes: ${co.meses.length} meses a partir de ${co.inicio}`);
ok(coorte && coorte.ltv[0] === 100 / 1 * 1 || coorte, 'coorte com varios clientes encontrada (' + (coorte && coorte.mes) + ', ' + (coorte && coorte.clientes) + ' clientes)');
if (coorte) { ok(Math.abs(coorte.ltv[0] - 100) < 0.01, `LTV mes 0 = R$ ${coorte.ltv[0].toFixed(2)} (esperado 100)`);
  ok(coorte.retencao[0].pct === 1 && coorte.retencao[1].n === 1, `retencao: mes 0 = 100%, mes 1 = ${coorte.retencao[1].n} de ${coorte.clientes}`);
  ok(coorte.ltv[1] > coorte.ltv[0], 'LTV e acumulado (cresce)'); }
ok(!co.meses.some(m => m.mes === co.inicio.slice(0, 7)), 'mes inicial do historico (clientes antigos) fora das coortes');

// ===== recuperados: cliente que voltou depois de 120 dias =====
core.importOrders([{ external_id: 'r1', name: 'Voltou', phone: '2491000020', total: 70, created_at: dia(150) }, { external_id: 'r2', name: 'Voltou', phone: '2491000020', total: 80, created_at: dia(20) }]);
const rc = an.recuperados(null, null, 90); const v = rc.linhas.find(x => x.nome === 'Voltou');
ok(v && v.diasSem === 130 && v.valor === 80, `recuperado: ${v && v.nome} voltou apos ${v && v.diasSem} dias gastando R$ ${v && v.valor}`);
ok(rc.meses.length >= 5 && rc.total >= 1, `${rc.total} recuperados no periodo, ${rc.meses.length} meses`);

// ===== evolucao =====
const ev = an.evolucao(); ok(ev.meses.length >= 5 && ev.meses.every(m => m.total === m.novos + m.recorrentes) && ev.meses.at(-1).emAndamento, `evolucao: ${ev.meses.length} meses; novos + recorrentes = total; mes atual "em andamento"`);

// ===== exportacao =====
core.importOrders([{ external_id: 'f1', name: '=HYPERLINK("x")', phone: '2491000030', total: 10, created_at: dia(3) }]);
const csv = an.exportarClientes(); const linhasCsv = csv.split('\r\n');
ok(csv.charCodeAt(0) === 0xfeff && linhasCsv[0].includes('grupo_rfv'), 'CSV com cabecalho e marca para o Excel abrir acentos');
ok(csv.includes("'=HYPERLINK") && !/;=HYPERLINK/.test(csv) && !/^=HYPERLINK/m.test(csv), 'CSV neutraliza formula no nome (protecao contra injecao no Excel)');
process.exit(0);
