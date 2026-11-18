// Cópia do banco no Supabase (projeto em São Paulo). Sem dependências: usa o fetch do Node 22.
//
// O app continua trabalhando no SQLite local. Este módulo:
//   enviar()            espelha o SQLite no Supabase: insere/atualiza tudo e apaga lá o que foi apagado aqui
//                       (é isso que faz uma exclusão da LGPD chegar também à cópia)
//   restaurar(arquivo)  baixa a cópia do Supabase para um arquivo SQLite NOVO (nunca sobrescreve)
//
// Linha de comando:
//   node --env-file=.env supabase-sync.js enviar
//   node --env-file=.env supabase-sync.js restaurar crm-restaurado.db
//
// Precisa no .env de SUPABASE_URL, SUPABASE_KEY (a chave anon do projeto) e SUPABASE_CRM_SECRET.
// A chave anon sozinha não lê nada: as tabelas só respondem a quem manda o segredo no cabeçalho x-crm-key
// (o banco guarda só o SHA-256 dele, na função private.crm_ok). O segredo fica só no .env, nunca no Git.

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_KEY || '';
const SECRET = process.env.SUPABASE_CRM_SECRET || '';
const configured = () => !!(URL_ && KEY && SECRET);

// Ordem das chaves estrangeiras: pai antes de filho (para inserir) e o contrário (para apagar).
const TABLES = [
  { t: 'customers', pk: 'id', bool: ['opt_out', 'excluded'], sqliteDate: ['created_at'], isoDate: ['email_optin'] },
  { t: 'orders', pk: 'id', isoDate: ['created_at'] },
  { t: 'flows', pk: 'id', bool: ['exit_on_order'], json: ['trigger', 'steps', 'schedule'], sqliteDate: ['created_at'], isoDate: ['activated_at'] },
  { t: 'campaigns', pk: 'id', bool: ['active'], json: ['ads', 'schedule'], isoDate: ['created_at', 'updated_at'] },
  { t: 'messages', pk: 'id', sqliteDate: ['sent_at'] },
  { t: 'order_items', pk: 'id' },
  { t: 'item_choices', pk: 'id' },
  { t: 'flow_runs', pk: 'id', isoDate: ['next_at', 'entered_at', 'finished_at'] },
  { t: 'templates', pk: 'id', sqliteDate: ['updated_at'] },
  { t: 'loyalty_redemptions', pk: 'id', sqliteDate: ['created_at'] },
  { t: 'meta', pk: 'key' },
];
const LOTE = 500;

async function api(method, path, { body, headers = {} } = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'x-crm-key': SECRET, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase ${method} ${path.split('?')[0]}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

// SQLite -> Postgres
function paraNuvem(spec, row) {
  const o = { ...row };
  for (const c of spec.bool || []) if (o[c] !== null && o[c] !== undefined) o[c] = !!o[c];
  for (const c of spec.json || []) {
    if (o[c] === null || o[c] === undefined || o[c] === '') { o[c] = null; continue; }
    try { o[c] = JSON.parse(o[c]); } catch { throw new Error(`${spec.t}.${c} do registro ${o[spec.pk]} não é JSON válido`); }
  }
  // datetime('now') do SQLite grava "AAAA-MM-DD HH:MM:SS" em UTC, sem fuso: marca como UTC
  for (const c of spec.sqliteDate || []) if (typeof o[c] === 'string' && /^\d{4}-\d\d-\d\d \d/.test(o[c])) o[c] = o[c].replace(' ', 'T') + 'Z';
  return o;
}

// Postgres -> SQLite (volta exatamente aos formatos que o app grava)
function paraLocal(spec, row) {
  const o = { ...row };
  for (const c of spec.bool || []) if (o[c] !== null && o[c] !== undefined) o[c] = o[c] ? 1 : 0;
  for (const c of spec.json || []) if (o[c] !== null && o[c] !== undefined) o[c] = JSON.stringify(o[c]);
  for (const c of spec.sqliteDate || []) if (o[c]) o[c] = new Date(o[c]).toISOString().slice(0, 19).replace('T', ' ');
  for (const c of spec.isoDate || []) if (o[c]) o[c] = new Date(o[c]).toISOString();
  return o;
}

async function idsNaNuvem(spec) {
  const ids = [];
  for (let off = 0; ; off += 1000) {
    const page = await api('GET', `${spec.t}?select=${spec.pk}&order=${spec.pk}&limit=1000&offset=${off}`);
    ids.push(...page.map(r => r[spec.pk]));
    if (page.length < 1000) return ids;
  }
}

const filtroIn = (spec, ids) => `${spec.pk}=in.(${ids.map(v => spec.pk === 'id' ? v : `"${String(v).replace(/"/g, '\\"')}"`).join(',')})`;

let rodando = null;
function enviar() {
  if (!configured()) return Promise.resolve({ skipped: 'SUPABASE_URL, SUPABASE_KEY ou SUPABASE_CRM_SECRET ausente' });
  if (rodando) return rodando;
  const db = require('./db');
  // Fotografia coerente: tudo é lido de forma síncrona, na mesma volta, antes de qualquer espera de rede.
  // Nenhum outro código do app roda no meio, então pedido e itens nunca saem desencontrados.
  const foto = TABLES.map(spec => ({ spec, rows: db.prepare(`SELECT * FROM ${spec.t}`).all().map(r => paraNuvem(spec, r)) }));
  rodando = (async () => {
    const res = { enviados: {}, apagados: {} };
    // 1) apagar lá o que não existe mais aqui (filhos primeiro)
    for (const { spec, rows } of [...foto].reverse()) {
      const aqui = new Set(rows.map(r => r[spec.pk]));
      const sobra = (await idsNaNuvem(spec)).filter(id => !aqui.has(spec.pk === 'id' ? Number(id) : id));
      for (let i = 0; i < sobra.length; i += 200) await api('DELETE', `${spec.t}?${filtroIn(spec, sobra.slice(i, i + 200))}`, { headers: { Prefer: 'return=minimal' } });
      res.apagados[spec.t] = sobra.length;
    }
    // 2) inserir/atualizar tudo (pais primeiro)
    for (const { spec, rows } of foto) {
      for (let i = 0; i < rows.length; i += LOTE)
        await api('POST', `${spec.t}?on_conflict=${spec.pk}`, { body: rows.slice(i, i + LOTE), headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
      res.enviados[spec.t] = rows.length;
    }
    return res;
  })().finally(() => { rodando = null; });
  return rodando;
}

async function restaurar(arquivo) {
  if (!configured()) throw new Error('Configure SUPABASE_URL, SUPABASE_KEY e SUPABASE_CRM_SECRET no .env.');
  const fs = require('node:fs');
  const path = require('node:path');
  const destino = path.resolve(arquivo || 'crm-restaurado.db');
  if (fs.existsSync(destino)) throw new Error(`${destino} já existe. Escolha outro nome: a restauração nunca sobrescreve um banco.`);
  process.env.DB_PATH = destino;          // db.js cria o arquivo novo com o mesmo schema do app
  const db = require('./db');
  const res = {};
  db.exec('BEGIN');
  try {
    for (const spec of TABLES) {
      let n = 0;
      for (let off = 0; ; off += 1000) {
        const page = await api('GET', `${spec.t}?select=*&order=${spec.pk}&limit=1000&offset=${off}`);
        for (const r of page.map(x => paraLocal(spec, x))) {
          const cols = Object.keys(r);
          db.prepare(`INSERT INTO ${spec.t} (${cols.map(c => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map(c => r[c]));
          n++;
        }
        if (page.length < 1000) break;
      }
      res[spec.t] = n;
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { arquivo: destino, linhas: res };
}

module.exports = { enviar, restaurar, configured, api };

if (require.main === module) {
  const [cmd, arg] = process.argv.slice(2);
  const run = cmd === 'enviar' ? enviar() : cmd === 'restaurar' ? restaurar(arg) : null;
  if (!run) { console.error('Uso: node --env-file=.env supabase-sync.js enviar | restaurar <arquivo.db>'); process.exit(2); }
  run.then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(e.message || e); process.exit(1); });
}
