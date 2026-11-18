// Teste das promoções por canal, dos bairros, do painel de performance (custo, ROAS) e das regras dos canais SMS e e-mail.
const path = require('path'), fs = require('fs'), os = require('os');
const root = path.resolve(process.argv[2]);
process.env.DB_PATH = path.join(os.tmpdir(), 'promocoes_test.db'); fs.rmSync(process.env.DB_PATH, { force: true });
delete process.env.ZENVIA_TOKEN; delete process.env.RESEND_API_KEY;
const db = require(path.join(root, 'db.js')), core = require(path.join(root, 'core.js'));
const promo = require(path.join(root, 'promocoes.js')), ins = require(path.join(root, 'insights.js'));
const config = require(path.join(root, 'config.js')), canais = require(path.join(root, 'canais.js')), saipos = require(path.join(root, 'saipos.js'));
let falhas = 0;
const ok = (c, m) => { if (!c) falhas++; console.log((c ? 'OK   ' : 'FALHOU ') + m); };
const perto = (a, b) => Math.abs(a - b) < 0.001;
const hoje = new Date(); hoje.setHours(12, 0, 0, 0);
const dia = n => new Date(hoje.getTime() - n * 864e5).toISOString();
const ymd = d => d.toISOString().slice(0, 10);
let seq = 0;
const venda = (nome, fone, diasAtras, canal, total, desconto, extra = {}) => core.importOrders([{ external_id: 'v' + (++seq), name: nome, phone: fone, total, created_at: dia(diasAtras),
  detalhes: { channel: canal, sale_type: 1, items_total: total + desconto, discount: desconto, increase: 0, coupon: extra.cupom || null, delivery_fee: 5, district: extra.bairro || 'Centro', payment: null } }]);

// ===== a Saipos vira detalhes da venda =====
const s = saipos.mapSale({ id_store: 1, id_sale: 9, canceled: 'N', total_amount: 120, created_at: dia(1).slice(0, 19), id_sale_type: 1, total_amount_items: 115, total_discount: 5, total_increase: 10,
  partner_sale: { desc_partner_sale: 'iFood' }, delivery: { district: ' Retiro ', delivery_fee: 10 }, payments: [{ desc_store_payment_type: 'Pago - iFood' }], discount_coupon: { code: 'BEMVINDO' },
  customer: { id_customer: 5, name: 'Lia', phone: ['24999990009'], email: 'lia@exemplo.com' } });
ok(s.detalhes.channel === 'iFood' && s.detalhes.discount === 5 && s.detalhes.district === 'Retiro' && s.detalhes.coupon === 'BEMVINDO' && s.detalhes.payment === 'Pago - iFood', 'mapSale lê canal, desconto, bairro, cupom e pagamento');
core.importOrders([s]);
ok(db.prepare("SELECT channel, discount, district FROM orders WHERE external_id = '1-9'").get().channel === 'iFood', 'a venda importada guarda o canal');
ok(db.prepare("SELECT email FROM customers WHERE name = 'Lia'").get().email === 'lia@exemplo.com', 'o e-mail do cliente da Saipos é guardado');
// a mesma venda de novo, agora com outro desconto: atualiza o detalhe sem duplicar
core.importOrders([{ ...s, detalhes: { ...s.detalhes, discount: 7 } }]);
ok(db.prepare("SELECT COUNT(*) n, MAX(discount) d FROM orders WHERE external_id = '1-9'").get().d === 7, 'sincronizar de novo completa o detalhe da venda que já existia');

// ===== promoções =====
// Ana: 9 pedidos no iFood, todos com desconto. Bia: 1 pedido sem desconto. Caio: 99 Food com desconto alto.
for (let i = 0; i < 9; i++) venda('Ana', '24999990001', 20 - i, 'iFood', 80, 10, i === 0 ? { cupom: 'PRIMEIRA' } : {});
venda('Bia', '24999990002', 3, 'iFood', 100, 0, { bairro: 'Aterrado' });
venda('Caio', '24999990003', 2, '99 Food', 60, 40);
venda('Davi', '24999990004', 2, null, 50, 0);
const de = ymd(new Date(hoje.getTime() - 29 * 864e5)), ate = ymd(hoje);
const p = promo.promocoes(de, ate);
ok(p.foco === 'iFood', 'sem escolha, analisa o iFood');
ok(p.resumo.pedidos === 11 && p.resumo.comPromocao === 10, `iFood: 11 pedidos, 10 com desconto (${p.resumo.pedidos}/${p.resumo.comPromocao})`);
ok(perto(p.resumo.desconto, 97), `desconto do iFood soma 97 (${p.resumo.desconto})`);
ok(p.faixas[2].pedidos === 4 && p.faixas[2].pct === 1, 'do 6º ao 9º pedido da Ana caem em "6º pedido ou mais", todos com desconto');
ok(p.alertas.some(a => /margem/.test(a)), 'avisa a margem deixada na mesa com clientes frequentes');
ok(p.alertas.some(a => /dependente/.test(a)), 'avisa quando a venda depende de promoção');
ok(p.cupons.some(c => c.cupom === 'PRIMEIRA'), 'lista o cupom usado');
const p99 = promo.promocoes(de, ate, '99 Food');
ok(p99.foco === '99 Food' && p99.resumo.pedidos === 1 && perto(p99.resumo.pctDoBruto, 0.4), '99 Food: 1 pedido, desconto de 40% do bruto');
const pTodos = promo.promocoes(de, ate, 'todos');
ok(pTodos.foco === 'todos' && pTodos.porCanal.some(c => c.canal === 'Venda própria'), 'todos os canais inclui a venda própria');

// ===== bairros =====
const b = promo.bairros(de, ate);
ok(b.bairros[0].bairro === 'Centro' && b.bairros.some(x => x.bairro === 'Aterrado'), 'bairros ordenados pela receita');

// ===== performance: custo, desconto e ROAS =====
db.prepare("INSERT INTO campaigns (id, name, min_days, message, channel) VALUES (1, 'Volta', 0, 'oi', 'whatsapp')").run();
const anaId = db.prepare("SELECT id FROM customers WHERE name = 'Ana'").get().id;
db.prepare("INSERT INTO messages (campaign_id, customer_id, status, sent_at, rfv_group) VALUES (1, ?, 'sent', ?, NULL)").run(anaId, dia(15).replace('T', ' ').slice(0, 19));
config.salvarCustos({ whatsapp: 0.5, sms: 0.1, email: 0 });
const perf = ins.performance(de, ate), c1 = perf.campaigns.find(c => c.id === 1);
ok(c1.enviadas === 1 && perto(c1.custo, 0.5), 'custo da campanha = mensagens × custo do canal');
ok(c1.conversoes >= 1 && perto(c1.roas, c1.receita / 0.5), 'ROAS = receita ÷ custo');
ok(perf.resumo.influenciada > 0 && perf.resumo.influenciada < 1, 'parte da receita influenciada entre 0 e 100%');
let recusou = false; try { config.salvarCustos({ whatsapp: -1, sms: 0, email: 0 }); } catch { recusou = true; }
ok(recusou, 'recusa custo negativo');

// ===== canais =====
ok(!canais.smsPronto() && !canais.emailPronto(), 'sem chaves, SMS e e-mail ficam desligados');
ok(canais.emailValido('a@b.com') && !canais.emailValido('sem-arroba') && !canais.emailValido('a b@c.com'), 'valida e-mail');
db.prepare("INSERT INTO campaigns (id, name, min_days, message, channel) VALUES (2, 'Email', 0, 'oi', 'email')").run();
const alvos = core.eligible(db.prepare('SELECT * FROM campaigns WHERE id = 2').get());
ok(alvos.length === 1 && alvos[0].name === 'Lia', 'campanha de e-mail só alcança quem tem e-mail');

console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
process.exitCode = falhas ? 1 : 0;
