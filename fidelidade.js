// Programa de fidelidade: pontos por real gasto, calculados das vendas da Saipos, com validade e recompensas.
// O CRM calcula os saldos e publica no Supabase (só hash do telefone + primeiro nome + pontos);
// a página pública "clube" mostra os pontos ao cliente e recebe cadastros de e-mail com consentimento.
const crypto = require('node:crypto');
const db = require('./db');
const nuvem = require('./supabase-sync');
const brand = require('./brand');

const ANON = '5500000000000';
const PADRAO = {
  ativo: false, nome: brand.loja.nome === 'sua loja' ? 'Clube de fidelidade' : `Clube ${brand.loja.nome}`, pontosPorReal: 1, validadeDias: 365, desde: null,
  regras: 'A cada R$ 1 em pedidos identificados com o seu celular, você ganha 1 ponto. Os pontos valem por 12 meses.',
  recompensas: [{ pontos: 150, premio: 'R$ 10 em produtos' }, { pontos: 400, premio: 'R$ 30 em produtos' }, { pontos: 800, premio: 'R$ 60 em produtos' }],
};

const lerMeta = k => { try { return JSON.parse(db.prepare('SELECT value FROM meta WHERE key = ?').get(k)?.value || 'null'); } catch { return null; } };
const gravarMeta = (k, v) => db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));

function config() { return { ...PADRAO, ...(lerMeta('fidelidade') || {}) }; }

function salvar(p) {
  const atual = config();
  const nome = String(p.nome ?? atual.nome).trim();
  if (!nome || nome.length > 60) throw new Error('Dê um nome ao programa (até 60 caracteres).');
  const ppr = Number(String(p.pontosPorReal ?? atual.pontosPorReal).replace(',', '.'));
  if (!(ppr > 0 && ppr <= 100)) throw new Error('Pontos por real: use um número maior que 0.');
  const val = Number(p.validadeDias ?? atual.validadeDias);
  if (!Number.isInteger(val) || val < 30 || val > 3650) throw new Error('Validade dos pontos: de 30 a 3650 dias.');
  const desde = p.desde === undefined ? atual.desde : (p.desde || null);
  if (desde && !/^\d{4}-\d\d-\d\d$/.test(desde)) throw new Error('Data de início inválida.');
  const recompensas = (Array.isArray(p.recompensas) ? p.recompensas : atual.recompensas)
    .map(r => ({ pontos: Number(r.pontos), premio: String(r.premio || '').trim() }))
    .filter(r => r.premio || r.pontos);
  if (!recompensas.length) throw new Error('Cadastre pelo menos uma recompensa.');
  for (const r of recompensas) {
    if (!Number.isInteger(r.pontos) || r.pontos < 1) throw new Error(`Recompensa "${r.premio || '?'}": informe os pontos.`);
    if (!r.premio || r.premio.length > 80) throw new Error('Cada recompensa precisa de uma descrição (até 80 caracteres).');
  }
  recompensas.sort((a, b) => a.pontos - b.pontos);
  const regras = String(p.regras ?? atual.regras).trim().slice(0, 400);
  const ativo = p.ativo === undefined ? atual.ativo : !!p.ativo;
  const v = { ativo, nome, pontosPorReal: ppr, validadeDias: val, desde: desde || (ativo && !atual.desde ? new Date().toISOString().slice(0, 10) : atual.desde), regras, recompensas };
  gravarMeta('fidelidade', v);
  return v;
}

// Saldo de cada cliente identificado: pontos dos pedidos dentro da validade (e depois de "desde"), menos resgates.
function saldos() {
  const c = config();
  const corteValidade = new Date(Date.now() - c.validadeDias * 864e5).toISOString();
  // sem data de início, conta a partir de hoje (o clube ainda não abriu): ninguém tem pontos antes da hora
  const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
  const desde = c.desde ? new Date(c.desde + 'T00:00:00').toISOString() : hoje0.toISOString();
  const inicio = desde > corteValidade ? desde : corteValidade;
  const venceEm30 = new Date(Date.now() - (c.validadeDias - 30) * 864e5).toISOString();
  const linhas = db.prepare(`SELECT cu.id, cu.name, cu.phone, cu.email, cu.opt_out,
      COALESCE(SUM(CAST(o.total * ? AS INTEGER)), 0) ganhos,
      COALESCE(SUM(CASE WHEN o.created_at < ? THEN CAST(o.total * ? AS INTEGER) ELSE 0 END), 0) vencendo,
      COUNT(o.id) pedidos, MAX(o.created_at) ultimo
    FROM customers cu JOIN orders o ON o.customer_id = cu.id
    WHERE cu.excluded = 0 AND cu.phone <> ? AND substr(cu.phone, 3, 1) <> '0' AND cu.phone NOT LIKE 'ext:%' AND o.created_at >= ?
    GROUP BY cu.id`).all(c.pontosPorReal, venceEm30, c.pontosPorReal, ANON, inicio);
  const resg = Object.fromEntries(db.prepare('SELECT customer_id, SUM(pontos) p FROM loyalty_redemptions WHERE created_at >= ? GROUP BY customer_id')
    .all(inicio.replace('T', ' ').slice(0, 19)).map(r => [r.customer_id, r.p]));
  return linhas.map(l => {
    const pontos = Math.max(0, l.ganhos - (resg[l.id] || 0));
    const prox = c.recompensas.find(r => r.pontos > pontos) || null;
    const disponivel = [...c.recompensas].reverse().find(r => r.pontos <= pontos) || null;
    return { id: l.id, nome: l.name, phone: l.phone, pedidos: l.pedidos, ultimo: l.ultimo, pontos, resgatados: resg[l.id] || 0,
      expirando: Math.min(pontos, l.vencendo), proximo: prox?.premio || null, faltam: prox ? prox.pontos - pontos : 0, disponivel: disponivel?.premio || null };
  }).filter(s => s.pontos > 0 || s.resgatados > 0);
}

function resumo() {
  const c = config(), lista = saldos();
  const total = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(pontos), 0) p FROM loyalty_redemptions').get();
  return {
    config: c, link: `${(process.env.SUPABASE_URL || '').replace(/\/+$/, '')}/functions/v1/clube`, publicado: lerMeta('fidelidade_publicado'),
    clientes: lista.length, pontos: lista.reduce((a, s) => a + s.pontos, 0), podemResgatar: lista.filter(s => s.disponivel).length,
    resgates: total.n, pontosResgatados: total.p,
    emailsDoClube: db.prepare('SELECT COUNT(*) n FROM customers WHERE email_optin IS NOT NULL').get().n,
    perto: lista.filter(s => s.proximo && s.faltam <= Math.max(30, (c.recompensas[0]?.pontos || 100) * 0.2)).sort((a, b) => a.faltam - b.faltam).slice(0, 20),
    topo: [...lista].sort((a, b) => b.pontos - a.pontos).slice(0, 20),
    ultimosResgates: db.prepare(`SELECT r.id, r.pontos, r.premio, r.created_at, c.name FROM loyalty_redemptions r JOIN customers c ON c.id = r.customer_id
      ORDER BY r.created_at DESC LIMIT 15`).all(),
  };
}

function buscar(q) {
  const t = String(q || '').trim().toLowerCase(), dig = t.replace(/\D/g, '');
  if (t.length < 2) return [];
  return saldos().filter(s => s.nome.toLowerCase().includes(t) || (dig.length >= 4 && s.phone.includes(dig))).slice(0, 10);
}

function resgatar({ id, pontos, premio }) {
  const s = saldos().find(x => x.id === Number(id));
  if (!s) throw new Error('Cliente sem pontos no programa.');
  const r = config().recompensas.find(x => x.premio === premio && x.pontos === Number(pontos));
  if (!r) throw new Error('Escolha uma recompensa da lista.');
  if (s.pontos < r.pontos) throw new Error(`Pontos insuficientes: ${s.pontos} de ${r.pontos}.`);
  db.prepare('INSERT INTO loyalty_redemptions (customer_id, pontos, premio) VALUES (?, ?, ?)').run(s.id, r.pontos, r.premio);
  return { ok: true, restam: s.pontos - r.pontos };
}

function desfazerResgate(id) {
  const r = db.prepare('DELETE FROM loyalty_redemptions WHERE id = ?').run(Number(id));
  if (!r.changes) throw new Error('Resgate não encontrado.');
  return { ok: true };
}

// ---- publicação no Supabase ----
let pimenta = null;
async function pepper() {
  if (!pimenta) pimenta = await nuvem.api('POST', 'rpc/crm_pepper', { body: {} });
  if (!pimenta) throw new Error('Não consegui ler a chave do clube no Supabase.');
  return pimenta;
}
const hashFone = (fone, p) => crypto.createHash('sha256').update(`${fone}|${p}`).digest('hex');
const primeiroNome = n => { const s = String(n || '').trim().split(/\s+/)[0] || 'Cliente'; return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); };

async function publicar() {
  if (!nuvem.configured()) throw new Error('O clube usa o Supabase: configure a cópia no Supabase em Conexões.');
  const c = config(), p = await pepper();
  await nuvem.api('POST', 'loyalty_program?on_conflict=id', { body: { id: 1, nome: c.nome, regras: c.regras, recompensas: c.recompensas, ativo: !!c.ativo, updated_at: new Date().toISOString() },
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
  const cartoes = c.ativo ? saldos().filter(s => /^55[1-9]\d9?\d{8}$/.test(s.phone)).map(s => ({ phone_hash: hashFone(s.phone, p), first_name: primeiroNome(s.nome), points: s.pontos,
    next_reward: s.proximo, missing: s.proximo ? s.faltam : null, expires_soon: s.expirando, updated_at: new Date().toISOString() })) : [];
  // apaga o que não existe mais (programa desligado, cliente excluído, sem pontos)
  // o Supabase devolve no máximo 1.000 linhas por consulta: lê página por página
  const existentes = [];
  for (let off = 0; ; off += 1000) {
    const pag = await nuvem.api('GET', `loyalty_cards?select=phone_hash&order=phone_hash&limit=1000&offset=${off}`) || [];
    existentes.push(...pag.map(r => r.phone_hash));
    if (pag.length < 1000) break;
  }
  const agora = new Set(cartoes.map(x => x.phone_hash));
  const sobra = existentes.filter(h => !agora.has(h));
  for (let i = 0; i < sobra.length; i += 100) await nuvem.api('DELETE', `loyalty_cards?phone_hash=in.(${sobra.slice(i, i + 100).join(',')})`, { headers: { Prefer: 'return=minimal' } });
  for (let i = 0; i < cartoes.length; i += 500) await nuvem.api('POST', 'loyalty_cards?on_conflict=phone_hash', { body: cartoes.slice(i, i + 500), headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
  const cad = await importarCadastros(p);
  const r = { cartoes: cartoes.length, apagados: sobra.length, ...cad, em: new Date().toISOString() };
  gravarMeta('fidelidade_publicado', r);
  return r;
}

// E-mails cadastrados na página do clube: casam pelo hash do telefone e viram o e-mail do cliente (com a data do aceite).
async function importarCadastros(p) {
  const cads = [];
  for (let off = 0; ; off += 1000) {
    const pag = await nuvem.api('GET', `loyalty_signups?select=id,phone_hash,email,consent,created_at&order=id&limit=1000&offset=${off}`) || [];
    cads.push(...pag);
    if (pag.length < 1000) break;
  }
  if (!cads.length) return { cadastrosNovos: 0, cadastrosSemCliente: 0 };
  const porHash = new Map(db.prepare("SELECT id, phone FROM customers WHERE phone GLOB '55[1-9]*'").all().map(c => [hashFone(c.phone, p), c.id]));
  const upd = db.prepare('UPDATE customers SET email = ?, email_optin = ?, opt_out = opt_out WHERE id = ?');
  const usados = [];
  let semCliente = 0;
  for (const s of cads) {
    const id = porHash.get(s.phone_hash);
    if (!id || !s.consent) { semCliente++; continue; }
    upd.run(s.email, s.created_at, id); usados.push(s.id);
  }
  for (let i = 0; i < usados.length; i += 100) await nuvem.api('DELETE', `loyalty_signups?id=in.(${usados.slice(i, i + 100).join(',')})`, { headers: { Prefer: 'return=minimal' } });
  return { cadastrosNovos: usados.length, cadastrosSemCliente: semCliente };
}

module.exports = { config, salvar, saldos, resumo, buscar, resgatar, desfazerResgate, publicar, hashFone, PADRAO };
