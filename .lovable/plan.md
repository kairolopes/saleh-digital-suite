## Excluir definitivamente "Abacaxi aguado"

Forçar exclusão completa, removendo também os 2 itens de pedidos históricos que referenciam essa ficha.

### Passos

1. `DELETE FROM order_items` onde `menu_item_id` = item de menu vinculado à receita `dec8944f-ef92-42e0-b2a8-db8bd6f16f8b` (2 registros).
2. `DELETE FROM menu_items WHERE recipe_id = 'dec8944f-ef92-42e0-b2a8-db8bd6f16f8b'`.
3. `DELETE FROM recipe_items WHERE recipe_id = 'dec8944f-ef92-42e0-b2a8-db8bd6f16f8b'` (caso haja resíduo).
4. `DELETE FROM recipes WHERE id = 'dec8944f-ef92-42e0-b2a8-db8bd6f16f8b'`.
5. `SELECT` final confirmando que sumiu de `recipes`, `menu_items` e `order_items`.

### Observação
Os 2 pedidos históricos vão perder esse item da composição (totais antigos não serão recalculados — ficam como estavam). Nenhuma outra ficha, produto, estoque ou lançamento financeiro é afetado.