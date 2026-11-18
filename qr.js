// QR codes com contagem de scans. Os códigos ficam no Supabase; a página pública (função "qr")
// conta cada scan e leva o cliente ao destino. O CRM só cria, lista, liga/desliga e apaga.
const crypto = require('node:crypto');
const nuvem = require('./supabase-sync');

const base = () => (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const linkPublico = code => `${base()}/functions/v1/qr/${code}`;
const exigir = () => { if (!nuvem.configured()) throw new Error('Os QR codes usam o Supabase: configure a cópia no Supabase em Conexões.'); };

function validarDestino(d) {
  const s = String(d || '').trim();
  if (!/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(s)) throw new Error('Informe o destino como um link completo, começando com https://');
  return s;
}

async function listar() {
  if (!nuvem.configured()) return { configurado: false, codigos: [] };
  const clube = `${base()}/functions/v1/clube`;
  const [codigos, stats] = await Promise.all([
    nuvem.api('GET', 'qr_codes?select=*&order=created_at.desc'),
    nuvem.api('GET', 'qr_stats?select=*'),
  ]);
  const st = Object.fromEntries((stats || []).map(s => [s.code, s]));
  const agora = Date.now();
  return {
    configurado: true, clube,
    codigos: (codigos || []).map(c => ({
      ...c, link: linkPublico(c.code), expirado: !!(c.expires_at && new Date(c.expires_at).getTime() < agora),
      scans: st[c.code]?.scans || 0, pessoas: st[c.code]?.pessoas || 0, ultimo_scan: st[c.code]?.ultimo_scan || null,
      scans_7d: st[c.code]?.scans_7d || 0, scans_30d: st[c.code]?.scans_30d || 0, scans_90d: st[c.code]?.scans_90d || 0,
    })),
  };
}

async function criar({ name, destino, material, validade } = {}) {
  exigir();
  const nome = String(name || '').trim();
  if (!nome) throw new Error('Dê um nome ao QR code (só você vê).');
  if (nome.length > 80) throw new Error('O nome passa de 80 caracteres.');
  const v = validade ? new Date(String(validade) + 'T23:59:59') : null;
  if (v && (isNaN(v) || v.getTime() < Date.now())) throw new Error('A validade precisa ser uma data futura.');
  const code = crypto.randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8).padEnd(8, '0');
  await nuvem.api('POST', 'qr_codes', { body: { code, name: nome, destino: validarDestino(destino), material: String(material || '').trim().slice(0, 60) || null,
    expires_at: v ? v.toISOString() : null }, headers: { Prefer: 'return=minimal' } });
  return { code, link: linkPublico(code) };
}

async function alterar(code, { active } = {}) {
  exigir();
  if (!/^[a-z0-9]{4,16}$/.test(String(code))) throw new Error('Código inválido.');
  await nuvem.api('PATCH', `qr_codes?code=eq.${code}`, { body: { active: !!active }, headers: { Prefer: 'return=minimal' } });
  return { ok: true };
}

async function apagar(code) {
  exigir();
  if (!/^[a-z0-9]{4,16}$/.test(String(code))) throw new Error('Código inválido.');
  await nuvem.api('DELETE', `qr_codes?code=eq.${code}`, { headers: { Prefer: 'return=minimal' } });
  return { ok: true };
}

module.exports = { listar, criar, alterar, apagar, linkPublico, validarDestino };
