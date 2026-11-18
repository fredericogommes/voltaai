// Parâmetros editáveis pela loja (tela Ajustes), guardados na tabela meta.
// Os padrões são os valores fixos que o programa usava antes, então nada muda até a loja mexer.
const db = require('./db');

const GRUPOS = ['Campeões', 'Fiéis', 'Lealdade potencial', 'Promissores', 'Em risco', 'Perdidos'];

// RFV: os dois grupos de baixo saem da recência; entre os recentes, da frequência nos últimos 12 meses
const RFV_PADRAO = { perdidos: 90, risco: 30, campeoes: 8, fieis: 4, lealdade: 2 };
// Janela de atribuição: dias depois da mensagem em que um pedido conta como conversão, pelo grupo do cliente no envio
const JANELA_PADRAO = Object.fromEntries(GRUPOS.map(g => [g, 7]));

const ler = k => { try { return JSON.parse(db.prepare('SELECT value FROM meta WHERE key = ?').get(k)?.value || 'null'); } catch { return null; } };
const gravar = (k, v) => db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));
const inteiro = (v, min, max) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : null; };

let cacheRfv = null, cacheJanela = null;

function rfv() {
  if (!cacheRfv) cacheRfv = { ...RFV_PADRAO, ...(ler('rfv_params') || {}) };
  return cacheRfv;
}

function salvarRfv(p) {
  const v = {
    perdidos: inteiro(p.perdidos, 2, 3650), risco: inteiro(p.risco, 1, 3650),
    campeoes: inteiro(p.campeoes, 2, 365), fieis: inteiro(p.fieis, 2, 365), lealdade: inteiro(p.lealdade, 2, 365),
  };
  const faltou = Object.entries(v).find(([, n]) => n === null);
  if (faltou) throw new Error('Preencha todos os campos do RFV com números inteiros.');
  if (v.risco >= v.perdidos) throw new Error('"Em risco" precisa começar antes de "Perdidos": use menos dias em "Em risco".');
  if (!(v.campeoes > v.fieis && v.fieis > v.lealdade)) throw new Error('Os pedidos precisam diminuir de Campeões para Fiéis e de Fiéis para Lealdade potencial.');
  gravar('rfv_params', v); cacheRfv = null;
  return rfv();
}

function janela() {
  if (!cacheJanela) {
    const salvo = ler('janela_atribuicao') || {};
    cacheJanela = Object.fromEntries(GRUPOS.map(g => [g, inteiro(salvo[g], 1, 90) ?? JANELA_PADRAO[g]]));
  }
  return cacheJanela;
}

function salvarJanela(p) {
  const v = {};
  for (const g of GRUPOS) {
    const n = inteiro(p?.[g], 1, 90);
    if (n === null) throw new Error(`Janela de "${g}": use um número inteiro de 1 a 90 dias.`);
    v[g] = n;
  }
  gravar('janela_atribuicao', v); cacheJanela = null;
  return janela();
}

// Trecho SQL com a janela da mensagem `m`: usa o grupo gravado no envio; mensagens antigas, sem grupo, ficam com 7 dias
function janelaSql(m = 'm') {
  const j = janela();
  return `(CASE ${m}.rfv_group ${GRUPOS.map(g => `WHEN '${g.replace(/'/g, "''")}' THEN ${j[g]}`).join(' ')} ELSE ${JANELA_PADRAO[GRUPOS[0]]} END)`;
}

// Custo por mensagem enviada, por canal (R$), para custo, ROAS e ROI no painel de performance.
// Padrões aproximados: WhatsApp = mensagem de marketing da Meta no Brasil; SMS = Zenvia; e-mail = plano grátis do Resend.
const CUSTO_PADRAO = { whatsapp: 0.35, sms: 0.10, email: 0 };
let cacheCusto = null;
function custos() {
  if (!cacheCusto) {
    const salvo = ler('custo_mensagem') || {};
    cacheCusto = Object.fromEntries(Object.keys(CUSTO_PADRAO).map(k => {
      const n = Number(salvo[k]); return [k, Number.isFinite(n) && n >= 0 && n <= 10 ? n : CUSTO_PADRAO[k]];
    }));
  }
  return cacheCusto;
}
function salvarCustos(p) {
  const v = {};
  for (const k of Object.keys(CUSTO_PADRAO)) {
    const n = Number(String(p?.[k] ?? '').replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 10) throw new Error(`Custo de ${k === 'email' ? 'e-mail' : k === 'sms' ? 'SMS' : 'WhatsApp'}: use um valor de R$ 0 a R$ 10.`);
    v[k] = Math.round(n * 10000) / 10000;
  }
  gravar('custo_mensagem', v); cacheCusto = null;
  return custos();
}

module.exports = { GRUPOS, RFV_PADRAO, JANELA_PADRAO, rfv, salvarRfv, janela, salvarJanela, janelaSql, CUSTO_PADRAO, custos, salvarCustos };
