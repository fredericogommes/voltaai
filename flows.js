// Fluxos de automacao: um GATILHO coloca o cliente no fluxo, e ele passa por ETAPAS
// (esperar, enviar mensagem). Cada mensagem e uma campanha "escondida" (flow_id), entao
// aproveita imagem, botoes, aprovacao na Meta e relatorios das campanhas.
// So envia de verdade com SEND_MODE=live (igual ao envio automatico das campanhas).
const db = require('./db');
const core = require('./core');
const sched = require('./scheduler');
const products = require('./products');
const { send, MODE } = require('./senders');

const TRIGGERS = {
  pedido_novo: 'Depois de um pedido',
  primeiro_pedido: 'No primeiro pedido do cliente',
  sem_pedir: 'Quando o cliente fica sem pedir',
  aniversario: 'No aniversário do cliente',
};
const MOBILE = "c.phone GLOB '55[1-9][0-9]9[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'";
const RODAPE_SAIR = 'Para cancelar, responda SAIR.';
const DAY = 864e5, HOUR = 36e5;
const iso = d => new Date(d).toISOString();
const json = (s, padrao) => { try { return JSON.parse(s) ?? padrao; } catch { return padrao; } };

// ---------- ler ------------------------------------------------------------------
function row(id) {
  const f = db.prepare('SELECT * FROM flows WHERE id = ?').get(id);
  if (!f) throw new Error('Fluxo não encontrado');
  return f;
}
function parse(f) {
  return { ...f, trigger: json(f.trigger, {}), steps: json(f.steps, []), schedule: sched.normalize(json(f.schedule, null)).schedule, exit_on_order: !!f.exit_on_order };
}
function campanhaDaEtapa(id) {
  const c = db.prepare('SELECT id, name, status, channel, ads, category, message FROM campaigns WHERE id = ?').get(id);
  if (!c) return null;
  return { id: c.id, status: c.status, channel: c.channel, category: c.category, ads: core.parseAds(c),
    templates: db.prepare('SELECT variant, status FROM templates WHERE campaign_id = ?').all(id) };
}
function get(id) {
  const f = parse(row(id));
  const steps = f.steps.map(s => s.type === 'enviar' ? { ...s, campanha: campanhaDaEtapa(s.campaign_id) } : s);
  const runs = db.prepare(`SELECT r.id, r.state, r.step, r.next_at, r.entered_at, r.exit_reason, c.name, c.phone FROM flow_runs r JOIN customers c ON c.id = r.customer_id
                           WHERE r.flow_id = ? ORDER BY r.entered_at DESC LIMIT 15`).all(id);
  return { ...f, steps, runs, stats: stats(id), preview: previewTrigger(f.trigger, f), aviso: lastNote(id) };
}
function stats(id) {
  const s = Object.fromEntries(db.prepare('SELECT state, COUNT(*) n FROM flow_runs WHERE flow_id = ? GROUP BY state').all(id).map(r => [r.state, r.n]));
  const ids = db.prepare('SELECT id FROM campaigns WHERE flow_id = ?').all(id).map(r => r.id);
  const cs = core.campaignStats().filter(c => ids.includes(c.id));
  return { entraram: Object.values(s).reduce((a, b) => a + b, 0), andamento: s.ativo || 0, concluidos: s.concluido || 0, sairam: s.saiu || 0, falharam: s.falhou || 0,
    enviadas: cs.reduce((a, c) => a + c.enviadas, 0), voltaram: cs.reduce((a, c) => a + c.conversoes, 0), receita: cs.reduce((a, c) => a + c.receita, 0) };
}
function list() {
  return db.prepare('SELECT id FROM flows ORDER BY id DESC').all().map(r => {
    const f = parse(row(r.id));
    return { id: f.id, name: f.name, status: f.status, trigger: f.trigger, steps: f.steps.map(s => s.type === 'enviar' ? { ...s, campanha: campanhaDaEtapa(s.campaign_id) } : s),
      stats: stats(f.id), aviso: lastNote(f.id) };
  });
}

// ---------- validar e salvar -------------------------------------------------------
function validateFlow(d) {
  const err = [];
  if (!String(d.name || '').trim()) err.push('Dê um nome ao fluxo.');
  const t = d.trigger || {};
  if (!TRIGGERS[t.tipo]) err.push('Escolha o gatilho do fluxo.');
  if (t.tipo === 'sem_pedir' && !(Number.isInteger(+t.dias) && +t.dias >= 1 && +t.dias <= 365)) err.push('Informe há quantos dias sem pedir o cliente entra (de 1 a 365).');
  const steps = Array.isArray(d.steps) ? d.steps : [];
  if (!steps.some(s => s.type === 'enviar')) err.push('Adicione pelo menos uma etapa de enviar mensagem.');
  if (steps.length > 12) err.push('Use no máximo 12 etapas.');
  steps.forEach((s, i) => {
    if (s.type === 'esperar') {
      const v = +s.valor, max = s.unidade === 'horas' ? 720 : 365;
      if (!Number.isInteger(v) || v < 1 || v > max) err.push(`Etapa ${i + 1}: informe um tempo de espera entre 1 e ${max} ${s.unidade === 'horas' ? 'horas' : 'dias'}.`);
    } else if (s.type === 'enviar') {
      if (!s.campaign_id && !String(s.texto || '').trim()) err.push(`Etapa ${i + 1}: escreva a mensagem.`);
    } else err.push(`Etapa ${i + 1}: tipo desconhecido.`);
  });
  return err;
}

function save(d) {
  const err = validateFlow(d); if (err.length) throw new Error(err[0]);
  const sc = sched.normalize(d.schedule); if (sc.errors.length) throw new Error(sc.errors[0]);
  const t = d.trigger.tipo === 'sem_pedir' ? { tipo: 'sem_pedir', dias: +d.trigger.dias } : { tipo: d.trigger.tipo };
  const reentry = Math.max(1, Math.min(365, Math.floor(+d.reentry_days) || 30));
  let id = d.id ? +d.id : null;
  const antigo = id ? row(id) : null;

  // fluxo ativo: nao mexe nas etapas (checado ANTES de criar qualquer mensagem nova)
  if (antigo?.status === 'ativo') {
    const norm = s => s.type === 'esperar' ? { type: 'esperar', valor: +s.valor, unidade: s.unidade === 'horas' ? 'horas' : 'dias' } : { type: 'enviar', campaign_id: s.campaign_id ? +s.campaign_id : null };
    if (JSON.stringify(json(antigo.steps, [])) !== JSON.stringify(d.steps.map(norm))) throw new Error('Pause o fluxo antes de mudar as etapas.');
  }

  // cada etapa "enviar" aponta para uma campanha escondida; as novas sao criadas aqui
  const nome = String(d.name).trim();
  let n = 0;
  const steps = d.steps.map(s => {
    if (s.type === 'esperar') return { type: 'esperar', valor: +s.valor, unidade: s.unidade === 'horas' ? 'horas' : 'dias' };
    n++;
    if (s.campaign_id) return { type: 'enviar', campaign_id: +s.campaign_id };
    const ads = JSON.stringify([{ label: 'A', media: null, header: '', body: String(s.texto).trim(), footer: RODAPE_SAIR, buttons: [] }]);
    const r = db.prepare(`INSERT INTO campaigns (name, channel, min_days, max_days, min_orders, cooldown_days, message, ads, category, status, flow_id)
      VALUES (?, 'whatsapp', 0, NULL, 1, 1, ?, ?, 'marketing', 'rascunho', ?)`).run(`Fluxo ${nome}, mensagem ${n}`, String(s.texto).trim(), ads, id || -1);
    return { type: 'enviar', campaign_id: Number(r.lastInsertRowid) };
  });

  if (id) {
    db.prepare('UPDATE flows SET name = ?, trigger = ?, steps = ?, schedule = ?, exit_on_order = ?, reentry_days = ? WHERE id = ?')
      .run(nome, JSON.stringify(t), JSON.stringify(steps), JSON.stringify(sc.schedule), d.exit_on_order ? 1 : 0, reentry, id);
  } else {
    const r = db.prepare('INSERT INTO flows (name, trigger, steps, schedule, exit_on_order, reentry_days) VALUES (?,?,?,?,?,?)')
      .run(nome, JSON.stringify(t), JSON.stringify(steps), JSON.stringify(sc.schedule), d.exit_on_order ? 1 : 0, reentry);
    id = Number(r.lastInsertRowid);
  }
  db.prepare('UPDATE campaigns SET flow_id = ? WHERE flow_id = -1').run(id);          // liga as campanhas novas ao fluxo criado agora
  return { id };
}

function remove(id) {
  const f = row(id);
  if (f.status === 'ativo') throw new Error('Pause o fluxo antes de apagar.');
  const camps = db.prepare('SELECT id FROM campaigns WHERE flow_id = ?').all(id).map(c => c.id);
  if (camps.some(c => db.prepare('SELECT 1 FROM messages WHERE campaign_id = ? LIMIT 1').get(c))) throw new Error('Este fluxo já enviou mensagens, então não dá para apagar. Deixe-o pausado.');
  db.prepare('DELETE FROM flow_runs WHERE flow_id = ?').run(id);
  for (const c of camps) { db.prepare('DELETE FROM templates WHERE campaign_id = ?').run(c); db.prepare('DELETE FROM campaigns WHERE id = ?').run(c); }
  db.prepare('DELETE FROM flows WHERE id = ?').run(id);
}

// ---------- ativar / pausar ----------------------------------------------------------
function bloqueioEtapa(campaignId) {
  const c = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!c) return 'Uma mensagem do fluxo não existe mais';
  if (c.status === 'rascunho') return 'Uma das mensagens ainda é rascunho. Abra a mensagem e publique';
  return MODE === 'live' ? sched.bloqueio(c) : null;
}
function motivoBloqueio(f) {
  for (const s of f.steps) if (s.type === 'enviar') { const b = bloqueioEtapa(s.campaign_id); if (b) return b; }
  return null;
}

function setStatus(id, status) {
  if (!['ativo', 'pausado'].includes(status)) throw new Error('Situação inválida');
  const f = parse(row(id));
  if (status === 'ativo') {
    const err = validateFlow({ ...f, steps: f.steps.map(s => s.type === 'enviar' ? { ...s } : s) }); if (err.length) throw new Error(err[0]);
    const b = motivoBloqueio(f); if (b) throw new Error(b + '.');
    const max = db.prepare('SELECT COALESCE(MAX(id), 0) m FROM orders').get().m;
    db.prepare("UPDATE flows SET status = 'ativo', activated_at = ?, start_order_id = ? WHERE id = ?").run(iso(new Date()), max, id);   // so pedidos NOVOS entram
  } else db.prepare("UPDATE flows SET status = 'pausado' WHERE id = ?").run(id);
  return get(id);
}

// ---------- quem entra --------------------------------------------------------------
const today = now => `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

// [{ customer_id, ref, nome }] que o gatilho aponta agora
function candidatos(f, now = new Date()) {
  const t = f.trigger, base = `c.opt_out = 0 AND substr(c.phone, 3, 1) <> '0' AND ${MOBILE}`;
  if (t.tipo === 'pedido_novo' || t.tipo === 'primeiro_pedido') {
    if (f.start_order_id == null) return [];
    return db.prepare(`SELECT o.id AS ref, o.customer_id, c.name FROM orders o JOIN customers c ON c.id = o.customer_id
      WHERE o.id > ? AND ${base} ${t.tipo === 'primeiro_pedido' ? 'AND (SELECT COUNT(*) FROM orders x WHERE x.customer_id = o.customer_id) = 1' : ''}`).all(f.start_order_id);
  }
  if (t.tipo === 'sem_pedir') {
    const ultimo = db.prepare('SELECT id FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1');
    // janela de 3 dias (N a N+2): quem ja estava sem pedir ha muito tempo nao entra de uma vez
    return core.customersWithRfv().filter(c => !c.opt_out && c.recency >= t.dias && c.recency <= t.dias + 2 && /^55[1-9]\d9\d{8}$/.test(c.phone))
      .map(c => ({ ref: ultimo.get(c.id).id, customer_id: c.id, name: c.name }));
  }
  if (t.tipo === 'aniversario') {
    return db.prepare(`SELECT c.id AS customer_id, c.name, c.birth_date FROM customers c WHERE c.birth_date IS NOT NULL AND substr(c.birth_date, 6, 5) = ? AND ${base}
      AND EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)`).all(today(now)).map(c => ({ ...c, ref: now.getFullYear() }));
  }
  return [];
}

function jaEntrou(f, c, now) {
  if (db.prepare('SELECT 1 FROM flow_runs WHERE flow_id = ? AND customer_id = ? AND trigger_ref = ?').get(f.id, c.customer_id, c.ref)) return true;
  return !!db.prepare('SELECT 1 FROM flow_runs WHERE flow_id = ? AND customer_id = ? AND julianday(?) - julianday(entered_at) < ?').get(f.id, c.customer_id, iso(now), f.reentry_days);
}

function previewTrigger(trigger, f) {
  if (!trigger?.tipo) return { quantos: 0, total: 0 };
  const ff = { ...f, trigger };
  const todos = candidatos(ff, new Date());
  const novos = todos.filter(c => !jaEntrou(ff, c, new Date()));
  const extra = trigger.tipo === 'aniversario' ? { comAniversario: db.prepare("SELECT COUNT(*) n FROM customers WHERE birth_date IS NOT NULL").get().n } : {};
  return { quantos: novos.length, total: todos.length, ...extra };
}
function previewDraft(d) { return previewTrigger(d.trigger, { id: d.id || 0, reentry_days: +d.reentry_days || 30, start_order_id: d.id ? (db.prepare('SELECT start_order_id FROM flows WHERE id = ?').get(d.id)?.start_order_id ?? null) : null }); }

function enroll(f, now) {
  let n = 0;
  const ins = db.prepare('INSERT OR IGNORE INTO flow_runs (flow_id, customer_id, trigger_ref, step, state, next_at, entered_at) VALUES (?,?,?,0,\'ativo\',?,?)');
  for (const c of candidatos(f, now)) { if (jaEntrou(f, c, now)) continue; n += ins.run(f.id, c.customer_id, c.ref, iso(now), iso(now)).changes; }
  return n;
}

// ---------- andar com cada cliente ------------------------------------------------------
const note = (id, obj) => db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('flow:' + id, JSON.stringify({ at: iso(new Date()), ...obj }));
const lastNote = id => json(db.prepare('SELECT value FROM meta WHERE key = ?').get('flow:' + id)?.value, null);

function finish(r, estado, motivo, now) {
  db.prepare('UPDATE flow_runs SET state = ?, exit_reason = ?, finished_at = ? WHERE id = ?').run(estado, motivo || null, iso(now), r.id);
}

async function advance(f, now) {
  const due = db.prepare("SELECT * FROM flow_runs WHERE flow_id = ? AND state = 'ativo' AND next_at <= ? ORDER BY next_at LIMIT 500").all(f.id, iso(now));
  const win = sched.nextWindow(f.schedule, now);
  const motivo = motivoBloqueio(f);
  let enviados = 0, falhasSeguidas = 0, parado = null;
  const campanhas = {};
  for (const r of due) {
    const cli = db.prepare('SELECT * FROM customers WHERE id = ?').get(r.customer_id);
    cli.favorito = products.favoritosMap().get(cli.id)?.curto || null;
    if (cli.opt_out) { finish(r, 'saiu', 'descadastrou', now); continue; }
    if (cli.excluded) { finish(r, 'saiu', 'excluído das listas', now); continue; }
    if (f.exit_on_order && db.prepare('SELECT 1 FROM orders WHERE customer_id = ? AND created_at > ? LIMIT 1').get(r.customer_id, r.entered_at)) { finish(r, 'saiu', 'pediu de novo', now); continue; }
    const etapa = f.steps[r.step];
    if (!etapa) { finish(r, 'concluido', null, now); continue; }
    if (etapa.type === 'esperar') {
      const ms = etapa.valor * (etapa.unidade === 'horas' ? HOUR : DAY);
      db.prepare('UPDATE flow_runs SET step = step + 1, next_at = ? WHERE id = ?').run(iso(now.getTime() + ms), r.id);
      continue;
    }
    // etapa de envio: so dentro da janela, sem bloqueio e dentro do ritmo
    if (!win?.aberto) { if (win) db.prepare('UPDATE flow_runs SET next_at = ? WHERE id = ?').run(iso(win.de), r.id); continue; }
    if (motivo) { parado = motivo; continue; }
    if (enviados >= f.schedule.per_minute || falhasSeguidas >= 3) continue;
    const c = campanhas[etapa.campaign_id] ||= (() => { const x = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(etapa.campaign_id); return { row: x, ads: core.parseAds(x),
      tpls: Object.fromEntries(db.prepare('SELECT * FROM templates WHERE campaign_id = ?').all(x.id).map(t => [t.variant, t])) }; })();
    const ad = c.ads[cli.id % c.ads.length];
    const ins = db.prepare('INSERT INTO messages (campaign_id, customer_id, status, error, variant, rfv_group) VALUES (?,?,?,?,?,?)');
    const grupo = core.rfvOf(cli.id);            // grupo no envio: define a janela de atribuicao
    try {
      const status = await send(c.row, cli, core.render(ad.body, cli), ad, c.tpls[ad.label]);
      ins.run(c.row.id, cli.id, status, null, ad.label, grupo);
      db.prepare('UPDATE flow_runs SET step = step + 1, next_at = ?, fails = 0 WHERE id = ?').run(iso(now), r.id);
      enviados++; falhasSeguidas = 0;
    } catch (e) {
      const msg = String(e.message || e).slice(0, 300);
      ins.run(c.row.id, cli.id, 'failed', msg, ad.label, grupo);
      falhasSeguidas++; parado = falhasSeguidas >= 3 ? `Envio interrompido após falhas seguidas: ${msg}` : parado;
      if (r.fails + 1 >= f.schedule.max_attempts) finish(r, 'falhou', msg, now);
      else db.prepare('UPDATE flow_runs SET fails = fails + 1, next_at = ? WHERE id = ?').run(iso(now.getTime() + 10 * 60 * 1000), r.id);
    }
  }
  return { enviados, parado };
}

async function tick(now = new Date()) {
  const feitos = [];
  if (MODE !== 'live') return feitos;
  for (const raw of db.prepare("SELECT * FROM flows WHERE status = 'ativo'").all()) {
    const f = parse(raw);
    try {
      const entraram = enroll(f, now);
      const r = await advance(f, now);
      note(f.id, r.parado ? { parado: r.parado, enviadas: r.enviados } : { enviadas: r.enviados, entraram });
      feitos.push({ id: f.id, entraram, ...r });
    } catch (e) { note(f.id, { parado: String(e.message || e) }); }
  }
  return feitos;
}

let timer = null;
function start() {
  if (timer) return;
  timer = setInterval(() => tick().catch(() => {}), 60 * 1000);
  setTimeout(() => tick().catch(() => {}), 20 * 1000);
}

module.exports = { TRIGGERS, list, get, save, remove, setStatus, previewDraft, tick, start, candidatos, enroll, parse, row };
