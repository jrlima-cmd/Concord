# Catálogo Ghost tech

Vitrine dos sistemas da Ghost tech. É um site estático: a página inicial e a página de cada sistema
são montadas a partir de `produtos.json`, então **acrescentar um sistema é só acrescentar um item nesse arquivo**.

## Acrescentar um sistema

Copie o bloco abaixo para dentro da lista em `produtos.json` (separado do anterior por vírgula):

```json
{
  "id": "agenda",
  "nome": "Agenda+",
  "titulo": "Agendamento online para clínicas e salões",
  "categoria": "Agendamento",
  "status": "em-breve",
  "resumo": "Uma frase curta que aparece no cartão.",
  "descricao": "Um parágrafo explicando o que o sistema faz, na página de detalhes.",
  "recursos": ["Recurso 1", "Recurso 2"],
  "publico": "Para quem o sistema é feito.",
  "preco": { "mensalidade": 4990, "taxa": "", "observacao": "Sem fidelidade." },
  "links": { "assinar": "https://buy.stripe.com/...", "demonstracao": "https://..." },
  "icone": "agenda"
}
```

| Campo | O que é |
|---|---|
| `id` | Identificador único, sem espaços. Vira o endereço `/sistema?id=...` |
| `status` | `disponivel` ou `em-breve` (em breve troca o botão para "Avise-me quando lançar") |
| `categoria` | Os filtros aparecem sozinhos quando houver mais de uma categoria |
| `preco.mensalidade` | Em centavos (`4990` = R$ 49,90). Sem esse campo, aparece "Sob consulta" |
| `preco.taxa` | Texto extra ao lado do preço, por exemplo `+ 10% por ingresso vendido` |
| `links.assinar` | Link de pagamento da Stripe (assinatura mensal). Com ele, aparece o botão "Assinar agora"; sem ele, o botão abre um e-mail para a Ghost tech |
| `links.demonstracao` | Opcional. Mostra o botão "Demonstração" |
| `icone` | `ingresso`, `agenda`, `loja`, `grafico` ou `sistema` (padrão). Novos ícones ficam em `catalogo.js` |

Os sistemas disponíveis aparecem primeiro; dentro de cada grupo vale a ordem do arquivo.

## Pagamento (Stripe)

Cada sistema disponível tem um produto, um preço mensal e um link de pagamento na conta Stripe "Ghost tech".
Depois do pagamento a Stripe manda o cliente para `obrigado?sistema=<id>`. O link "Gerenciar minha assinatura"
(constante `PORTAL_ASSINANTE` em `catalogo.js`) abre o portal da Stripe, onde o cliente vê faturas, troca o cartão
ou cancela. Os links atuais são do **modo de teste**; para cobrar de verdade, crie os mesmos itens no modo real e
troque os endereços.

## Publicar

Projeto `ghosttech` na Vercel, publicando esta pasta como site estático. `vercel.json` define os cabeçalhos
de segurança (o site não carrega scripts de fora; só as fontes do Google).
