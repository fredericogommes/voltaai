// Banco SQLite embutido no Node (sem dependencias externas)
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const db = new DatabaseSync(process.env.DB_PATH || path.join(__dirname, `${require('./brand').produto.slug}.db`));
db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  opt_out INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT UNIQUE,            -- id do pedido no Saipos
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  total REAL NOT NULL,
  created_at TEXT NOT NULL            -- ISO
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at);
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',   -- whatsapp | sms
  min_days INTEGER NOT NULL,                  -- recencia minima (dias desde a ultima compra)
  max_days INTEGER,                           -- recencia maxima (null = sem limite)
  min_orders INTEGER NOT NULL DEFAULT 1,
  cooldown_days INTEGER NOT NULL DEFAULT 30,  -- nao repetir mensagem para o mesmo cliente
  message TEXT NOT NULL,                      -- usa {nome}
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL,                       -- sent | failed | dry
  error TEXT,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE INDEX IF NOT EXISTS idx_msg_customer ON messages(customer_id, sent_at);
`);

// ---- migracoes simples: acrescenta colunas novas sem perder dados -----------
function addColumn(table, col, def) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addColumn('campaigns', 'ads', 'TEXT');                                   // JSON: ate 3 anuncios (A, B, C)
addColumn('campaigns', 'category', "TEXT NOT NULL DEFAULT 'marketing'"); // marketing | utility
addColumn('campaigns', 'status', "TEXT NOT NULL DEFAULT 'publicada'");   // rascunho | aguardando | publicada
addColumn('messages', 'variant', 'TEXT');
addColumn('campaigns', 'schedule', 'TEXT');                              // JSON: envio automatico, periodo, horarios e limites
addColumn('campaigns', 'flow_id', 'INTEGER');                            // campanha "escondida": e a mensagem de uma etapa de fluxo
addColumn('campaigns', 'created_at', 'TEXT');                            // quando a campanha foi criada (ISO); antigas ficam sem
addColumn('campaigns', 'updated_at', 'TEXT');                            // última edição (ISO)
addColumn('customers', 'birth_date', 'TEXT');                            // YYYY-MM-DD (vem da Saipos, quando existe)
addColumn('customers', 'external_id', 'TEXT');                           // id do cliente na Saipos
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_customers_ext ON customers(external_id)');
addColumn('customers', 'email', 'TEXT');                                 // e-mail do cliente (Saipos ou cadastro no clube)
addColumn('customers', 'email_optin', 'TEXT');                           // quando o cliente aceitou receber e-mails (cadastro no clube)
addColumn('customers', 'address', 'TEXT');                               // rua/avenida, sincronizada do PDV
addColumn('customers', 'address_number', 'TEXT');                        // numero do endereco
addColumn('customers', 'address_complement', 'TEXT');                    // apartamento, bloco etc.
addColumn('customers', 'address_reference', 'TEXT');                     // ponto de referencia
addColumn('customers', 'district', 'TEXT');                              // bairro atual do cadastro
// resgates do programa de fidelidade (registrados no CRM quando a loja entrega o prêmio)
db.exec(`CREATE TABLE IF NOT EXISTS loyalty_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  pontos INTEGER NOT NULL,
  premio TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
); CREATE INDEX IF NOT EXISTS idx_redemptions_customer ON loyalty_redemptions(customer_id);`);
addColumn('customers', 'excluded', 'INTEGER NOT NULL DEFAULT 0');        // 1 = fora de listas, análises e campanhas (ex.: funcionário, número de teste)
addColumn('messages', 'rfv_group', 'TEXT');                              // grupo RFV do cliente no envio: escolhe a janela de atribuição
// detalhes da venda da Saipos (para canal, promoções e bairros); vendas antigas ganham estes dados na próxima sincronização
addColumn('orders', 'channel', 'TEXT');                                  // parceiro (ex.: iFood) ou null = venda própria
addColumn('orders', 'sale_type', 'INTEGER');                             // id_sale_type da Saipos
addColumn('orders', 'items_total', 'REAL');                              // soma dos itens, antes de desconto e acréscimo
addColumn('orders', 'discount', 'REAL');                                 // total_discount
addColumn('orders', 'increase', 'REAL');                                 // total_increase (taxas adicionais)
addColumn('orders', 'coupon', 'TEXT');                                   // cupom ou motivo do desconto, quando a Saipos informa
addColumn('orders', 'delivery_fee', 'REAL');
addColumn('orders', 'district', 'TEXT');                                 // bairro da entrega
addColumn('orders', 'payment', 'TEXT');                                  // formas de pagamento, separadas por vírgula
// itens das vendas (vem de /sales_items da Saipos): produtos e complementos (sabores, adicionais)
db.exec(`
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  item_id TEXT UNIQUE NOT NULL,           -- loja-id_sale_item
  product_key TEXT NOT NULL,              -- id do item no cardapio (ou nome, se nao houver id)
  name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL                -- ja inclui os adicionais (segundo a doc da Saipos)
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_items_product ON order_items(product_key);
CREATE TABLE IF NOT EXISTS item_choices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES order_items(id),
  choice_key TEXT NOT NULL,
  name TEXT NOT NULL,
  extra REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_choices_item ON item_choices(item_id);
CREATE INDEX IF NOT EXISTS idx_choices_key ON item_choices(choice_key);
`);
db.exec(`
CREATE TABLE IF NOT EXISTS flows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'rascunho',      -- rascunho | ativo | pausado
  trigger TEXT NOT NULL,                        -- JSON: { tipo, dias }
  steps TEXT NOT NULL,                          -- JSON: [{ type: 'esperar', valor, unidade } | { type: 'enviar', campaign_id }]
  schedule TEXT,                                -- JSON: dias e horarios permitidos, ritmo, tentativas
  exit_on_order INTEGER NOT NULL DEFAULT 1,     -- sai do fluxo se o cliente pedir de novo
  reentry_days INTEGER NOT NULL DEFAULT 30,     -- nao entra de novo antes disso
  start_order_id INTEGER,                       -- so pedidos DEPOIS deste entram (gatilhos de pedido)
  activated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS flow_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flow_id INTEGER NOT NULL REFERENCES flows(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  trigger_ref INTEGER NOT NULL,                 -- pedido, ultimo pedido ou ano: impede entrar duas vezes pelo mesmo motivo
  step INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'ativo',          -- ativo | concluido | saiu | falhou
  next_at TEXT NOT NULL,                        -- ISO
  entered_at TEXT NOT NULL,                     -- ISO
  finished_at TEXT,
  exit_reason TEXT,
  fails INTEGER NOT NULL DEFAULT 0,
  UNIQUE (flow_id, customer_id, trigger_ref)
);
CREATE INDEX IF NOT EXISTS idx_runs_due ON flow_runs(state, next_at);
`);
db.exec(`CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  variant TEXT NOT NULL,
  name TEXT NOT NULL,            -- nome do modelo na Meta
  meta_id TEXT,
  status TEXT NOT NULL,          -- SIMULADO | PENDING | APPROVED | REJECTED | ...
  error TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (campaign_id, variant)
);`);

module.exports = db;
