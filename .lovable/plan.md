

## Problema

Atualmente, `handleProductChoice` e `handleSupplierSelection` só aceitam resposta numérica. Se o usuário digitar o nome do produto (ex: "feijão carioca") ou do fornecedor (ex: "Atacadão"), o bot rejeita com "responda com o número".

## Solução

Modificar as duas funções para aceitar **número OU texto**:

### 1. `handleProductChoice` (linha 199-228)
- Primeiro tenta `parseInt`. Se for número válido, usa como antes.
- Se não for número, faz busca semântica usando `scoreProduct()` contra as opções disponíveis (`pending.product_options`).
- Se encontrar match único com score alto (>= 0.7), seleciona automaticamente.
- Se encontrar múltiplos matches próximos, re-envia a lista pedindo para ser mais específico.
- Se nenhum match, informa que não encontrou e re-envia a lista.

### 2. `handleSupplierSelection` (linha 260-301)
- Primeiro tenta `parseInt`. Se for número válido (incluindo 0), usa como antes.
- Se não for número, faz busca semântica com `scoreProduct()` (funciona para qualquer nome) contra a lista de fornecedores ativos.
- Se encontrar match único confiante, seleciona.
- Se ambíguo, re-envia lista pedindo número.
- Se nenhum match, informa e re-envia lista.

### Arquivo a editar
- `supabase/functions/webhook-zapi-purchase/index.ts`: funções `handleProductChoice` e `handleSupplierSelection`.

### Também atualizar as mensagens
- Trocar "_Responda com o número._" por "_Responda com o número ou o nome._" em todos os pontos relevantes (escolha de produto e fornecedor).

