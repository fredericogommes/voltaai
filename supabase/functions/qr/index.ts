// QR code da loja: conta o scan e leva o cliente ao destino.
// URL pública: https://<projeto>.supabase.co/functions/v1/qr/<codigo>  (ou ?c=<codigo>)
// Não guarda IP: só um hash de IP + navegador + pimenta, para contar pessoas únicas.
const URL_ = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

let pimenta: string | null = null;
async function pepper() {
  if (pimenta) return pimenta;
  const r = await fetch(`${URL_}/rest/v1/rpc/fn_pepper_service`, { method: 'POST', headers: H, body: '{}' });
  pimenta = await r.json();
  return pimenta!;
}
async function sha256(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const pagina = (titulo: string, texto: string, status = 404) => new Response(
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title>
<style>body{font-family:system-ui,Arial,sans-serif;background:#111a3f;color:#eef0ff;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;text-align:center}main{max-width:420px}h1{font-size:22px}p{color:#a9b0d8}</style></head>
<body><main><h1>${titulo}</h1><p>${texto}</p></main></body></html>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = (url.searchParams.get('c') || url.pathname.split('/').filter(Boolean).pop() || '').toLowerCase();
  if (!/^[a-z0-9]{4,16}$/.test(code)) return pagina('QR code inválido', 'Este QR code não existe.');
  const r = await fetch(`${URL_}/rest/v1/qr_codes?code=eq.${code}&select=destino,active,expires_at`, { headers: H });
  const qr = (await r.json())?.[0];
  if (!qr) return pagina('QR code não encontrado', 'Este QR code não existe ou foi apagado.');
  if (!qr.active) return pagina('QR code desativado', 'Este QR code foi desativado pela loja.', 410);
  if (qr.expires_at && new Date(qr.expires_at) < new Date()) return pagina('QR code expirado', 'Este QR code passou da validade.', 410);
  // conta o scan sem atrasar o cliente; falha ao contar não impede o redirecionamento
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const visitor = await sha256(`${ip}|${req.headers.get('user-agent') || ''}|${await pepper()}`);
  const conta = fetch(`${URL_}/rest/v1/qr_scans`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ code, visitor }) }).catch(() => null);
  // @ts-ignore EdgeRuntime existe no Supabase
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(conta); else await conta;
  return new Response(null, { status: 302, headers: { Location: qr.destino, 'Cache-Control': 'no-store' } });
});
