// Canais de SMS (Zenvia) e e-mail (Resend). Sem dependências: usa o fetch do Node.
//
// .env:
//   ZENVIA_TOKEN      token da API da Zenvia (Zenvia > Desenvolvedores > Tokens)
//   ZENVIA_FROM       remetente do SMS na Zenvia (a palavra-chave ou o nome do canal SMS da conta)
//   RESEND_API_KEY    chave da API do Resend (resend.com > API Keys)
//   EMAIL_FROM        remetente, ex.: Minha Loja <contato@minhaloja.com.br> (o domínio precisa estar verificado no Resend)
//   EMAIL_REPLY_TO    opcional: e-mail que recebe as respostas e os pedidos de descadastro

const env = () => ({
  zenviaToken: (process.env.ZENVIA_TOKEN || '').trim(), zenviaFrom: (process.env.ZENVIA_FROM || '').trim(),
  resendKey: (process.env.RESEND_API_KEY || '').trim(), emailFrom: (process.env.EMAIL_FROM || '').trim(),
  replyTo: (process.env.EMAIL_REPLY_TO || '').trim(),
});
const smsPronto = () => { const e = env(); return !!(e.zenviaToken && e.zenviaFrom); };
const emailPronto = () => { const e = env(); return !!(e.resendKey && e.emailFrom); };

const RODAPE_SMS = ' Para nao receber mais, responda SAIR.';
const emailValido = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());

async function chamar(url, opcoes, servico) {
  let r;
  try { r = await fetch(url, { ...opcoes, signal: AbortSignal.timeout(30000) }); }
  catch (e) { throw new Error(`${servico} não respondeu: ${e.message}`); }
  const corpo = await r.text();
  let j = null; try { j = JSON.parse(corpo); } catch { /* resposta sem JSON */ }
  if (!r.ok) throw new Error(`${servico} recusou (${r.status}): ${(j?.message || j?.error?.message || j?.name || corpo).toString().slice(0, 200)}`);
  return j;
}

// SMS pela Zenvia. Texto puro; o rodapé de descadastro é acrescentado se couber.
async function enviarSms(telefone, texto) {
  const e = env();
  if (!smsPronto()) throw new Error('SMS sem provedor: preencha ZENVIA_TOKEN e ZENVIA_FROM no arquivo .env');
  const to = String(telefone || '').replace(/\D/g, '');
  if (!/^55[1-9]\d9\d{8}$/.test(to)) throw new Error('Telefone sem celular válido para SMS');
  const msg = (String(texto).length + RODAPE_SMS.length <= 459 ? String(texto) + RODAPE_SMS : String(texto)).normalize('NFC');
  const j = await chamar('https://api.zenvia.com/v2/channels/sms/messages', {
    method: 'POST', headers: { 'X-API-TOKEN': e.zenviaToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: e.zenviaFrom, to, contents: [{ type: 'text', text: msg }] }),
  }, 'A Zenvia');
  return j?.id || null;
}

const escHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// E-mail pelo Resend. Texto simples convertido em HTML com parágrafos; rodapé com como sair da lista.
async function enviarEmail(para, assunto, texto) {
  const e = env();
  if (!emailPronto()) throw new Error('E-mail sem provedor: preencha RESEND_API_KEY e EMAIL_FROM no arquivo .env');
  if (!emailValido(para)) throw new Error('Cliente sem e-mail válido');
  const sair = e.replyTo ? `Para não receber mais e-mails, responda esta mensagem com a palavra SAIR.` : 'Para não receber mais e-mails, responda esta mensagem com a palavra SAIR.';
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#222;max-width:560px">
${String(texto).split(/\n{2,}/).map(p => `<p>${escHtml(p).replace(/\n/g, '<br>')}</p>`).join('\n')}
<p style="font-size:12px;color:#777;margin-top:28px">${escHtml(sair)}</p></div>`;
  const headers = e.replyTo ? { 'List-Unsubscribe': `<mailto:${e.replyTo}?subject=SAIR>` } : undefined;
  const j = await chamar('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${e.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: e.emailFrom, to: [String(para).trim()], subject: assunto, html, text: `${texto}\n\n${sair}`,
      ...(e.replyTo ? { reply_to: e.replyTo } : {}), ...(headers ? { headers } : {}) }),
  }, 'O Resend');
  return j?.id || null;
}

// Verificação da tela Conexões: confere o que dá para conferir sem enviar nada.
async function verificar(canal) {
  const e = env(), itens = [];
  if (canal === 'email') {
    itens.push({ titulo: 'Dados no arquivo .env', ok: emailPronto(), detalhe: emailPronto() ? 'RESEND_API_KEY e EMAIL_FROM preenchidos' : 'Falta RESEND_API_KEY ou EMAIL_FROM' });
    if (emailPronto()) {
      const dominio = (e.emailFrom.match(/@([^>\s]+)/) || [])[1]?.toLowerCase();
      try {
        const j = await chamar('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${e.resendKey}` } }, 'O Resend');
        itens.push({ titulo: 'Chave do Resend', ok: true, detalhe: 'Aceita' });
        const d = (j?.data || []).find(x => x.name?.toLowerCase() === dominio);
        itens.push({ titulo: `Domínio ${dominio || '(sem domínio no EMAIL_FROM)'}`, ok: d?.status === 'verified',
          detalhe: !d ? 'Não cadastrado no Resend' : d.status === 'verified' ? 'Verificado' : `Status: ${d.status}`,
          ajuda: d?.status === 'verified' ? '' : 'No Resend, em Domains, adicione o domínio e crie no DNS os registros que ele mostrar (SPF e DKIM).' });
      } catch (err) { itens.push({ titulo: 'Chave do Resend', ok: false, detalhe: err.message }); }
    }
  } else {
    itens.push({ titulo: 'Dados no arquivo .env', ok: smsPronto(), detalhe: smsPronto() ? 'ZENVIA_TOKEN e ZENVIA_FROM preenchidos' : 'Falta ZENVIA_TOKEN ou ZENVIA_FROM' });
    if (smsPronto()) itens.push({ titulo: 'Token e remetente', aviso: true, detalhe: 'A Zenvia só confirma o token num envio. Use "Enviar teste" para o seu celular.' });
  }
  return { itens, pronto: itens.every(i => i.ok || i.aviso) && itens.length > 0 };
}

module.exports = { smsPronto, emailPronto, enviarSms, enviarEmail, verificar, emailValido };
