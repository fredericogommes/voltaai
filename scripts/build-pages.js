'use strict';
// Gera a versão estática (GitHub Pages) da tela de login: node scripts/build-pages.js [pasta-de-saida]
// Só o login/cadastro funciona aqui (Supabase direto do navegador); o painel com dados precisa do servidor (server.js).
const fs = require('node:fs');
const path = require('node:path');
const brand = require('../brand');

const raiz = path.resolve(__dirname, '..');
const saida = path.resolve(process.argv[2] || path.join(raiz, 'dist-pages'));
const rel = v => (typeof v === 'string' && v.startsWith('/') ? '.' + v : v);   // "/marca/x.png" -> "./marca/x.png" (site em subpasta)

fs.rmSync(saida, { recursive: true, force: true });
// Só o necessário para o login: o código do painel não vai para o site público.
const ARQUIVOS = ['auth.js', 'auth.css', 'style.css', 'favicon.ico', 'vendor/supabase.js', 'marca'];
for (const a of ARQUIVOS) fs.cpSync(path.join(raiz, 'public', a), path.join(saida, a), { recursive: true });

const publico = brand.publico();
publico.produto = Object.fromEntries(Object.entries(publico.produto).map(([k, v]) => [k, rel(v)]));
publico.estatico = true;
fs.writeFileSync(path.join(saida, 'brand.js'), `window.BRAND = ${JSON.stringify(publico)};\n`);
fs.writeFileSync(path.join(saida, 'brand.css'), brand.css());

const html = brand.html(fs.readFileSync(path.join(raiz, 'public', 'index.html'), 'utf8'))
  .replace(/<script src="\/(?!brand\.js|vendor\/supabase\.js|auth\.js)[^"]*"><\/script>\r?\n?/g, '')
  .replace(/(href|src)="\/(?!\/)/g, '$1="./');
fs.writeFileSync(path.join(saida, 'index.html'), html);
fs.writeFileSync(path.join(saida, '.nojekyll'), '');
console.log('Pages gerado em', saida);
