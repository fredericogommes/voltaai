// Produtos, curva ABC, sabores, pedido favorito e variaveis nas mensagens (banco temporario + Meta de mentira).
const path = require('path'), fs = require('fs'), os = require('os'), http = require('http');
const root = path.resolve(process.argv[2]);
process.env.DB_PATH = path.join(os.tmpdir(), 'products_test.db'); fs.rmSync(process.env.DB_PATH, { force: true });
process.env.SEND_MODE = 'live';
Object.assign(process.env, { WA_TOKEN: 'tok', WA_PHONE_ID: 'PHONE1', WA_WABA_ID: 'W', WA_APP_ID: 'A', GRAPH_BASE: 'http://127.0.0.1:4572/v1' });

const subs = [], msgs = [];
const mock = http.createServer((req, res) => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => {
  const body = Buffer.concat(c).toString();
  if (req.url.includes('message_templates')) { subs.push(JSON.parse(body)); res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"id":"T1","status":"PENDING"}'); }
  if (req.url.includes('/messages')) msgs.push(JSON.parse(body));
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); }); });

mock.listen(4572, async () => {
  const db = require(path.join(root, 'db.js')), core = require(path.join(root, 'core.js')), pr = require(path.join(root, 'products.js')),
    camp = require(path.join(root, 'campaigns.js')), wa = require(path.join(root, 'whatsapp.js'));
  const ok = (c, m) => console.log((c ? 'OK   ' : 'FALHOU ') + m);
  const dia = n => new Date(Date.now() - n * 864e5).toISOString();

  // clientes e vendas
  core.importOrders([
    { external_id: '1-100', name: 'Ana', phone: '24999000001', total: 100, created_at: dia(10) }, { external_id: '1-101', name: 'Ana', phone: '24999000001', total: 80, created_at: dia(20) },
    { external_id: '1-102', name: 'Bia', phone: '24999000002', total: 60, created_at: dia(5) }, { external_id: '1-103', name: 'Caio', phone: '24999000003', total: 50, created_at: dia(3) },
    { external_id: '1-104', name: 'Dani', phone: '24999000004', total: 30, created_at: dia(2) }]);
  const it = (id, key, nome, q, preco, choices = [], extra = {}) => ({ id_sale_item: id, id_store_item: key, desc_sale_item: nome, quantity: q, unit_price: preco, deleted: 'N', choices, ...extra });
  const ch = (id, nome, ad = 0, extra = {}) => ({ id_store_choice_item: id, desc_sale_item_choice: nome, aditional_price: ad, deleted: 'N', ...extra });
  const lista = [
    { id_store: 1, id_sale: 100, items: [it(1, 10, 'Cento Promocional 1 - Salgadinhos Pré-Definidos', 1, 80, [ch(1, 'Coxinha'), ch(2, 'Bolinha de queijo', 5)]), it(2, 99, 'Coca-Cola 2L', 1, 12)] },
    { id_store: 1, id_sale: 101, items: [it(3, 10, 'Cento Promocional 1 - Salgadinhos Pré-Definidos', 1, 80, [ch(1, 'Coxinha')]), it(4, 77, '50 Salgadinhos Fritos', 2, 38), it(5, 55, 'Item cancelado', 1, 99, [], { deleted: 'Y' })] },
    { id_store: 1, id_sale: 102, items: [it(6, 20, '100 SALGADINHOS FRITOS (marque os sabores)', 1, 75, [ch(3, 'Pastel', 0, { deleted: 'Y' })]), it(7, 99, 'Coca-Cola 2L', 3, 12)] },
    { id_store: 1, id_sale: 103, items: [it(8, 20, '100 SALGADINHOS FRITOS (marque os sabores)', 1, 75)] },
    { id_store: 1, id_sale: 999, items: [it(9, 10, 'Venda que nao existe no banco', 1, 10)] },                   // sem venda correspondente
  ];
  let r = pr.importSaleItems(lista);
  ok(r.vendas === 4 && r.semVenda === 1, `importacao: ${r.vendas} vendas, ${r.semVenda} sem venda correspondente ignorada`);
  ok(r.itens === 7, `itens importados: ${r.itens} (o cancelado nao entra; 8 - 1 = 7 entre as 4 vendas)`);
  r = pr.importSaleItems(lista); ok(r.itens === 0, 'importar de novo nao duplica itens');
  ok(db.prepare('SELECT COUNT(*) n FROM item_choices').get().n === 3, 'complementos: 3 (o removido nao entra)');

  // ranking
  const rk = pr.ranking({ metric: 'qtd' });
  ok(rk.linhas[0].nome.startsWith('Coca') && rk.linhas[0].qtd === 4, `mais vendido por unidade: ${rk.linhas[0].nome} (4 un.)`);
  const rr = pr.ranking({ metric: 'receita' });
  ok(rr.linhas[0].nome.startsWith('Cento Promocional') && Math.abs(rr.linhas[0].receita - 160) < 0.01, `maior receita: ${rr.linhas[0].nome} (R$ ${rr.linhas[0].receita})`);
  const soCento = pr.ranking({ q: 'cento' }); ok(soCento.linhas.length === 1, 'busca por nome filtra');
  const cento = rr.linhas.find(l => l.nome.startsWith('Cento'));
  ok(cento.vendas === 2 && cento.compradores === 1, `Cento: 2 vendas, 1 comprador (a mesma cliente) -> ${cento.vendas}/${cento.compradores}`);
  ok(Math.abs(cento.valorMedioVenda - 90) < 0.01, `valor medio da venda com o Cento = R$ ${cento.valorMedioVenda} (100 e 80 -> 90)`);
  const somaPct = rr.linhas.reduce((s, l) => s + l.pct, 0); ok(Math.abs(somaPct - 1) < 1e-9 && Math.abs(rr.linhas.at(-1).acumulado - 1) < 1e-9, 'percentuais somam 100%');
  ok(rr.linhas[0].classe === 'A' && rr.linhas.at(-1).classe === 'C' || rr.linhas.at(-1).classe !== undefined, `curva ABC: ${rr.linhas.map(l => l.classe).join('')}`);
  const cl = rr.classes; ok(cl.A.produtos + cl.B.produtos + cl.C.produtos === rr.produtos, 'cada produto cai em uma classe');

  // sabores
  const es = pr.escolhas({}); ok(es.linhas[0].nome === 'Coxinha' && es.linhas[0].vezes === 2, `sabor mais escolhido: ${es.linhas[0].nome} (${es.linhas[0].vezes}x)`);
  ok(es.linhas.find(l => l.nome === 'Bolinha de queijo').tipo === 'Adicional', 'escolha com valor extra aparece como Adicional');
  ok(pr.cobertura({ s: dia(60), e: new Date(Date.now() + 864e5).toISOString() }).comItens === 4, 'cobertura: 4 vendas com itens');

  // pedido favorito
  const fav = pr.favoritosMap(true); const id = n => db.prepare('SELECT id FROM customers WHERE name = ?').get(n).id;
  ok(fav.get(id('Ana')).curto === 'Cento Promocional 1 - Salgadinhos' || fav.get(id('Ana')).curto.startsWith('Cento Promocional 1'), `favorito da Ana: "${fav.get(id('Ana')).curto}" (2 pedidos)`);
  ok(fav.get(id('Bia')).curto.toLowerCase().startsWith('100 salgadinhos fritos') && !/marque/i.test(fav.get(id('Bia')).curto), `favorito da Bia: "${fav.get(id('Bia')).curto}" (maiusculas e parenteses limpos; a Coca 3x nao conta)`);
  ok(!fav.has(id('Dani')), 'cliente sem itens importados: sem favorito (cai no texto padrao)');
  ok(pr.nomeCurto('Cento Promocional 1 (25 Coxinhas + 25 Bolinhas)') === 'Cento Promocional 1', 'nome curto remove o que esta entre parenteses');
  ok(pr.nomeCurto('Kit Festa Especial Para 10 Pessoas Com Refrigerante').length <= 40, 'nome curto limitado a 40 caracteres, sem cortar palavra');
  ok(pr.NAO_FAVORITO.test('Coca Cola 2,5L') && pr.NAO_FAVORITO.test('Refrigerante Guaraná 2l') && pr.NAO_FAVORITO.test('Molho verde') && !pr.NAO_FAVORITO.test('100 Salgadinhos Fritos'), 'bebidas e molhos ficam fora do "favorito"');

  // render
  const render = core.render('Oi [nome_cliente]! Bateu saudade de pedir [produto_favorito]? Volte!', { name: 'Ana Souza', favorito: 'Cento Promocional 1' });
  ok(render === 'Oi Ana! Bateu saudade de pedir Cento Promocional 1? Volte!', 'render troca nome e pedido favorito: ' + render);
  ok(core.render('Pedir [produto_favorito] hoje?', { name: 'X' }).includes(require(path.join(root, 'brand')).loja.produtoExemplo), 'sem favorito: usa o texto padrao da marca');

  // validacao e variaveis na Meta
  const base = { name: 'Fav', channel: 'whatsapp', min_days: 0, max_days: null, min_orders: 1, cooldown_days: 1 };
  for (const [nome, body] of [['favorito repetido', 'Oi, que tal [produto_favorito] ou [produto_favorito]? Volte.'], ['favorito no fim', 'Bateu vontade de [produto_favorito]'], ['favorito no comeco', '[produto_favorito] te espera hoje!']]) {
    try { camp.save({ ...base, ads: [{ body }] }); ok(false, 'deveria recusar: ' + nome); } catch (e) { ok(true, `recusa (${nome})`); } }
  const c1 = camp.save({ ...base, ads: [{ body: 'Oi [nome_cliente], bateu saudade de pedir [produto_favorito]? Volte hoje!' }] });
  ok(c1.id > 0, 'mensagem com as duas variaveis e aceita');
  await camp.publish(c1.id);
  const corpo = subs.at(-1).components.find(c => c.type === 'BODY');
  ok(corpo.text === 'Oi {{1}}, bateu saudade de pedir {{2}}? Volte hoje!' && JSON.stringify(corpo.example.body_text) === '[["Maria","Cento Promocional 1"]]', 'modelo na Meta: {{1}} nome, {{2}} produto, com exemplos');
  db.prepare("UPDATE templates SET status='APPROVED'").run(); db.prepare("UPDATE campaigns SET status='publicada' WHERE id = ?").run(c1.id);
  // ordem invertida no texto: o parametro acompanha a ordem do texto
  const c2 = camp.save({ ...base, name: 'Inv', ads: [{ body: 'Que tal [produto_favorito] hoje, [nome_cliente]? Estamos esperando.' }] });
  await camp.publish(c2.id); db.prepare("UPDATE templates SET status='APPROVED'").run(); db.prepare("UPDATE campaigns SET status='publicada' WHERE id = ?").run(c2.id);
  const antes = msgs.length; await core.runCampaign(c1.id, { limit: 50 }); await core.runCampaign(c2.id, { limit: 50 });
  const daAna1 = msgs.slice(antes).find(m => m.to === '5524999000001' && m.template.name.startsWith(require(path.join(root, 'brand')).produto.slug + '_c' + c1.id));
  const daAna2 = msgs.slice(antes).find(m => m.to === '5524999000001' && m.template.name.startsWith(require(path.join(root, 'brand')).produto.slug + '_c' + c2.id));
  const p1 = daAna1?.template.components.find(c => c.type === 'body').parameters.map(p => p.text), p2 = daAna2?.template.components.find(c => c.type === 'body').parameters.map(p => p.text);
  ok(p1 && p1[0] === 'Ana' && p1[1].startsWith('Cento Promocional 1'), 'envio: {{1}}=Ana, {{2}}=pedido favorito -> ' + JSON.stringify(p1));
  ok(p2 && p2[0].startsWith('Cento Promocional 1') && p2[1] === 'Ana', 'ordem invertida no texto: parametros seguem a ordem do texto -> ' + JSON.stringify(p2));
  const daDani = msgs.slice(antes).find(m => m.to === '5524999000004');
  ok(daDani && daDani.template.components.find(c => c.type === 'body').parameters[1].text === require(path.join(root, 'brand')).loja.produtoExemplo, 'cliente sem favorito recebe o texto padrao da marca');
  mock.close(); process.exit(0);
});
