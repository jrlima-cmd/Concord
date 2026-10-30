# Concord — achadinhos Shopee no automático

Robô que, **4 vezes por dia**, escolhe um produto em alta na Shopee e monta um
vídeo vertical (9:16) estilo comercial, com música temática, **100% de graça**.
O vídeo cai num painel no celular, onde você assiste e posta com **um toque**.

```
GitHub Actions (4x/dia)          Supabase                 Vercel (painel)
┌──────────────────────┐   ┌──────────────────┐   ┌────────────────────────┐
│ worker/              │──▶│ tabela `videos`  │◀──│ web/                   │
│ 1. produtos em alta  │   │ bucket `videos`  │   │ assistir · compartilhar│
│ 2. tema + descrição  │   └──────────────────┘   │ copiar descrição·baixar│
│ 3. música temática   │                          │ "já postei"            │
│ 4. vídeo (ffmpeg)    │                          └────────────────────────┘
└──────────────────────┘
```

**Por que você ainda posta manualmente?** A Shopee não tem API oficial para
publicar vídeos. Robôs que imitam o app podem levar ao bloqueio da conta de
afiliado. Então o robô faz todo o trabalho pesado e você só toca em
**Compartilhar na Shopee** no celular. A descrição com o link já vai copiada.

## Como é o vídeo

- 1080×1920, 10 segundos, **sem texto na tela** (preço, link e hashtags vão na descrição)
- O robô descobre o **tema** pelo nome do produto (Natal, cozinha, beleza, casa,
  tecnologia, infantil, pet, fitness, moda) e monta o cenário nas cores do tema,
  com luzinhas desfocadas
- 3 cenas com a foto do produto, com transições suaves: produto inteiro → close no detalhe → fechamento
- **Trilha temática original**, composta pelo próprio robô a cada vídeo (sinos e
  guizos no Natal, batida eletrônica em tecnologia...), sem risco de direitos autorais
- Prefere outras músicas? Coloque `.mp3` **livres de direitos** em
  `worker/assets/music/<tema>/` (ex.: `worker/assets/music/natal/`) ou direto em
  `worker/assets/music/` para todos os temas. O robô passa a sortear entre elas.

## Configuração (uma vez só)

### 1. Supabase
1. Crie um projeto em supabase.com.
2. Em **SQL Editor**, rode o conteúdo de `supabase/migrations/20261030000000_videos.sql`.
3. Em **Project Settings → API**, anote a `URL` e a `service_role key` (é secreta, nunca compartilhe).

### 2. GitHub (o robô)
Em **Settings → Secrets and variables → Actions** do repositório, crie os *secrets*:

| Secret | Valor |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `SHOPEE_APP_ID` | *(quando tiver)* App ID da API de afiliados |
| `SHOPEE_SECRET` | *(quando tiver)* Secret da API de afiliados |

Sem as chaves da Shopee, o robô roda em **modo demonstração** com produtos de exemplo.

Variável opcional (aba *Variables*):
- `PALAVRAS_CHAVE`: focar em nichos, ex.: `cozinha,maquiagem,organização`

O agendamento só roda na branch padrão (`main`). Os horários ficam em
`.github/workflows/gerar-videos.yml` (hoje: 08:47, 11:47, 17:47 e 20:47, horário
de Brasília). Para testar na hora: aba **Actions → Gerar vídeos → Run workflow**.

### 3. Vercel (o painel)
1. Importe o repositório na Vercel e defina **Root Directory = `web`**.
2. Em *Environment Variables*:

| Variável | Valor |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `DASHBOARD_PASSWORD` | senha para entrar no painel |
| `GITHUB_REPO` | *(opcional)* `jrlima-cmd/Concord`, para o botão "Gerar agora" |
| `GITHUB_TOKEN` | *(opcional)* token *fine-grained* com permissão **Actions: write** neste repositório |
| `GITHUB_BRANCH` | *(opcional)* branch do workflow, padrão `main` |

3. No celular, abra o site e toque em **Adicionar à tela inicial** para usar como app.

### 4. API de Afiliados da Shopee
No **Portal de Afiliados Shopee → Open API**, peça acesso. Depois coloque o App ID
e o Secret nos secrets do GitHub. A partir daí o robô usa os produtos que mais
vendem e pagam mais comissão, já com o **seu link de afiliado**.

## Rodar no computador

```bash
cd worker && npm install
npm run gerar:teste          # gera em worker/saida/ sem Supabase
npm run gerar:teste -- --imagem foto.jpg   # testa com uma foto sua
npm run gerar                # gera de verdade (precisa das variáveis acima)

cd web && npm install
npm run dev                  # painel em http://localhost:3000
```

Precisa de Node 20+ e `ffmpeg` instalado.

## Personalizar

- **Descrição do post:** `worker/src/descricao.js` (aberturas, chamadas e hashtags)
- **Temas, cores e estilo da música:** `worker/src/tema.js`
- **Cenas e transições:** `worker/src/ffmpeg.js` (lista `CENAS`)
- **Critério de "em alta":** `worker/src/shopee.js`, função `score`, e `NOTA_MINIMA` (padrão 4.5)
