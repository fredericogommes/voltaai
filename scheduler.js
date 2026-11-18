// Envio automatico: de minuto em minuto olha as campanhas ligadas e envia um lote,
// so dentro do periodo e dos horarios permitidos e respeitando os limites.
// So age com SEND_MODE=live. O programa precisa estar aberto no horario do envio.
const db = require('./db');
const core = require('./core');
const wa = require('./whatsapp');
const { MODE } = require('./senders');

const DAY = 864e5;
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mins = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const NOMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

// Padrao: terca a domingo, 16h as 21h (horario de pico de delivery)
function defaults(now = new Date()) {
  const days = {};
  for (let i = 0; i < 7; i++) days[i] = { on: i !== 1, from: '16:00', to: '21:00' };
  return { auto: false, start: ymd(now), end: null, days, daily_cap: null, total_cap: null, max_attempts: 3, per_minute: 20 };
}

const intOrNull = v => (v === '' || v == null || !Number.isFinite(+v) || +v <= 0) ? null : Math.floor(+v);

// Junta o que veio da tela com o padrao e confere. Devolve { schedule, errors }
function normalize(raw, now = new Date()) {
  const d = defaults(now), r = raw && typeof raw === 'object' ? raw : {}, errors = [];
  const s = { auto: !!r.auto, start: r.start || d.start, end: r.end || null, days: {}, daily_cap: intOrNull(r.daily_cap), total_cap: intOrNull(r.total_cap),
    max_attempts: Math.min(10, Math.max(1, intOrNull(r.max_attempts) || 3)), per_minute: Math.min(60, Math.max(1, intOrNull(r.per_minute) || 20)) };
  for (let i = 0; i < 7; i++) { const x = (r.days || {})[i] || d.days[i]; s.days[i] = { on: !!x.on, from: String(x.from || '16:00'), to: String(x.to || '21:00') }; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.start)) errors.push('A data de início é inválida.');
  if (s.end && !/^\d{4}-\d{2}-\d{2}$/.test(s.end)) errors.push('A data de término é inválida.');
  if (s.end && s.start && s.end < s.start) errors.push('A data de término não pode ser antes da data de início.');
  for (let i = 0; i < 7; i++) {
    const x = s.days[i]; if (!x.on) continue;
    if (!HHMM.test(x.from) || !HHMM.test(x.to)) errors.push(`Horário inválido em ${NOMES[i]}.`);
    else if (mins(x.from) >= mins(x.to)) errors.push(`Em ${NOMES[i]}, o horário final precisa ser depois do inicial.`);
  }
  if (s.auto && !Object.values(s.days).some(x => x.on)) errors.push('Escolha pelo menos um dia da semana para o envio automático.');
  return { schedule: s, errors };
}
const parseSchedule = c => {
  try {
    const value = c && Object.prototype.hasOwnProperty.call(c, 'schedule') ? c.schedule : c;
    return normalize(typeof value === 'string' ? JSON.parse(value || 'null') : value).schedule;
  } catch { return normalize(null).schedule; }
};

// Janela de envio aberta agora, ou a proxima. { aberto, de, ate } (Date) ou null
function nextWindow(sch, now = new Date()) {
  for (let i = 0; i < 9; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key = ymd(day);
    if (key < sch.start || (sch.end && key > sch.end)) continue;
    const cfg = sch.days[day.getDay()]; if (!cfg?.on) continue;
    const from = new Date(day.getFullYear(), day.getMonth(), day.getDate(), ...cfg.from.split(':').map(Number));
    const to = new Date(day.getFullYear(), day.getMonth(), day.getDate(), ...cfg.to.split(':').map(Number));
    if (now < from) return { aberto: false, de: from, ate: to };
    if (now < to) return { aberto: true, de: from, ate: to };
  }
  return null;
}

// ---- estado de cada campanha (para a tela) -------------------------------------
const note = (id, obj) => db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  .run('auto:' + id, JSON.stringify({ at: new Date().toISOString(), ...obj }));
const lastNote = id => { try { return JSON.parse(db.prepare('SELECT value FROM meta WHERE key = ?').get('auto:' + id)?.value || 'null'); } catch { return null; } };
const sentToday = (id, now) => db.prepare("SELECT COUNT(*) n FROM messages WHERE campaign_id = ? AND status = 'sent' AND date(sent_at, 'localtime') = ?").get(id, ymd(now)).n;
const sentTotal = id => db.prepare("SELECT COUNT(*) n FROM messages WHERE campaign_id = ? AND status = 'sent'").get(id).n;

function info(c, now = new Date()) {
  const sch = parseSchedule(c), w = nextWindow(sch, now);
  return { on: sch.auto, aberto: !!w?.aberto, de: w?.de?.toISOString() || null, ate: w?.ate?.toISOString() || null,
    hoje: sentToday(c.id, now), total: sentTotal(c.id), ultimo: lastNote(c.id), ativoNoModo: MODE === 'live' };
}

// Por que esta campanha nao pode enviar agora (ou null se pode)
function bloqueio(c) {
  if (c.channel === 'sms') return 'SMS ainda não tem provedor conectado';
  if (!wa.canSend()) return 'WhatsApp não está configurado';
  const t = db.prepare('SELECT status FROM templates WHERE campaign_id = ?').all(c.id);
  if (t.length < core.parseAds(c).length || t.some(x => x.status !== 'APPROVED')) return 'O modelo ainda não foi aprovado pela Meta';
  return null;
}

const rodando = new Set();
async function tick(now = new Date()) {
  const feitos = [];
  if (MODE !== 'live') return feitos;
  for (const c of db.prepare("SELECT * FROM campaigns WHERE status = 'publicada' AND active = 1").all()) {
    const sch = parseSchedule(c);
    if (!sch.auto || rodando.has(c.id)) continue;
    const w = nextWindow(sch, now);
    if (!w?.aberto) continue;
    const motivo = bloqueio(c);
    if (motivo) { note(c.id, { parado: motivo }); continue; }
    let sala = sch.per_minute;
    if (sch.daily_cap != null) sala = Math.min(sala, sch.daily_cap - sentToday(c.id, now));
    if (sch.total_cap != null) sala = Math.min(sala, sch.total_cap - sentTotal(c.id));
    if (sala <= 0) { note(c.id, { parado: 'Limite de mensagens atingido' }); continue; }
    rodando.add(c.id);
    try {
      const r = await core.runCampaign(c.id, { limit: sala, now });
      note(c.id, r.aborted ? { enviadas: r.sent, falhas: r.failed, parado: `Envio interrompido após falhas seguidas: ${r.error}` } : { enviadas: r.sent, falhas: r.failed });
      feitos.push({ id: c.id, ...r });
    } catch (e) { note(c.id, { parado: String(e.message || e) }); }
    finally { rodando.delete(c.id); }
  }
  return feitos;
}

let timer = null;
function start() {
  if (timer) return;
  timer = setInterval(() => tick().catch(() => { /* erro fica registrado em cada campanha */ }), 60 * 1000);
  setTimeout(() => tick().catch(() => {}), 15 * 1000);
}

module.exports = { defaults, normalize, parseSchedule, nextWindow, info, bloqueio, tick, start, NOMES };
