// Dados de EXEMPLO (ficticios) para testar o painel. Rode: node seed.js
const db = require('./db');
const core = require('./core');

const nomes = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elaine', 'Fábio', 'Gisele', 'Hugo', 'Iara', 'João',
  'Karina', 'Lucas', 'Marta', 'Nilton', 'Olga', 'Paulo', 'Quésia', 'Rafael', 'Sônia', 'Tiago'];
const rows = [];
let n = 0;
for (let i = 0; i < 150; i++) {
  const phone = '2499' + String(7000000 + i * 137).slice(0, 7);
  const pedidos = 1 + Math.floor(Math.random() ** 2 * 6);
  const ultimo = Math.floor(Math.random() * 160);
  for (let k = 0; k < pedidos; k++) {
    const dias = ultimo + k * (10 + Math.floor(Math.random() * 40));
    rows.push({
      external_id: 'demo-' + (n++),
      name: nomes[i % nomes.length] + ' ' + (i + 1),
      phone,
      total: (25 + Math.random() * 90).toFixed(2),
      created_at: new Date(Date.now() - dias * 864e5).toISOString(),
    });
  }
}
console.log('Pedidos:', core.importOrders(rows));

if (!db.prepare('SELECT 1 FROM campaigns LIMIT 1').get()) {
  const ins = db.prepare(`INSERT INTO campaigns (name, channel, min_days, max_days, min_orders, cooldown_days, message)
    VALUES (?,?,?,?,?,?,?)`);
  ins.run('Fidelização 5 a 29 dias', 'whatsapp', 5, 29, 1, 15, 'Oi, {nome}! Bateu a vontade? Peça hoje');
  ins.run('Recompra 30 a 90 dias', 'whatsapp', 30, 90, 1, 30, 'Oi, {nome}, sentimos sua falta! Volte e peça o seu favorito.');
  ins.run('Recuperação acima de 90 dias', 'whatsapp', 91, null, 1, 45, '{nome}, faz tempo! Preparamos uma surpresa pra você voltar 💛');
}
