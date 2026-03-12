

## Problema

Quando o usuário envia "feijão carioca, 32kg, 33reais, tatico t9", a IA extrai o fornecedor corretamente e ele aparece na confirmação. Porém, ao confirmar com "Sim", o `handleConfirmation` (linha 255-256) **sempre** muda o status para `awaiting_supplier` e pede para escolher fornecedor novamente — ignorando completamente o fornecedor já identificado.

O fornecedor extraído pela IA (`parsed.fornecedor`) é exibido na mensagem de confirmação (linha 453), mas **nunca é salvo** na tabela `pending_whatsapp_purchases`. Então quando chega a confirmação, o sistema não tem como saber que já havia um fornecedor.

## Solução

### 1. Salvar o fornecedor identificado na pendência
- Quando a IA extrai um fornecedor (`parsed.fornecedor`), fazer matching semântico contra os fornecedores ativos usando `scoreProduct()`.
- Se encontrar match confiante, salvar o `supplier_id` na tabela `pending_whatsapp_purchases`.
- Adicionar coluna `supplier_id` à tabela `pending_whatsapp_purchases` (migração).

### 2. Alterar `handleConfirmation`
- Ao confirmar ("Sim"), verificar se já existe `supplier_id` na pendência.
- Se sim: pular etapa de fornecedor → registrar compra direto.
- Se não: seguir fluxo atual (pedir fornecedor).

### 3. Arquivo a editar
- `supabase/functions/webhook-zapi-purchase/index.ts`: bloco de inserção da pendência (linhas 441-445) e `handleConfirmation` (linhas 250-277).
- Migração: adicionar `supplier_id uuid references suppliers(id)` à tabela `pending_whatsapp_purchases`.

