## Excluir ficha técnica "Abacaxi aguado"

A ficha `Abacaxi aguado` (id `dec8944f-ef92-42e0-b2a8-db8bd6f16f8b`) está vazia (0 ingredientes) e não é usada como subproduto, mas tem 1 vínculo no cardápio (`menu_items`).

### Passos

1. **Verificar pedidos** vinculados ao `menu_item` dessa receita (`order_items`).

2. **Decidir a ação conforme a regra do projeto** ("Deactivate, NEVER delete recipes/items linked to orders"):
   - **Sem pedidos** → deletar `menu_items` correspondente e depois `recipes` (id `dec8944f...`).
   - **Com pedidos** → desativar: `menu_items.is_available = false` + `recipes.is_available = false`. Avisar você que não foi possível excluir fisicamente.

3. **Confirmar** com `SELECT` final que a ficha não aparece mais (ou está desativada).

### Não será alterado
- `SP Abacaxi Assado` (subproduto ativo com 2 ingredientes, ligado ao cardápio).
- Duplicata vazia `SP Abacaxi Assado` (id `abe98e63...`) — não pediu pra mexer.
- Nenhum produto do estoque, pedido ou lançamento financeiro.