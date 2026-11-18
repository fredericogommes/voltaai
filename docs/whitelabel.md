# Whitelabel: como trocar a marca

Toda a marca fica em **`brand.json`**. O servidor (`brand.js`) lê esse arquivo e entrega:

| Saída | O que leva | Onde é usado |
|---|---|---|
| `/brand.css` | cores (claro e escuro) e fontes, como variáveis CSS | todas as telas (carregado depois de `style.css`) |
| `/brand.js` | `window.BRAND`: nomes, ícone, tagline, login | menu lateral, tela de login, prévia do WhatsApp, Ajustes, Conexões |
| `index.html` | título, favicon, apple-touch-icon, cor do tema, Google Fonts | marcadores `{{TITULO}}`, `{{FAVICON}}`... preenchidos pelo servidor |
| servidor | nome da loja, assinatura, schema do PDV, slug | sugestões de campanha, prompt da IA, e-mail, clube, nomes de arquivo |

## As duas marcas

- **`produto`**: a marca do CRM (Voltaai). Nome, `nomeMarca` (partes do nome; a 2ª ganha o gradiente), tagline, slug e imagens em `public/marca/`.
- **`loja`**: o negócio que usa o CRM e assina as mensagens para os clientes dele (ex.: "Cantina X"). `LOJA_NOME` no `.env` vale mais que `loja.nome`, então dá para usar o mesmo `brand.json` em várias lojas.

## Criar uma marca nova

1. Copie `brand.json` para `marcas/<cliente>.json` e troque nomes, cores e fontes.
2. Ponha os arquivos da marca em `public/marca/<cliente>/` (ícone quadrado 192 px e 512 px, apple-touch-icon 180 px, favicon) e aponte os caminhos no JSON.
3. No `.env`: `BRAND_FILE=marcas/<cliente>.json`, `LOJA_NOME`, `AUTH_SUPABASE_URL`, `AUTH_SUPABASE_KEY` e `PDV_SUPABASE_SCHEMA`.
4. Reinicie. Nada no código precisa mudar.

## Cores (variáveis)

| Variável | Papel |
|---|---|
| `tinta` | cor escura principal (botões primários, textos fortes) |
| `lateral` | fundo do menu lateral |
| `papel`, `painel`, `painel-2`, `linha` | fundos e bordas |
| `texto`, `texto-2` | texto principal e de apoio |
| `crosta`, `crosta-fundo`, `crosta-texto` | destaque da marca (item ativo, cartão de receita, ícones) |
| `destaque-2`, `destaque-3` | cores secundárias da marca (gradiente do nome) |
| `folha`, `ambar`, `pimenta`, `azul` | positivo, atenção, erro/perdidos, recente |
| `lateral-texto`, `lateral-ativo-texto` | textos do menu lateral |

## Páginas públicas no Supabase (`supabase/functions`)

O clube de fidelidade e o QR rodam fora do servidor, então não leem o `brand.json`. O nome da loja vem do segredo
`LOJA_NOME` da Edge Function (`supabase secrets set LOJA_NOME="Cantina X"`); as cores estão no CSS da própria função.

## Voltaai (esta configuração)

- Paleta oficial (arquivo "Identidade Visual Voltaai em Gradientes"): `#172554` azul-marinho, `#7657F4` roxo, `#20C6BD` turquesa, `#FF9A70` coral.
- Ícone e logos recortados da prancha de identidade visual. Quando houver os arquivos vetoriais (SVG), substitua os PNG em `public/marca/`.
- Fontes: Nunito (títulos, próxima do logotipo arredondado) e Inter (texto). Troque em `fontes` se a marca tiver outra fonte oficial.
