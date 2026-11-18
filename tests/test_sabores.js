// Teste dos sabores que o cliente mais consome (escolhas dos itens da Saipos). Banco temporário.
const path = require('path'), fs = require('fs'), os = require('os');
const root = path.resolve(process.argv[2]);
process.env.DB_PATH = path.join(os.tmpdir(), 'sabores_test.db'); fs.rmSync(process.env.DB_PATH, { force: true });
const db = require(path.join(root, 'db.js')), core = require(path.join(root, 'core.js')), products = require(path.join(root, 'products.js'));
const saipos = require(path.join(root, 'saipos.js'));
let falhas = 0;
const ok = (c, m) => { if (!c) falhas++; console.log((c ? 'OK   ' : 'FALHOU ') + m); };

// leitura das escolhas
const L = products.lerEscolha;
ok(L('25 Coxinhas de Frango').chave === L('25 Coxinha de frango').chave, 'plural e maiúscula viram o mesmo sabor');
ok(L('25 Quibes').chave === 'kibe' && L('25 Kibe').chave === 'kibe', 'Quibe e Kibe são o mesmo sabor');
ok(L('25 Bolinha de queijo').unidades === 25, 'o número na frente é a quantidade de salgados');
ok(L('Molho Verde').tipo === 'molho' && L('Verde').tipo === 'molho' && L('Molho Verde').chave === L('Verde').chave, 'molhos ficam à parte e "Verde" = "Molho Verde"');
ok(L('Sem cebola') === null, 'observação que não é sabor é ignorada');
ok(L('Coxinha').tipo === 'sabor' && L('Coxinha').unidades === 1, 'sabor sem número conta 1');

// um cliente com dois pedidos de cento
core.importOrders([
  { external_id: '1-1', name: 'Ana', phone: '24999990001', total: 100, created_at: new Date(Date.now() - 5 * 864e5).toISOString() },
  { external_id: '1-2', name: 'Ana', phone: '24999990001', total: 100, created_at: new Date(Date.now() - 2 * 864e5).toISOString() },
]);
const item = (id_sale, id_item, qtd, escolhas) => ({ id_store: 1, id_sale, items: [{ id_sale_item: id_item, id_store_item: 7, desc_sale_item: '100 Salgadinhos Fritos', quantity: qtd, unit_price: 90,
  choices: escolhas.map((n, i) => ({ id_store_choice_item: 100 + i, desc_sale_item_choice: n, aditional_price: 0 })) }] });
products.importSaleItems([
  item(1, 11, 1, ['50 Coxinha de frango', '25 Bolinha de queijo', '25 Kibe', 'Molho Verde']),
  item(2, 12, 2, ['25 Coxinhas de Frango', '25 Bolinhas de Queijo', '25 Quibes', '25 Rolinho de pizza', 'Alho', 'Verde']),
]);
const id = db.prepare("SELECT id FROM customers WHERE name = 'Ana'").get().id;
const r = products.saboresDoCliente(id);
// coxinha: 50 + 25*2 = 100; bolinha: 25 + 50 = 75; kibe: 25 + 50 = 75; rolinho: 50
ok(r.sabores[0].nome === 'Coxinha de frango' && r.sabores[0].unidades === 100, `coxinha lidera com 100 unidades (${r.sabores[0]?.nome} ${r.sabores[0]?.unidades})`);
ok(r.totalSalgados === 300, `total de 300 salgados (${r.totalSalgados})`);
ok(Math.abs(r.sabores[0].pct - 1 / 3) < 0.001, 'coxinha é um terço do consumo');
ok(r.molho?.nome === 'Verde' && r.molho.pedidos === 2, 'molho preferido: verde, pedido nas duas vezes');
ok(products.saboresMap(true).get(id)?.nome === 'Coxinha de frango', 'a lista de clientes mostra o sabor que mais consome');

// a Saipos devolve null num período sem itens: não pode virar erro
ok(typeof saipos.completarItens === 'function', 'existe o preenchimento do histórico de itens');

console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
process.exitCode = falhas ? 1 : 0;
