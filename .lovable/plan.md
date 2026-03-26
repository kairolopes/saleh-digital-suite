

## Problema

Atualmente, se o usuário não menciona fornecedor na mensagem, o fluxo pula direto para confirmação sem perguntar. O fornecedor deve ser **obrigatório** — sempre perguntar antes de confirmar.

## Solução

Editar `supabase/functions/webhook-zapi-purchase/index.ts` em 3 pontos:

### 1. Fluxo com produto confiante (linha 536-554)
Quando o fornecedor NÃO foi mencionado (`!parsed.fornecedor`), atualmente vai direto para `awaiting_confirmation`. Mudar para `awaiting_supplier` e mostrar a lista de fornecedores.

### 2. `handleProductChoice` (linha 276-294)
Quando o produto é escolhido e `supplier_id` já existe, vai para confirmação. Mas quando não existe, já vai para `awaiting_supplier` (linha 258-273). Isso já está correto — só garantir que o supplier_id nunca esteja preenchido se não foi confirmado.

### 3. `handleSupplierSelection` — remover opção "0 - Nenhum"
Nas linhas 270, 374, 380: remover a opção `0 - Nenhum` já que fornecedor é obrigatório. Ajustar a validação para não aceitar `num === 0`. Também remover o tratamento de "nenhum"/"sem fornecedor" (linhas 347-348).

### 4. Confirmação sem fornecedor
Na `handleConfirmation` (linha 302-326): se `supplier_id` for null, não permitir confirmar — redirecionar para escolha de fornecedor.

### Resumo das mudanças
- **Linha 270, 374, 380**: Remover "0 - Nenhum"
- **Linha 347-348**: Remover tratamento de "nenhum"/"sem fornecedor"  
- **Linha 352-353**: Rejeitar `num === 0`
- **Linha 536-554**: Quando não tem fornecedor, ir para `awaiting_supplier` em vez de `awaiting_confirmation`
- Tudo no arquivo `supabase/functions/webhook-zapi-purchase/index.ts`

