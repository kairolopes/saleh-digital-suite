## Objetivo
Limpeza total do módulo de estoque para recomeçar do zero. Fichas técnicas passarão a custar R$ 0 até as primeiras compras recalcularem o preço médio.

## O que será alterado

**Tabela `products`** (todos os insumos):
- `current_quantity = 0` — zera estoque atual
- `average_price = 0` — zera preço médio
- `last_price = 0` — zera último preço

**Tabela `stock_movements`**:
- `DELETE` em todos os registros — apaga todo o histórico de entradas e saídas (compras antigas, saídas por pedidos, ajustes manuais).

## O que NÃO será apagado
- Produtos em si (cadastro, nome, unidade, categoria, fornecedor, estoque mínimo) — permanecem.
- Fichas técnicas (`recipes`, `recipe_items`) — permanecem; custo calculado passa a ser R$ 0.
- Cardápio, pedidos, financeiro, fornecedores, reservas — intactos.

## Efeitos colaterais a observar
- Fichas técnicas e relatórios de custo mostrarão R$ 0 até a primeira compra de cada insumo.
- Próximos pedidos entregues vão deduzir do estoque e podem deixar quantidades **negativas** até você lançar compras.
- Histórico de movimentações da tela de Estoque fica vazio.

## Execução
Um único bloco transacional via `supabase--insert`:
1. `DELETE FROM stock_movements`
2. `UPDATE products SET current_quantity = 0, average_price = 0, last_price = 0`

## Verificação
- `SELECT COUNT(*) FROM stock_movements` → 0
- `SELECT COUNT(*) FROM products WHERE current_quantity <> 0 OR average_price <> 0 OR last_price <> 0` → 0
