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

## Testes

```bash
npm test
```

Cobrem o fluxo completo com webhook assinado, idempotência, valor divergente, pedido expirado, validação duplicada e bloqueio de força bruta.

## Estrutura

```
public/        front-end (index.html, styles.css, app.js)
src/app.js     rotas da API e webhook da Stripe
src/db.js      banco SQLite (pedidos e ingressos)
src/auth.js    sessão da portaria e limite de tentativas
src/config.js  variáveis de ambiente
test/          testes de integração
```

## Implantação

Qualquer serviço que rode Node com disco persistente (Render, Railway, Fly.io, VPS). Defina as variáveis de ambiente, aponte `BASE_URL` para o domínio com HTTPS e cadastre o webhook. A câmera da portaria exige HTTPS (ou `localhost`).
