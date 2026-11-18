# Voltaai · CRM para Foodservice

CRM de recompra para negócios de foodservice: traz os pedidos do PDV, agrupa os clientes por RFV,
analisa produtos e envia campanhas e fluxos de WhatsApp. Node 22 ou mais novo.

Este é um **whitelabel**: nome, logos, cores, fontes, favicon e os textos que vão para os clientes saem de
`brand.json`. Veja [docs/whitelabel.md](docs/whitelabel.md) para criar outra marca.

## Como rodar

1. Copie `.env.example` para `.env` e preencha (o `.env` nunca vai para o Git).
2. Preencha o login (`auth` em `brand.json` ou `AUTH_SUPABASE_URL`/`AUTH_SUPABASE_KEY` no `.env`) e o nome da loja (`LOJA_NOME`).
3. Dê dois cliques em `Iniciar CRM.bat` (ou `node --env-file=.env server.js`) e abra http://localhost:3000.

Por padrão o programa está em **modo teste**: simula envios e não manda nada. O envio real só liga com `SEND_MODE=live`
e depois de conferir a conexão na tela **Conexões**.

## O que tem

- Painel, contatos, RFV em 6 grupos, tempo entre compras, LTV, retenção, clientes recuperados, evolução da base e produtos (curva ABC, sabores, pedido favorito)
- Campanhas de WhatsApp com imagem, botões, até 3 versões, prévia de celular, aprovação de modelo na Meta, envio manual ou automático por agenda
- Fluxos de automação (gatilho, esperas, mensagens)
- Sincronização incremental com o banco do PDV somente após a confirmação do pagamento (vendas, itens e pagamentos)

## Segurança

- Por padrão o servidor escuta só em `127.0.0.1`; na hospedagem, use `HOST=0.0.0.0`.
- O painel usa a mesma conta do PDV (Supabase Auth configurado em `brand.json` ou no `.env`). Todas as rotas `/api/*` validam a sessão no Supabase e aceitam somente proprietários de loja.
- `.env` (tokens) e o banco `<slug>.db` (dados dos clientes) estão no `.gitignore`. Não os publique.
- Código escrito para a Meta (modelos, envio) foi testado só contra uma Meta simulada.

## Produção

Requer um processo Node contínuo e disco persistente para o SQLite. Configure `HOST=0.0.0.0`, a porta da hospedagem e `DB_PATH` para um diretório que não seja substituído em novos deploys. Inicie com `npm start`.

## Testes

Cada arquivo de `tests/` roda contra um banco temporário: `node tests/test_flows.js "$(pwd)"`.

## Supabase (projeto `voltaai`, São Paulo)

Tudo o que o CRM usa no Supabase está em `supabase/migrations/` e `supabase/functions/`:

- **Login** (`auth` em `brand.json`): Supabase Auth, com cadastro por e-mail e Google. Só entra no painel quem for dono de uma loja em `voltaai_pdv.stores`.
- **Cópia do banco** (`supabase-sync.js`): as tabelas do SQLite espelhadas em `public`. Só respondem a quem manda o segredo `SUPABASE_CRM_SECRET` no cabeçalho `x-crm-key`; o banco guarda só o SHA-256 em `private.config`.
- **Clube de fidelidade e QR codes**: Edge Functions `clube` e `qr` (públicas), usando a service role.

Trocar o segredo: gere um novo, ponha no `.env` e atualize o hash: `update private.config set value = '<sha256>' where key = 'crm_secret_sha256';`

## Teste no navegador (GitHub Pages)

A cada push na `main`, o workflow `.github/workflows/pages.yml` publica só a tela de login (`node scripts/build-pages.js`).
O painel com dados precisa do servidor Node.

## Cópia no Supabase (LGPD)

Os dados ficam no SQLite local e são copiados para o projeto Supabase da loja (de preferência em São Paulo)
(`supabase-sync.js`): ao abrir o app, depois de cada sincronização do PDV e a cada 6 horas. Apagar um
cliente aqui apaga também na cópia na rodada seguinte.

- Acesso: chave anon + segredo `SUPABASE_CRM_SECRET` no cabeçalho `x-crm-key`. O banco guarda só o
  SHA-256 do segredo (`private.crm_ok()`); sem ele a RLS não mostra nem aceita nada.
- Restaurar (nunca sobrescreve): `node --env-file=.env supabase-sync.js restaurar crm-restaurado.db`
- Trocar o segredo: gere um novo, ponha no `.env` e troque o hash dentro de `private.crm_ok()`.

## Pedidos do PDV

Configure no servidor `PDV_SUPABASE_URL`, `PDV_SUPABASE_SECRET_KEY` e `PDV_SUPABASE_SCHEMA` (ou `pdv.schema` no `brand.json`). A chave secreta nunca deve entrar no navegador nem no Git; a variável legada `PDV_SUPABASE_SERVICE_ROLE_KEY` continua aceita durante a migração. O CRM consulta a cada minuto somente pedidos pagos, ignora cancelados e pedidos identificados como homologação, reprocessa uma sobreposição de três dias pela data de atualização e usa `pdv:<uuid>` como identificador idempotente, evitando duplicatas.

## QR codes e clube de fidelidade

As páginas públicas rodam como Edge Functions no Supabase (`supabase/functions/qr` e `supabase/functions/clube`),
então o CRM continua só no computador. O QR conta o scan e redireciona; o clube mostra os pontos ao cliente pelo
celular. Os pontos são publicados a cada cópia no Supabase. O clube começa fechado: abra em Crescimento > Fidelidade.
