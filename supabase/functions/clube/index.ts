// Clube de fidelidade da loja (whitelabel; nome em LOJA_NOME nos segredos da função): página pública para o cliente consultar os pontos e, se quiser,
// cadastrar o e-mail para receber novidades (com consentimento explícito, LGPD).
// URL pública: https://<projeto>.supabase.co/functions/v1/clube
// O telefone nunca é gravado: a consulta compara o hash (telefone + pimenta) com o que o CRM publicou.
const URL_ = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Nome da loja que assina o clube (segredo LOJA_NOME da Edge Function). Cores = paleta Voltaai (brand.json).
const LOJA = Deno.env.get('LOJA_NOME') || 'nossa loja';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const LIMITE_HORA = 15;   // consultas por visitante por hora (evita varrer telefones)

let pimenta: string | null = null;
async function pepper() {
  if (!pimenta) pimenta = await (await fetch(`${URL_}/rest/v1/rpc/fn_pepper_service`, { method: 'POST', headers: H, body: '{}' })).json();
  return pimenta!;
}
async function sha256(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function normaliza(fone: string) {
  let d = String(fone || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return /^55[1-9]\d9?\d{8}$/.test(d) ? d : null;
}
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

async function visitante(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return sha256(`lookup|${ip}|${await pepper()}`);
}
async function dentroDoLimite(v: string) {
  const desde = new Date(Date.now() - 3600e3).toISOString();
  const r = await fetch(`${URL_}/rest/v1/loyalty_lookups?visitor=eq.${v}&at=gte.${desde}&select=visitor`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } });
  const total = Number((r.headers.get('content-range') || '*/0').split('/')[1]) || 0;
  if (total >= LIMITE_HORA) return false;
  await fetch(`${URL_}/rest/v1/loyalty_lookups`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ visitor: v }) });
  return true;
}

async function programa() {
  const r = await fetch(`${URL_}/rest/v1/loyalty_program?id=eq.1&select=nome,regras,recompensas,ativo`, { headers: H });
  return (await r.json())?.[0] || null;
}

function html(p: { nome: string; regras: string; recompensas: { pontos: number; premio: string }[] }) {
  const recompensas = (p.recompensas || []).map(r => `<li><b>${esc(String(r.pontos))} pontos</b> · ${esc(r.premio)}</li>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.nome)}</title><style>
:root{--fundo:#111a3f;--painel:#18234f;--texto:#eef0ff;--suave:#a9b0d8;--ouro:#7657f4}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,Arial,sans-serif;background:var(--fundo);color:var(--texto);padding:16px;line-height:1.5}
main{max-width:460px;margin:0 auto;display:grid;gap:16px}h1{font-size:26px;margin:8px 0 0}section{background:var(--painel);border-radius:16px;padding:18px;display:grid;gap:10px}
label{display:grid;gap:6px;font-weight:600}input{font:inherit;padding:12px;border-radius:10px;border:1px solid #2e3a72;background:#0c1435;color:var(--texto);width:100%}
button{font:inherit;font-weight:700;padding:12px;border:0;border-radius:10px;background:var(--ouro);color:#ffffff;cursor:pointer}
.nota{color:var(--suave);font-size:14px}.pontos{font-size:44px;font-weight:800;margin:0}ul{margin:0;padding-left:18px}.check{display:flex;gap:10px;align-items:flex-start;font-weight:400}.check input{width:auto;margin-top:4px}
</style></head><body><main>
<h1>${esc(p.nome)}</h1>
${p.regras ? `<p class="nota">${esc(p.regras)}</p>` : ''}
${recompensas ? `<section><b>Recompensas</b><ul>${recompensas}</ul></section>` : ''}
<section><form id="f"><label>Seu celular com DDD<input id="fone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(24) 99999-9999" required></label>
<button>Ver meus pontos</button></form><div id="res" aria-live="polite"></div></section>
<section id="cad" hidden><b>Quer receber novidades por e-mail?</b><form id="fe"><label>Seu e-mail<input id="email" type="email" autocomplete="email" required></label>
<label class="check"><input id="ok" type="checkbox" required> <span>Aceito receber e-mails da ${esc(LOJA)} com novidades e promoções. Posso pedir para sair quando quiser.</span></label>
<button>Cadastrar</button></form><div id="rese" aria-live="polite"></div></section>
<p class="nota">Usamos o seu celular só para encontrar os seus pontos. Ele não é guardado nesta página.</p>
</main><script>
const $=s=>document.querySelector(s);
const post=o=>fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)}).then(r=>r.json());
$('#f').onsubmit=async e=>{e.preventDefault();$('#res').textContent='Buscando...';
 const r=await post({acao:'consultar',fone:$('#fone').value});
 if(r.erro){$('#res').textContent=r.erro;return}
 if(!r.encontrado){$('#res').textContent='Ainda não encontramos pontos para este celular. Os pontos aparecem depois do primeiro pedido identificado com este número.';return}
 $('#res').innerHTML='<p class="nota">Olá, '+r.nome.replace(/[<>&]/g,'')+'!</p><p class="pontos">'+r.pontos+' pontos</p>'+(r.proximo?'<p class="nota">Faltam '+r.faltam+' pontos para: '+r.proximo.replace(/[<>&]/g,'')+'</p>':'<p class="nota">Você já pode trocar seus pontos. Fale com a loja!</p>')+(r.expirando?'<p class="nota">'+r.expirando+' pontos vencem nos próximos 30 dias.</p>':'');
 $('#cad').hidden=false};
$('#fe').onsubmit=async e=>{e.preventDefault();const r=await post({acao:'cadastrar',fone:$('#fone').value,email:$('#email').value,consentimento:$('#ok').checked});
 $('#rese').textContent=r.erro||'Pronto! Você vai receber as novidades da '+${JSON.stringify(LOJA).replace(/</g, '\\u003c')}+'.'};
</script></body></html>`;
}

Deno.serve(async (req: Request) => {
  const p = await programa();
  if (!p || !p.ativo) {
    if (req.method === 'POST') return json({ erro: 'O clube ainda não está aberto.' }, 404);
    return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;background:#111a3f;color:#eef0ff;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;text-align:center"><p>O clube de fidelidade ainda não está aberto.</p></body>',
      { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  if (req.method === 'GET') return new Response(html(p), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (req.method !== 'POST') return json({ erro: 'Método não aceito.' }, 405);
  let corpo: Record<string, unknown> = {};
  try { corpo = await req.json(); } catch { return json({ erro: 'Pedido inválido.' }, 400); }
  const fone = normaliza(String(corpo.fone || ''));
  if (!fone) return json({ erro: 'Digite um celular com DDD, por exemplo (24) 99999-9999.' }, 400);
  if (!(await dentroDoLimite(await visitante(req)))) return json({ erro: 'Muitas consultas seguidas. Tente de novo daqui a pouco.' }, 429);
  const hash = await sha256(`${fone}|${await pepper()}`);
  if (corpo.acao === 'cadastrar') {
    const email = String(corpo.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ erro: 'Digite um e-mail válido.' }, 400);
    if (corpo.consentimento !== true) return json({ erro: 'Marque a caixa de consentimento para receber e-mails.' }, 400);
    await fetch(`${URL_}/rest/v1/loyalty_signups`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ phone_hash: hash, email, consent: true }) });
    return json({ ok: true });
  }
  const r = await fetch(`${URL_}/rest/v1/loyalty_cards?phone_hash=eq.${hash}&select=first_name,points,next_reward,missing,expires_soon`, { headers: H });
  const c = (await r.json())?.[0];
  if (!c) return json({ encontrado: false });
  return json({ encontrado: true, nome: c.first_name, pontos: c.points, proximo: c.next_reward, faltam: c.missing, expirando: c.expires_soon });
});
