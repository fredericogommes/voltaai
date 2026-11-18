// Teste do programa de fidelidade (pontos, validade, recompensas, resgates) e das validações dos QR codes. Banco temporário, sem Supabase.
const path = require('path'), fs = require('fs'), os = require('os');
const root = path.resolve(process.argv[2]);
process.env.DB_PATH = path.join(os.tmpdir(), 'fidelidade_test.db'); fs.rmSync(process.env.DB_PATH, { force: true });
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_KEY; delete process.env.SUPABASE_CRM_SECRET;
const db = require(path.join(root, 'db.js')), core = require(path.join(root, 'core.js'));
const fid = require(path.join(root, 'fidelidade.js')), qr = require(path.join(root, 'qr.js'));
let falhas = 0;
const ok = (c, m) => { if (!c) falhas++; console.log((c ? 'OK   ' : 'FALHOU ') + m); };
const lanca = (fn, m) => { try { fn(); ok(false, m + ' (não recusou)'); } catch { ok(true, m); } };
const lancaAsync = async (fn, m) => { try { await fn(); ok(false, m + ' (não recusou)'); } catch { ok(true, m); } };
const dia = n => new Date(Date.now() - n * 864e5).toISOString();
const ymd = n => dia(n).slice(0, 10);
let seq = 0;
const ped = (nome, fone, diasAtras, total) => core.importOrders([{ external_id: 'f' + (++seq), name: nome, phone: fone, total, created_at: dia(diasAtras) }]);

(async () => {
  ped('Ana Souza', '24999990001', 10, 120.9);   // 120 pontos
  ped('Ana Souza', '24999990001', 400, 300);    // fora da validade de 365 dias
  ped('Bia', '24999990002', 5, 60);
  ped('Caio', '2433334444', 5, 500);            // telefone fixo: também ganha (consulta com o fixo)
  core.importOrders([{ external_id: 'anon1', total: 999, created_at: dia(3) }]);   // venda sem cliente

  ok(fid.saldos().length === 0, 'clube fechado e sem data de início: ninguém tem pontos');
  fid.salvar({ ativo: true, desde: ymd(500), recompensas: [{ pontos: 100, premio: 'Brinde pequeno' }, { pontos: 200, premio: 'Brinde grande' }] });
  const ana = () => fid.saldos().find(s => s.nome === 'Ana Souza');
  ok(ana()?.pontos === 120, `Ana: 120 pontos (só o pedido dentro de 365 dias, arredondado para baixo) (${ana()?.pontos})`);
  ok(ana().disponivel === 'Brinde pequeno' && ana().proximo === 'Brinde grande' && ana().faltam === 80, 'Ana pode trocar o pequeno e faltam 80 para o grande');
  ok(fid.saldos().find(s => s.nome === 'Caio')?.pontos === 500, 'cliente com telefone fixo ganha pontos');
ok(!fid.saldos().some(s => /Sem cliente/.test(s.nome)), 'venda sem cliente identificado não gera pontos');
  fid.salvar({ pontosPorReal: 2 });
  ok(ana().pontos === 241, `2 pontos por real: 241 (${ana().pontos})`);
  fid.salvar({ pontosPorReal: 1 });

  // resgates
  lanca(() => fid.resgatar({ id: ana().id, pontos: 200, premio: 'Brinde grande' }), 'recusa resgate sem pontos suficientes');
  lanca(() => fid.resgatar({ id: ana().id, pontos: 50, premio: 'Brinde pequeno' }), 'recusa recompensa que não está na lista');
  const r = fid.resgatar({ id: ana().id, pontos: 100, premio: 'Brinde pequeno' });
  ok(r.restam === 20 && ana().pontos === 20, 'resgate desconta os pontos');
  const rid = db.prepare('SELECT id FROM loyalty_redemptions').get().id;
  fid.desfazerResgate(rid);
  ok(ana().pontos === 120, 'desfazer o resgate devolve os pontos');

  // cliente fora das listas não participa
  db.prepare("UPDATE customers SET excluded = 1 WHERE name = 'Bia'").run();
  ok(!fid.saldos().some(s => s.nome === 'Bia'), 'cliente fora das listas não tem pontos');

  // validações
  lanca(() => fid.salvar({ validadeDias: 10 }), 'recusa validade menor que 30 dias');
  lanca(() => fid.salvar({ recompensas: [] }), 'recusa programa sem recompensa');
  lanca(() => fid.salvar({ recompensas: [{ pontos: 0, premio: 'x' }] }), 'recusa recompensa sem pontos');
  ok(fid.hashFone('5524999990001', 'p') === fid.hashFone('5524999990001', 'p') && fid.hashFone('5524999990001', 'p') !== fid.hashFone('5524999990001', 'q'), 'hash do telefone depende da pimenta');
  const busca = fid.buscar('ana');
  ok(busca.length === 1 && busca[0].pontos === 120, 'busca o cliente pelo nome');

  // QR codes sem Supabase
  lanca(() => qr.validarDestino('minhaloja.com.br'), 'QR: recusa destino sem https://');
  ok(qr.validarDestino(' https://www.minhaloja.com.br/ ') === 'https://www.minhaloja.com.br/', 'QR: aceita link completo');
  await lancaAsync(() => qr.criar({ name: 'x', destino: 'https://a.com' }), 'QR: sem Supabase configurado, avisa em vez de criar');
  ok((await qr.listar()).configurado === false, 'QR: listar sem Supabase diz que não está configurado');

  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
  process.exitCode = falhas ? 1 : 0;
})();
