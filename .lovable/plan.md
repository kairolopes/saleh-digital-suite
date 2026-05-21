## Objetivo

Esconder das fichas técnicas os produtos do estoque que não são usados em nenhuma receita. O usuário precisa "liberar" manualmente esses produtos para que voltem a aparecer no seletor de ingredientes. Se uma compra (manual ou via WhatsApp) cair em um produto oculto, o sistema deve avisar que ele existe mas está oculto, e oferecer liberar.

## Mudanças

### 1. Banco (`products`)
Adicionar coluna `is_visible_in_recipes BOOLEAN NOT NULL DEFAULT true`.
- Migração inicial: marcar `false` para todo produto que **não** aparece em nenhum `recipe_items.product_id`.
- Produtos novos nascem `true` (default).

### 2. Tela `Estoque` (`src/pages/Estoque.tsx`)
- Mostrar badge "Oculto das fichas" nos produtos com `is_visible_in_recipes = false`.
- Adicionar filtro/aba "Ocultos" além de "Ativos" e "Inativos".
- Novo botão por linha: **"Liberar para fichas"** (quando oculto) / **"Ocultar das fichas"** (quando visível). Atualiza só `is_visible_in_recipes`, não mexe em `is_active`.

### 3. Tela `Fichas Técnicas` (`src/pages/FichasTecnicas.tsx`)
- No seletor de ingrediente, filtrar `products` por `is_active = true AND is_visible_in_recipes = true`.
- Produtos já vinculados a uma ficha continuam aparecendo na edição mesmo se ficarem ocultos depois (não quebrar receitas existentes) — manter o item carregado, só não listá-lo como nova opção.

### 4. Compra manual (`src/pages/Compras.tsx`)
- Ao buscar produto no formulário de compra, incluir ocultos na lista mas marcá-los com "(oculto das fichas)".
- Ao salvar a compra com um produto oculto, exibir um toast/diálogo: *"Este produto está oculto das fichas técnicas. Deseja liberá-lo?"* com botões **Liberar** / **Manter oculto**. "Liberar" seta `is_visible_in_recipes = true`.

### 5. WhatsApp (`supabase/functions/webhook-zapi-purchase/index.ts`)
- Listagens de produtos para o usuário escolher: incluir ocultos, marcando "(oculto das fichas)" ao lado do nome.
- Quando o usuário confirmar a compra de um produto oculto, enviar mensagem antes do `purchase_history.insert`:
  > "⚠️ O produto *X* existe no estoque mas está oculto das fichas técnicas (não faz parte de nenhuma receita). Deseja liberá-lo para uso nas fichas? *S* - Sim, liberar / *N* - Manter oculto"
- Novo status no fluxo: `awaiting_visibility_release`. Resposta `S` faz `update({ is_visible_in_recipes: true })` antes de gravar a compra; `N` grava a compra mantendo oculto.

## Resultado

- Fichas técnicas só listam produtos relevantes (usados em receitas ou liberados manualmente).
- Estoque continua mostrando tudo, com badge clara do que está oculto.
- Compras nunca falham por causa do filtro: o sistema avisa e dá a chance de liberar na hora.

## Fora do escopo

- Não mexer em `is_active` (continua sendo o flag de "desativado").
- Não alterar RLS nem o parser da IA.
- Não tocar no frontend de fornecedores nem no fluxo de itens da WhatsApp além do trecho de visibilidade.
