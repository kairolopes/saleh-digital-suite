## Objetivo
Zerar todo o histórico de compras para recomeçar do zero.

## O que será apagado
- `purchase_history` — 322 registros (todas as compras lançadas).
- `pending_whatsapp_purchases` — 2 registros (compras pendentes via WhatsApp).
- `stock_movements` do tipo `entrada` com `reference_type = 'compra'` — movimentações geradas pelas compras (para o estoque não ficar com histórico de entradas órfãs).

## O que NÃO será apagado
- Produtos (`products`) permanecem; estoque atual, preço médio e último preço **não são recalculados** — ficam como estão hoje. Se quiser também zerar quantidades/preços dos produtos, me avise.
- Fornecedores, fichas técnicas, pedidos, cardápio e financeiro permanecem intactos.
- Saídas de estoque por pedidos não são tocadas.

## Execução
Um único `DELETE` transacional via `supabase--insert` nas três tabelas acima. Em caso de erro, nada é gravado.

## Verificação
`SELECT COUNT(*)` nas três tabelas deve retornar 0.