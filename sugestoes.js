// Campanhas sugeridas: galeria por objetivo e canal, com quantos clientes cada uma alcança hoje.
// "Usar" cria um rascunho com o texto e a faixa de clientes; nada é enviado.
const core = require('./core');
const campaigns = require('./campaigns');
const brand = require('./brand');
// {loja} e {assinatura} vêm de brand.json (loja.nome, loja.assinatura)

const S = (id, objetivo, canal, nome, min_days, max_days, min_orders, cooldown_days, body, header = '') =>
  ({ id, objetivo, canal, nome, min_days, max_days, min_orders, cooldown_days, body: brand.texto(body), header: brand.texto(header) });

const LISTA = [
  // Recorrência: quem pediu há pouco, para pedir de novo
  S('rec-favorito', 'Recorrência', 'whatsapp', 'Bateu a vontade do favorito', 7, 20, 2, 14,
    'Oi, [nome_cliente]! Já faz uma semaninha desde o seu último pedido. Que tal repetir [produto_favorito] hoje? É só responder esta mensagem.'),
  S('rec-fds', 'Recorrência', 'whatsapp', 'Convite de fim de semana', 3, 30, 1, 14,
    'Oi, [nome_cliente]! O fim de semana pede comida quentinha. Bora garantir o seu pedido? Responda aqui e a gente prepara tudo.'),
  S('rec-sms', 'Recorrência', 'sms', 'Lembrete curto por SMS', 7, 30, 1, 21,
    '{loja}: [nome_cliente], bateu a vontade? Peca pelo WhatsApp da loja.'),
  // RFV: falar diferente com cada grupo
  S('rfv-campeoes', 'RFV', 'whatsapp', 'Agradecimento aos Campeões', 0, 21, 8, 45,
    'Oi, [nome_cliente]! Você está entre os clientes que mais pedem na {loja} e a gente queria só agradecer. Quando bater a vontade de [produto_favorito], é só chamar.'),
  S('rfv-promissores', 'RFV', 'whatsapp', 'Segundo pedido de quem pediu uma vez', 10, 30, 1, 30,
    'Oi, [nome_cliente]! Gostou do seu pedido? Seu próximo pedido é só responder aqui. A gente adora quando você volta.'),
  S('rfv-email-fieis', 'RFV', 'email', 'E-mail para clientes fiéis', 0, 30, 4, 30,
    'Oi, [nome_cliente]!\n\nVocê pede com a gente com frequência e isso faz o nosso dia. Obrigado pela confiança.\n\nQuando bater a vontade de [produto_favorito], é só pedir pelo WhatsApp ou pelo nosso site.\n\nUm abraço,\n{assinatura}',
    '[nome_cliente], obrigado por pedir com a gente'),
  // Reativação: quem sumiu
  S('reat-30', 'Reativação', 'whatsapp', 'Sentimos sua falta (30 a 60 dias)', 30, 60, 1, 30,
    'Oi, [nome_cliente]! Faz um tempinho que você não pede por aqui e a gente sentiu sua falta. Que tal um [produto_favorito] hoje? Responda esta mensagem.'),
  S('reat-90', 'Reativação', 'whatsapp', 'Volta depois de 90 dias', 91, 365, 1, 60,
    'Oi, [nome_cliente]! Faz tempo, hein? A cozinha continua caprichando todos os dias. Se bater a vontade, é só responder que a gente cuida do seu pedido.'),
  S('reat-sms', 'Reativação', 'sms', 'Reativação por SMS', 45, 180, 1, 60,
    '{loja}: [nome_cliente], sentimos sua falta! Faca seu pedido pelo WhatsApp da loja.'),
  S('reat-email', 'Reativação', 'email', 'E-mail de reativação', 60, 365, 1, 60,
    'Oi, [nome_cliente]!\n\nFaz um tempo que você não pede com a gente. Seu pedido continua saindo do jeitinho que você gosta.\n\nSe bater a vontade, é só chamar no WhatsApp.\n\n{assinatura}',
    '[nome_cliente], sentimos sua falta'),
  // Encomendas
  S('enc-festa', 'Encomendas', 'whatsapp', 'Encomenda para festa', 1, null, 2, 60,
    'Oi, [nome_cliente]! Vai ter aniversário, reunião ou festinha? A {loja} prepara a sua encomenda do jeitinho que você gosta. Responda com a data que a gente monta sua encomenda.'),
];

const alcance = s => core.eligible({ id: -1, channel: s.canal, min_days: s.min_days, max_days: s.max_days, min_orders: s.min_orders, cooldown_days: 0, schedule: null }).length;

function listar() {
  return LISTA.map(s => ({ ...s, alcance: alcance(s) }));
}

function usar(id) {
  const s = LISTA.find(x => x.id === id);
  if (!s) throw new Error('Sugestão não encontrada.');
  return campaigns.save({ name: s.nome, channel: s.canal, category: 'marketing', min_days: s.min_days, max_days: s.max_days,
    min_orders: s.min_orders, cooldown_days: s.cooldown_days, ads: [{ body: s.body, header: s.header, buttons: s.canal === 'whatsapp' ? [{ type: 'reply', text: 'Quero pedir' }] : [] }] });
}

module.exports = { listar, usar, LISTA };
