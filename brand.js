// Marca do whitelabel, num lugar só.
// Lê brand.json (ou o arquivo apontado por BRAND_FILE) e entrega:
//   - os dados da marca para o servidor (nomes, textos das mensagens, schema do PDV, login);
//   - /brand.css  com as cores e fontes (variáveis CSS que o style.css usa);
//   - /brand.js   com window.BRAND para o navegador (só o que é público).
// Para criar outro whitelabel: copie brand.json, troque nomes/cores/logos e aponte BRAND_FILE para a cópia.
const fs = require('node:fs');
const path = require('node:path');

const arquivo = path.resolve(__dirname, process.env.BRAND_FILE || 'brand.json');
const bruto = JSON.parse(fs.readFileSync(arquivo, 'utf8'));

const produto = { sufixo: 'CRM', ...bruto.produto };
produto.nomeCompleto = [produto.nome, produto.sufixo].filter(Boolean).join(' ');
const loja = { assinatura: 'Equipe', ...bruto.loja };
// "da sua loja" vs "da Pizzaria X": o nome da loja pode vir do .env para não precisar de um brand.json por cliente
if (process.env.LOJA_NOME) loja.nome = process.env.LOJA_NOME;
const assinatura = loja.assinatura && loja.nome !== 'sua loja' ? `${loja.assinatura} ${loja.nome}` : loja.assinatura;

const pdv = { nome: 'PDV', schema: 'pdv', ...bruto.pdv };
pdv.schema = process.env.PDV_SUPABASE_SCHEMA || pdv.schema;
pdv.nomeCompleto = `${pdv.nome} ${produto.nome}`.trim();

// Login (Supabase Auth do PDV). O .env vale mais que o brand.json.
const auth = {
  supabaseUrl: (process.env.AUTH_SUPABASE_URL || bruto.auth?.supabaseUrl || process.env.PDV_SUPABASE_URL || '').replace(/\/$/, ''),
  supabaseKey: process.env.AUTH_SUPABASE_KEY || bruto.auth?.supabaseKey || '',
};

const cores = bruto.cores || {};
const fontes = bruto.fontes || {};
const varsCss = obj => Object.entries(obj || {}).map(([k, v]) => `  --${k}: ${v};`).join('\n');

function css() {
  const claro = { ...cores.claro };
  const escuro = { ...cores.escuro };
  if (fontes.display) claro['f-display'] = fontes.display;
  if (fontes.texto) claro['f-texto'] = fontes.texto;
  // atalhos usados pelo style.css/auth.css
  const d2 = claro['destaque-2'], d3 = claro['destaque-3'], d1 = claro.crosta;
  if (d1 && d2) claro['marca-gradiente'] = `linear-gradient(90deg, ${d1}, ${d2})`;
  if (d1) claro['destaque-1'] = d1;
  if (d1) claro['auth-brilho-1'] = `color-mix(in srgb, ${d1} 55%, transparent)`;
  if (d2) claro['auth-brilho-2'] = `color-mix(in srgb, ${d2} 45%, transparent)`;
  const e = varsCss(escuro);
  return `/* gerado por brand.js a partir de ${path.basename(arquivo)}; não edite aqui */
:root {
${varsCss(claro)}
}
:root[data-tema="escuro"] {
${e}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-tema="claro"]) {
${e}
  }
}
`;
}

// O que vai para o navegador. Nada secreto aqui (a chave do Supabase é a publicável).
const publico = () => ({ produto, loja: { ...loja, assinaturaCompleta: assinatura }, pdv: { nome: pdv.nomeCompleto }, auth, fontes: { googleFontsUrl: fontes.googleFontsUrl || '' } });
const js = () => `window.BRAND = ${JSON.stringify(publico())};\n`;

// Troca {produto}, {loja}, {assinatura}... num texto.
function texto(t) {
  const mapa = { produto: produto.nome, produtoCompleto: produto.nomeCompleto, loja: loja.nome, assinatura, cidade: loja.cidade || '',
    slogan: loja.slogan || '', site: loja.site || '', segmento: loja.segmento || '', produtoExemplo: loja.produtoExemplo || '', pdv: pdv.nomeCompleto };
  return String(t).replace(/\{(\w+)\}/g, (m, k) => (k in mapa ? mapa[k] : m));
}

// Preenche os {{marcadores}} do index.html.
const escHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function html(modelo) {
  const m = { TITULO: produto.nomeCompleto, NOME: produto.nome, FAVICON: produto.favicon || '/favicon.ico',
    APPLE_ICON: produto.appleTouchIcon || produto.icone || '', FONTES: fontes.googleFontsUrl || '', COR_TEMA: cores.claro?.lateral || '#000000' };
  return modelo.replace(/\{\{(\w+)\}\}/g, (x, k) => (k in m ? escHtml(m[k]) : x));
}

module.exports = { html, arquivo, produto, loja, assinatura, pdv, auth, cores, fontes, css, js, publico, texto };
