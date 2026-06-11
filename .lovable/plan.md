
## Objetivo
Substituir todas as fichas técnicas atuais pelas receitas do arquivo `Cópia de Saleh - Antepastos.xlsx`, criar os insumos faltantes no estoque com preço da planilha, e refazer o cardápio para refletir os novos pratos.

## Fichas a importar (28 únicas)
Mantendo a versão mais recente das duplicadas (Patê de frango 2, Tabule 2, Lagarto desfiado 2):

**Subprodutos / preparações** (não viram prato isolado, mas usados em outras fichas):
- Tempero verde, Kafta (assar), Kafta toska, Recheio frango (toska), Carne moída (base), Coalhada síria, Preparação ariche, Massa para quibe, Picanha de carneiro (tempero)

**Pratos finais** (vão para o cardápio com preço 0):
- Patê de frango, Patê de abacaxi, Quibe Cru, Tabule, Salada de beringela, Lagarto cozido, Lagarto desfiado, Beringela assada, Babaganoush, Toska de kafta, Toska de frango, Arroz com lentilha, Picanha de carneiro, Charuto de repolho, Charuto de uva, Ariche, Homus, Quibe com mussarela, Quibe com carne

Conforme escolha do usuário, **todas as 28 fichas** também entram no cardápio (categoria "Pratos", preço R$ 0,00 para revisão).

## Vínculos com subprodutos (SP)
Os ingredientes da planilha que correspondem a outra ficha do mesmo arquivo serão registrados como `subrecipe_id` em vez de `product_id`:
- "Tempero verde" → ficha Tempero verde
- "Kafta para toska" → ficha Kafta toska
- "Carne moída (base)" → Carne moída (base)
- "Coalhada síria" → Coalhada síria
- "Ariche" e "Preparação ariche" entre si
- "Massa para quibe" → Massa para quibe
- "Picanha de carneiro pronta" → Picanha de carneiro (tempero)
- "Tabule" (ingrediente do Quibe Cru) → ficha Tabule
- "Lagarto cozido" → ficha Lagarto cozido
- "Carne moída" usada como base → Carne moída (base)
- "Polpa beringela" → Beringela assada
- "Recheio frango" / "Kafta para assar" idem

## Estoque (produtos)
Para os ~45 ingredientes restantes (não-subprodutos), faço match por nome (case-insensitive, sem acento) com `public.products`. Quando não existir, **crio o produto** com:
- `unit` da planilha (kg, un, l)
- `last_price` e `average_price` = preço unitário da planilha
- `current_quantity = 0`, `is_active = true`, `is_visible_in_recipes = true`

Produtos já existentes **não** terão preço nem estoque alterados.

## Migração de fichas atuais
Conforme escolhido, "desativar e substituir":
- Para cada receita atual em `public.recipes`: setar `is_available = false`.
- Para cada item em `public.menu_items` atual: setar `is_available = false` (não excluo, pois pode haver histórico em pedidos).
- Não apago `recipe_items` antigos.

## Passos de execução
1. **Migração SQL**: criar produtos ausentes com preço da planilha.
2. **Insert SQL**: desativar todas as receitas e itens de cardápio atuais.
3. **Insert SQL em ordem topológica**:
   - Cria subprodutos primeiro (sem dependências externas), nome com prefixo `SP ` quando aplicável (Tempero verde, Carne moída base, Coalhada síria, Massa quibe, etc.).
   - Cria pratos finais depois, com `recipe_items` referenciando produtos OU subrecipes recém-criados.
   - `yield_quantity` = peso final da planilha (kg), `yield_unit = 'kg'` (ou `porções` para fichas que trazem nº de porções explícito como Kafta, Charuto repolho/uva).
4. **Insert SQL**: criar `menu_items` para todas as 28 receitas com `sell_price = 0`, `category = 'Pratos'`, `is_available = true`.
5. Verifica via `read_query` se totais batem (28 receitas novas ativas, 28 itens no cardápio, produtos criados conforme planilha).

## Detalhes técnicos
- Quantidades com 3 casas decimais (padrão do projeto).
- `recipe_type` = `subproduto` ou `prato_final`.
- Nome do subproduto recebe prefixo `SP ` (convenção da UI de fichas).
- Não toco nas tabelas `auth`/`storage`; nenhuma DDL nova é necessária — apenas DML em produtos/receitas/itens/cardápio.
- Tudo executado em transações via `supabase--insert`; em caso de erro, nada é gravado.

## O que NÃO faço
- Não altero preço/estoque de produtos já existentes.
- Não apago receitas/itens antigos — apenas desativo (mantém histórico de pedidos).
- Não defino preços de venda — todos ficam em R$ 0,00 para o usuário ajustar.
