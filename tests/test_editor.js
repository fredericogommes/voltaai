// Teste do editor/Meta com banco temporario e Meta de mentira. Uso: node test_editor.js <pasta do projeto>
const path = require('path'), fs = require('fs'), os = require('os'), zlib = require('zlib'), http = require('http');
const root = path.resolve(process.argv[2]);
process.env.DB_PATH = path.join(os.tmpdir(), 'editor_test.db'); fs.rmSync(process.env.DB_PATH, { force: true });
process.env.SEND_MODE = 'live';
Object.assign(process.env, { WA_TOKEN: 'tok', WA_PHONE_ID: 'PHONE1', WA_WABA_ID: 'WABA1', WA_APP_ID: 'APP1', GRAPH_BASE: 'http://127.0.0.1:4568/v1' });

// PNG valido (gradiente 120x80)
function png(w, h) {
  const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 240; raw[o + 1] = 160 + y; raw[o + 2] = 30; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const log = [];
const mock = http.createServer((req, res) => {
  const chunks = []; req.on('data', d => chunks.push(d)); req.on('end', () => {
    const body = Buffer.concat(chunks); const u = req.url;
    log.push(`${req.method} ${u.split('?')[0]}${req.headers['file_offset'] ? ' [upload bytes=' + body.length + ']' : ''}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (u.includes('/uploads?')) return res.end(JSON.stringify({ id: 'upload:SESS' }));
    if (u.includes('/upload:SESS')) return res.end(JSON.stringify({ h: 'HANDLE123' }));
    if (u.includes('/WABA1/message_templates')) { mock.last = JSON.parse(body); return res.end(JSON.stringify({ id: 'TPL' + log.length, status: 'PENDING', category: 'MARKETING' })); }
    if (u.includes('/PHONE1/media')) return res.end(JSON.stringify({ id: 'MEDIA777' }));
    if (u.includes('/PHONE1/messages')) { (mock.sent ||= []).push(JSON.parse(body)); return res.end(JSON.stringify({ messages: [{ id: 'wamid' }] })); }
    if (/\/TPL\d+\?fields/.test(u)) return res.end(JSON.stringify({ status: mock.approved ? 'APPROVED' : 'PENDING' }));
    res.writeHead(404); res.end('{}');
  });
});

mock.listen(4568, async () => {
  const db = require(path.join(root, 'db.js')), core = require(path.join(root, 'core.js')), camp = require(path.join(root, 'campaigns.js'));
  const ok = (c, m) => console.log((c ? 'OK   ' : 'FALHOU ') + m);
  // clientes e pedidos
  core.importOrders([{ external_id: 'a', name: 'Maria Silva', phone: '24999887766', total: 50, created_at: '2026-09-09T12:00:00' },
    { external_id: 'b', name: 'João Souza', phone: '24988776655', total: 60, created_at: '2026-09-10T12:00:00' }]);

  // imagem
  const m = camp.saveMedia(png(120, 80), 'Foto Coxinha!.png'); ok(/^Foto-Coxinha-[0-9a-f]{6}\.png$/.test(m.file), 'imagem salva como ' + m.file);
  try { camp.saveMedia(Buffer.from('nao e imagem'), 'x.png'); ok(false, 'recusar arquivo que nao e imagem'); } catch (e) { ok(true, 'recusa arquivo falso: ' + e.message); }

  // validacoes
  const base = { name: 'Teste', channel: 'whatsapp', min_days: 30, max_days: 90, min_orders: 1, cooldown_days: 30 };
  for (const [nome, ads] of [['nome no comeco', [{ body: '[nome_cliente], volte!' }]], ['link invalido', [{ body: 'Oi [nome_cliente], tudo bem?', buttons: [{ type: 'url', text: 'Pedir', value: 'ftp://x' }] }]],
    ['imagem + cabecalho', [{ body: 'Oi, volte hoje', media: m.file, header: 'Oi' }]], ['2 nomes', [{ body: 'Oi [nome_cliente], olá [nome_cliente] tudo bem' }]]]) {
    try { camp.save({ ...base, ads }); ok(false, 'deveria recusar: ' + nome); } catch (e) { ok(true, `recusa (${nome}): ${e.message}`); }
  }

  // campanha com 2 anuncios, imagem e botoes
  const r = camp.save({ ...base, name: 'Volta com imagem', ads: [
    { body: 'Oi, [nome_cliente]! Saudade da crocância?', media: m.file, footer: 'Para cancelar, responda SAIR.', buttons: [{ type: 'url', text: 'Peça agora', value: 'https://loja.example/pedir' }, { type: 'copy', text: '', value: 'VOLTA10' }, { type: 'optin', text: 'Quero receber', value: '' }] },
    { body: 'Ei, [nome_cliente], os salgados estão quentinhos!', footer: 'Para cancelar, responda SAIR.' }] });
  ok(r.status === 'rascunho', 'campanha criada como rascunho, id ' + r.id);
  ok(camp.get(r.id).ads.length === 2, '2 anuncios salvos');

  // publicar na Meta de mentira
  const p = await camp.publish(r.id); ok(p.status === 'aguardando', 'publicar -> aguardando aprovacao da Meta');
  const tplCall = mock.last;
  ok(log.some(l => l.includes('/APP1/uploads')) && log.some(l => l.includes('upload:SESS')), 'imagem de exemplo enviada em partes (' + log.filter(l => l.includes('upload')).join(' | ') + ')');
  console.log('     ultimo modelo enviado:', JSON.stringify(tplCall.components.map(c => c.type + (c.format ? ':' + c.format : ''))), 'categoria', tplCall.category, 'nome', tplCall.name);
  const A = camp.get(r.id);
  // so o 2o modelo (sem imagem) foi o ultimo; confere o 1o pelo log de payloads
  ok(A.templates.length === 2 && A.templates.every(t => t.status === 'PENDING'), 'dois modelos PENDING');

  // enviar antes da aprovacao deve falhar por anuncio
  let res = await core.runCampaign(r.id); ok(res.sent === 0 && res.failed === 2, `antes da aprovacao: ${res.failed} falhas (esperado 2)`);
  console.log('     erro registrado:', db.prepare("SELECT error FROM messages LIMIT 1").get().error);
  db.exec('DELETE FROM messages');

  // aprovar
  mock.approved = true; const up = await camp.refreshTemplates(r.id);
  ok(up.status === 'publicada' && up.templates.every(t => t.status === 'APPROVED'), 'apos aprovacao: campanha publicada');
  res = await core.runCampaign(r.id); ok(res.sent === 2 && res.failed === 0, `envio real simulado: ${res.sent} enviadas`);
  const comImg = mock.sent.find(s => s.template.components.some(c => c.type === 'header'));
  console.log('     payload com imagem:', JSON.stringify(comImg.template.components));
  ok(!!comImg && comImg.template.components.some(c => c.type === 'header' && c.parameters[0].image.id === 'MEDIA777'), 'mensagem com imagem usa o id de midia da Meta');
  ok(comImg.template.components.some(c => c.sub_type === 'copy_code'), 'botao copiar codigo enviado com o cupom');
  ok(db.prepare("SELECT COUNT(DISTINCT variant) n FROM messages").get().n === 2, 'clientes divididos entre anuncios A e B');

  // editar texto volta para rascunho
  const e2 = camp.save({ ...base, id: r.id, name: 'Volta com imagem', ads: [{ body: 'Texto novo [nome_cliente], vem pedir!', media: m.file }] });
  ok(e2.status === 'rascunho', 'editar o texto volta a campanha para rascunho (modelo antigo descartado)');

  // apagar imagem em uso
  try { camp.deleteMedia(m.file); ok(false, 'nao deveria apagar imagem em uso'); } catch (e) { ok(true, 'imagem em uso nao e apagada'); }
  fs.rmSync(path.join(root, 'public', 'media', m.file), { force: true });   // limpeza do teste
  mock.close(); process.exit(0);
});
