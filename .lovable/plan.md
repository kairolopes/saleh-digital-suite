

## Problema

O fluxo atual é: extrair dados → confirmar → (se fornecedor não identificado) perguntar fornecedor. Mas o usuário quer que **tudo esteja correto antes da confirmação final**. Se o fornecedor mencionado ("dia a dia") não foi encontrado no sistema, o bot deveria perguntar qual fornecedor ANTES de mostrar a confirmação.

## Solução

Reordenar o fluxo para:

```text
Mensagem → Extração IA → Match produto → Match fornecedor
  → (a) fornecedor confiante → confirmação com tudo preenchido → registro
  → (b) fornecedor não encontrado/ambíguo → perguntar fornecedor → confirmação → registro
  → (c) sem fornecedor mencionado → confirmação → perguntar fornecedor → registro
```

### Mudanças em `supabase/functions/webhook-zapi-purchase/index.ts`

1. **Quando o produto é confiante e a IA extraiu um fornecedor mas o match falhou** (linhas ~462-496):
   - Em vez de ir direto para `awaiting_confirmation` com `supplier_id = null`, ir para `awaiting_supplier` e mostrar a lista de fornecedores, informando que "dia a dia" não foi encontrado.
   - Guardar os dados (produto, quantidade, valor) na pendência com status `awaiting_supplier`.

2. **Após escolher fornecedor no estado `awaiting_supplier`** (função `handleSupplierSelection`):
   - Depois de o usuário escolher o fornecedor, salvar o `supplier_id` e mudar para `awaiting_confirmation` mostrando TODOS os dados completos (produto + fornecedor) para confirmação final.

3. **`handleConfirmation`** com fornecedor já preenchido:
   - Se `supplier_id` existe → registrar direto (já funciona assim).
   - Se `supplier_id` é null e a IA não mencionou fornecedor → perguntar fornecedor (manter fluxo atual para quando o usuário não menciona nenhum fornecedor).

4. **Atualizar `handleSupplierSelection`**:
   - Após o usuário escolher, em vez de registrar direto, salvar o `supplier_id` e mudar status para `awaiting_confirmation` com mensagem de confirmação completa.
   - Somente se veio do fluxo antigo (confirmação já dada), registrar direto.

### Resumo do impacto
- Apenas o arquivo `supabase/functions/webhook-zapi-purchase/index.ts` precisa ser editado.
- Nenhuma migração necessária.
- O fluxo garante que todos os dados estejam resolvidos antes do "Sim/Não" final.

