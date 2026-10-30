# Concord — achadinhos Shopee no automático

Robô que, **4 vezes por dia**, escolhe um produto em alta na Shopee, escreve o
roteiro, narra com voz feminina suave e monta um vídeo vertical (9:16). O vídeo
cai num painel no celular, onde você assiste e posta com **um toque**.

```
GitHub Actions (4x/dia)          Supabase                 Vercel (painel)
┌──────────────────────┐   ┌──────────────────┐   ┌────────────────────────┐
│ worker/              │──▶│ tabela `videos`  │◀──│ web/                   │
│ 1. produtos em alta  │   │ bucket `videos`  │   │ assistir · compartilhar│
│ 2. roteiro + legenda │   └──────────────────┘   │ copiar legenda · baixar│
│ 3. narração (voz)    │                          │ "já postei"            │
│ 4. vídeo (ffmpeg)    │                          └────────────────────────┘
└──────────────────────┘
```

**Por que você ainda posta manualmente?** A Shopee não tem API oficial para
publicar vídeos. Robôs que imitam o app podem levar ao bloqueio da conta de
afiliado. Então o robô faz todo o trabalho pesado e você só toca em
**Compartilhar na Shopee** no celular. A legenda com o link já vai copiada.

## Como é o vídeo

- 1080×1920, cerca de 20 segundos, narração `pt-BR-FranciscaNeural` (feminina e suave)
- Selo "ACHADINHO SHOPEE", nome do produto, foto com zoom lento sobre fundo desfocado
- Etiqueta de desconto, preço em destaque, legendas sincronizadas com a voz
- "LINK NO VÍDEO" piscando no final
- Música de fundo opcional: coloque arquivos `.mp3` **livres de direitos** em `worker/assets/music/`

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

Variáveis opcionais (aba *Variables*):
- `PALAVRAS_CHAVE`: focar em nichos, ex.: `cozinha,maquiagem,organização`
- `VOZ`: outra voz, ex.: `pt-BR-ThalitaNeural`

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
npm run gerar:teste          # gera em worker/saida/ sem Supabase (áudio mudo)
npm run gerar                # gera de verdade (precisa das variáveis acima)

cd web && npm install
npm run dev                  # painel em http://localhost:3000
```

Precisa de Node 20+ e `ffmpeg` instalado.

## Personalizar

- **Frases do roteiro:** `worker/src/roteiro.js` (ganchos, chamadas e hashtags)
- **Visual do vídeo:** `worker/src/ffmpeg.js` (cores, posições, fontes)
- **Critério de "em alta":** `worker/src/shopee.js`, função `score`, e `NOTA_MINIMA` (padrão 4.5)
