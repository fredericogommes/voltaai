// Envio de mensagens. Por padrao roda em modo "dry" (nao envia nada de verdade).
// Para enviar de verdade: SEND_MODE=live + credenciais do canal no ambiente (.env).
const wa = require('./whatsapp');
const canais = require('./canais');
const MODE = process.env.SEND_MODE === 'live' ? 'live' : 'dry';

// ad = anuncio (texto, imagem, botoes; no e-mail o cabecalho e o assunto); tpl = modelo aprovado na Meta (so WhatsApp)
async function send(campaign, customer, text, ad, tpl) {
  if (MODE === 'dry') return 'dry';
  if (campaign.channel === 'whatsapp') {
    if (!wa.canSend()) throw new Error('WhatsApp nao configurado (WA_TOKEN, WA_PHONE_ID)');
    if (!tpl || tpl.status !== 'APPROVED') throw new Error('Modelo ainda nao aprovado pela Meta');
    await wa.sendTemplate(customer, ad, tpl.name);
  } else if (campaign.channel === 'sms') await canais.enviarSms(customer.phone, text);
  else if (campaign.channel === 'email') {
    const { render } = require('./core');            // aqui para evitar dependencia circular no carregamento
    await canais.enviarEmail(customer.email, render(ad?.header || `Novidades da ${require('./brand').loja.nome}`, customer), text);
  } else throw new Error('Canal desconhecido: ' + campaign.channel);
  return 'sent';
}

module.exports = { send, MODE };
