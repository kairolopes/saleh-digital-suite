## Diagnóstico

No fluxo do WhatsApp (`webhook-zapi-purchase/index.ts`), quando o bot pergunta "Esse produto não está cadastrado. O que fazer?" e o usuário responde **1 (Cadastrar)**, o sistema entra em loop e fica reenviando o mesmo prompt — dá a impressão de "erro ao cadastrar".

### Causa raiz

No handler `awaiting_new_product_confirm` (linhas 630-638), quando o usuário responde "1":

```ts
it.needs_creation = true;
it.product_name = it.produto;
// salva e chama advanceFlow
```

Em seguida, `advanceFlow` chama `sendNextNewProductPrompt`, que procura o próximo item com este filtro (linha 372):

```ts
items.findIndex(i => !i.excluded && i.needs_creation && !i.product_id);
```

O item recém-confirmado continua com `needs_creation = true` e `product_id = null` → **o mesmo item é encontrado de novo** e o prompt é reenviado infinitamente. O produto nunca é cadastrado de fato porque o commit só acontece em `awaiting_batch_confirm`, etapa que nunca é alcançada.

O `product_name` é setado mas o filtro não olha para isso, então não resolve.

## Correção

### `supabase/functions/webhook-zapi-purchase/index.ts`

**1.** No tipo `ResolvedItem`, adicionar flag `creation_confirmed?: boolean` para marcar itens que já foram confirmados pelo usuário para serem criados no commit.

**2.** No handler de "1" em `awaiting_new_product_confirm` (linha 630), trocar a lógica para:
```ts
it.needs_creation = true;
it.creation_confirmed = true;
it.product_name = it.produto;
```
(remover o segundo update redundante).

**3.** Em `sendNextNewProductPrompt` (linha 372), atualizar o filtro para ignorar itens já confirmados:
```ts
items.findIndex(i => !i.excluded && i.needs_creation && !i.product_id && !i.creation_confirmed);
```

**4.** Em `commitBatch` (linha 477), a condição de criação fica `if (!productId && it.needs_creation)` — continua válida, pois `creation_confirmed` implica `needs_creation`.

### Resultado esperado

- Usuário envia compra → bot pergunta sobre item novo → responde "1" → bot avança imediatamente para o próximo item novo (ou para a confirmação final do lote).
- Ao confirmar o lote com "1", o produto "Grão de bico" é criado e a compra registrada.

## Fora do escopo

- Não vou mexer no parser de IA, no fluxo de fornecedor, nem em RLS.
- Não vou alterar o schema do banco — `creation_confirmed` é só um campo no JSON `items`.
