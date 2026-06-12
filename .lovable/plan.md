## Objetivo
Remover de forma permanente as fichas técnicas antigas (pratos e subprodutos) que foram desativadas durante a substituição pelo novo cardápio, deixando apenas as 28 fichas atuais.

## Situação atual
- 28 fichas novas (ativas) — as do arquivo Saleh - Antepastos.
- 32 fichas antigas (`is_available = false`) ainda ocupando a tela de Fichas Técnicas.
- Nenhuma das antigas está vinculada a pedidos (`order_items`).
- 14 antigas são referenciadas como `subrecipe_id` apenas por outras antigas (cadeia interna do conjunto velho).

## O que será feito
1. Apagar `recipe_items` de todas as receitas com `is_available = false` (limpa as referências `subrecipe_id` internas e ingredientes).
2. Apagar os `menu_items` antigos (`is_available = false`) que apontam para essas receitas — eles também foram desativados no passo anterior e não têm pedidos.
3. Apagar as 32 receitas antigas em `public.recipes`.

Tudo em uma única transação via `supabase--insert` (DELETE). Se algo falhar (ex.: alguma FK inesperada), nada é gravado.

## O que NÃO faço
- Não toco nas 28 fichas novas nem em seus `recipe_items`.
- Não mexo no cardápio ativo (`menu_items` com `is_available = true`).
- Não altero pedidos, estoque, produtos nem nenhuma outra tabela.
- Não altero schema — apenas DML.

## Verificação final
`SELECT COUNT(*) FROM recipes` deve retornar 28, todas com `is_available = true`.