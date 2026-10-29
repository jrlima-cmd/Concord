# 🎫 SVI — Sistema de Validação de Ingressos

Venda de ingressos com pagamento real via **Stripe Checkout** e validação na portaria por QR Code.

## O que mudou em relação à versão original

| Antes | Agora |
|---|---|
| Pagamento simulado (botão "Confirmar pagamento realizado") | Pagamento real pelo **Stripe Checkout** (cartão, Pix, boleto, Apple/Google Pay, conforme o Dashboard) |
| Ingressos salvos no `localStorage` do comprador | Ingressos emitidos e guardados **no servidor** (SQLite), somente após a Stripe confirmar o pagamento |
| A portaria só validava ingressos do próprio navegador | A portaria valida **qualquer ingresso, em qualquer aparelho** |
| Senha da portaria `1234` visível no código-fonte | Senha no servidor (`.env`), sessão assinada (HMAC) e limite de tentativas |
| Preço calculado no navegador (podia ser alterado) | Preço definido somente no servidor e conferido com o valor pago |
| Mesmo ingresso podia entrar duas vezes com leituras simultâneas | Validação atômica no banco: cada ingresso entra **uma única vez** |
| Código `TK-XXXXXX` com `Math.random` | Código `TK-XXXXXXXXXX` criptograficamente aleatório, sem caracteres ambíguos |
| Nome do titular inserido via `innerHTML` (XSS) | Todo conteúdo renderizado com segurança |
| `alert()` em tudo | Toasts, tela cheia verde/vermelha na portaria, som e vibração |

Outras melhorias: contadores de vendidos/entraram/restantes, histórico das últimas leituras, bloqueio de leitura repetida do mesmo QR, download e impressão dos ingressos, status de pedido (aguardando, expirado, falhou), sessão preservada ao recarregar a página e layout responsivo.

## Como funciona o pagamento

```
Navegador ──POST /api/checkout──▶ Servidor ──cria Checkout Session──▶ Stripe
    │                                                                   │
    └────────── redirecionado para a página de pagamento da Stripe ◀────┘
                                   │ pagamento aprovado
Stripe ──webhook checkout.session.completed──▶ Servidor: emite os ingressos
Stripe ──redireciona de volta──▶ Navegador: mostra os ingressos com QR Code
```

Os dados do cartão nunca passam pelo seu servidor. Os ingressos são emitidos pelo **webhook**; se ele atrasar, o servidor também consulta a sessão na Stripe quando o comprador volta do Checkout. A emissão é idempotente, então nunca duplica ingressos.

## Instalação

Requer **Node.js 22.5+** (usa o SQLite nativo do Node).

```bash
npm install
cp .env.example .env     # preencha as variáveis
npm start                # http://localhost:3000
```

### Variáveis principais (`.env`)

| Variável | Descrição |
|---|---|
| `STRIPE_SECRET_KEY` | Chave secreta da Stripe (`sk_test_...` ou `sk_live_...`) — [Dashboard › API keys](https://dashboard.stripe.com/apikeys) |
| `STRIPE_WEBHOOK_SECRET` | Segredo do endpoint de webhook (`whsec_...`) |
| `BASE_URL` | URL pública do site (para o retorno do Checkout) |
| `STAFF_PASSWORD` | Chave de acesso da portaria |
| `SESSION_SECRET` | Segredo aleatório longo para assinar as sessões da portaria |
| `TICKET_PRICE_CENTS` | Preço em centavos (padrão `5500` = R$ 55,00) |
| `EVENT_NAME` | Nome do evento exibido no site e no Checkout |
| `STRIPE_PAYMENT_METHODS` | Opcional, ex.: `card,pix`. Vazio usa os métodos ativos no Dashboard |

### Webhook

**Local** (com a [Stripe CLI](https://docs.stripe.com/stripe-cli)):

```bash
stripe login
npm run stripe:listen     # copie o whsec_... exibido para STRIPE_WEBHOOK_SECRET
```

**Produção:** em [Dashboard › Webhooks](https://dashboard.stripe.com/webhooks) crie um endpoint `https://SEU-DOMINIO/api/webhook` com os eventos:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

### Testar um pagamento

Com chave `sk_test_...`, use o cartão `4242 4242 4242 4242`, qualquer validade futura e qualquer CVC.

### Pix

Para aceitar Pix, ative-o em [Dashboard › Payment methods](https://dashboard.stripe.com/settings/payment_methods) (requer conta Stripe no Brasil). Como o Pix é assíncrono, os ingressos aparecem assim que a Stripe confirmar o pagamento.

## App para celular

O SVI funciona como app de duas formas, a partir do mesmo site em `public/`:

| | Como o usuário instala | Indicado para |
|---|---|---|
| **App instalável (PWA)** | Abre o site no celular e toca em **Instalar** (Android) ou em **Compartilhar › Adicionar à Tela de Início** (iPhone) | Todo mundo, sem loja: Android, iPhone e computador |
| **App Android** (`mobile/`) | Instala o APK ou baixa pela Google Play | Quem prefere um app "de verdade" e a portaria |

Nos dois casos:

- **Ingressos sem internet**: a última lista carregada fica salva no aparelho. Na fila do evento, sem sinal, o QR Code abre na hora (com o aviso "Sem internet"). Sair da conta apaga essa cópia.
- **Abas no rodapé** no celular, respeitando o notch e a barra de gestos.
- **Portaria**: a tela não apaga enquanto o leitor está aberto e a câmera é liberada quando o app vai para segundo plano.
- **Atalhos no ícone** (toque longo no ícone do app instalado): "Meus ingressos" e "Portaria".

As bibliotecas (qrcodejs 1.0.0, html5-qrcode 2.3.4 e supabase-js 2.49.4) agora ficam em `public/vendor/`, para o app abrir sem internet. São os mesmos arquivos da CDN, conferidos pelos hashes de integridade usados antes:

| Arquivo | Hash (SRI) |
|---|---|
| `qrcode.min.js` | `sha384-3zSEDfvllQohrq0PHL1fOXJuC/jSOO34H46t6UQfobFOmxE5BpjjaIJY5F2/bMnU` |
| `html5-qrcode.min.js` | `sha384-LxBm2/oFd/wfoABz4wsZ4FnGMQVAy5QI1bhf+kHA4YKi0aFe1BJTWosfTWmlMNNY` |
| `supabase.js` | `sha384-rwykjmWNwVxboyFmvK9OXN0wj9hnMHA2aAHtits54DuACyCq0M2PrSNxhRb+hvXT` |

Com isso o CSP do `vercel.json` passou a aceitar scripts só do próprio site (`script-src 'self'`).

### App instalável (PWA)

Basta publicar `public/` como sempre (Vercel). `manifest.webmanifest` descreve o app e os ícones (`public/icons/`); `sw.js` guarda os arquivos do site para abrir sem internet. Ele busca sempre a versão mais nova quando há conexão, então **não é preciso mudar nada a cada publicação**. As chamadas da API e da Stripe nunca passam pelo cache.

### App Android

Projeto [Capacitor](https://capacitorjs.com) em `mobile/`, que empacota o site de `public/` dentro do app.

**Baixar o APK pronto:** a cada mudança em `public/` ou `mobile/`, o GitHub Actions (workflow "App Android") gera o APK de teste. Abra a execução em **Actions › App Android**, baixe `svi-android-teste` em *Artifacts*, descompacte e instale o `app-debug.apk` no celular (o Android pede para permitir a instalação de fontes desconhecidas).

**Compilar no computador** (requer Node 22, JDK 21 e Android Studio):

```bash
cd mobile
npm install
npm run sync     # copia public/ para o projeto Android
npm run open     # abre no Android Studio (ou: npm run apk)
```

Rode `npm run sync` sempre que mudar algo em `public/`.

**Como o pagamento volta para o app:** o app serve o site com o endereço `https://svi-ingressos.vercel.app` (`server.hostname` em `mobile/capacitor.config.json`). Assim o Checkout da Stripe abre dentro do app e, ao terminar, volta para esse endereço, que o próprio app atende: os ingressos aparecem sem passar pelo navegador. Por isso **`server.hostname` precisa ser o mesmo domínio para onde a Stripe redireciona** (o `SITE_URL` da função, se definido). Se o site mudar de domínio, atualize os dois.

**Publicar na Google Play:**

1. Crie a chave de assinatura (guarde o arquivo e as senhas; sem eles não é possível atualizar o app depois):
   ```bash
   keytool -genkey -v -keystore svi-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias svi
   ```
2. Em **Settings › Secrets and variables › Actions** do repositório, cadastre:
   `ANDROID_KEYSTORE_BASE64` (saída de `base64 -w0 svi-release.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`svi`) e `ANDROID_KEY_PASSWORD`.
3. As próximas execuções do workflow geram também `svi-android-loja`, com o `app-release.aab` para enviar no [Play Console](https://play.google.com/console). O número da versão sobe sozinho a cada execução.

O identificador do app é `com.ghosttech.svi` (`appId` em `capacitor.config.json` e `applicationId` em `mobile/android/app/build.gradle`). Ele não pode mudar depois da primeira publicação na Play Store.

**iPhone:** use o app instalável (PWA). Um app na App Store exige Mac com Xcode e conta de desenvolvedor Apple; dá para gerar com `npx cap add ios` dentro de `mobile/` quando for o caso.

O ícone do app é `mobile/icone.svg`; os PNGs de `public/icons/` e `mobile/android/app/src/main/res/` foram gerados a partir dele.

## Testes

```bash
npm test
```

Cobrem o fluxo completo com webhook assinado, idempotência, valor divergente, pedido expirado, validação duplicada e bloqueio de força bruta.

## Estrutura

```
public/        front-end (index.html, styles.css, app.js)
  sw.js, manifest.webmanifest, icons/   app instalável (PWA)
  vendor/      bibliotecas de QR Code e do Supabase
mobile/        app Android (Capacitor)
src/app.js     rotas da API e webhook da Stripe
src/db.js      banco SQLite (pedidos e ingressos)
src/auth.js    sessão da portaria e limite de tentativas
src/config.js  variáveis de ambiente
test/          testes de integração
```

## Implantação

Qualquer serviço que rode Node com disco persistente (Render, Railway, Fly.io, VPS). Defina as variáveis de ambiente, aponte `BASE_URL` para o domínio com HTTPS e cadastre o webhook. A câmera da portaria exige HTTPS (ou `localhost`).
