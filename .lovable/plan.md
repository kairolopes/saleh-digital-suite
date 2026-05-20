## Problema

No fluxo de compras por WhatsApp (`webhook-zapi-purchase`), o bot às vezes não mostra fornecedores que existem no sistema, ou ainda escolhe um fornecedor parecido sozinho sem perguntar.

### Causas identificadas

1. **Lista filtrada por `is_active = true`** (linhas 336, 432, 445, 547). Qualquer fornecedor desativado some da lista do WhatsApp, mesmo que apareça normalmente em outras telas do sistema. Como na regra do projeto fornecedores são desativados (não excluídos), isso esconde itens válidos.

2. **Auto-vínculo silencioso por similaridade de nome** (linha 338): se o nome detectado tem score ≥ 0.80 contra qualquer fornecedor ativo, o bot vincula sozinho sem perguntar. Resultado: o usuário nunca vê a lista e a nota fica amarrada a um fornecedor errado (ex.: "Hortifruti Central" casando com "Hortifruti Centro").

3. **Mensagem `awaiting_supplier` sem opção `N`** (linha 442-449): quando a IA não detecta nome de fornecedor na nota, o menu só oferece "P - Sem fornecedor", não permite cadastrar um novo direto pelo WhatsApp.

## Correção

Editar apenas `supabase/functions/webhook-zapi-purchase/index.ts`:

### 1. Mostrar todos os fornecedores (ativos primeiro)
Trocar os 4 `SELECT ... .eq("is_active", true).order("name")` por `.order("is_active", { ascending: false }).order("name")`, exibindo "(inativo)" ao lado do nome na listagem. Assim o usuário enxerga tudo que existe no cadastro.

### 2. Nunca auto-vincular por similaridade de nome
Em `resolveSupplier` (linhas 322-344):
- Manter o match automático **apenas** por CNPJ exato (suppliers.cnpj ou supplier_aliases.cnpj).
- Manter o match automático por alias normalizado salvo (porque foi confirmado pelo usuário antes).
- **Remover** o bloco de score ≥ 0.80 que auto-aceita pelo nome — sempre devolver `needs_alias: true` quando só temos nome e não há alias salvo. Isso força o `advanceFlow` a mandar a lista para o usuário escolher.

### 3. Adicionar opção "N - Cadastrar novo fornecedor" no fluxo `awaiting_supplier`
No bloco 442-449 e no handler `awaiting_supplier` (linhas 546+), aceitar `N` mesmo quando não há `detected_supplier_name`, perguntando em seguida o nome do novo fornecedor (novo status `awaiting_new_supplier_name`) e gravando via `suppliers.insert`. Depois segue o fluxo normal de itens.

### 4. Ajuste no handler `awaiting_supplier_alias / awaiting_supplier`
Atualizar o índice de seleção (`sList[idx]`) para refletir a nova ordenação (ativos + inativos juntos). Ao escolher um inativo, reativar automaticamente (`is_active = true`) para não bagunçar relatórios.

## Resultado esperado

- Toda nota com fornecedor detectado por nome (sem CNPJ e sem alias salvo) **sempre** mostra a lista completa de fornecedores ao usuário.
- Lista inclui fornecedores inativos marcados como "(inativo)".
- Usuário pode digitar `N` em qualquer ponto para cadastrar um novo fornecedor direto pelo WhatsApp.
- Após a primeira escolha, o alias fica salvo em `supplier_aliases` e a próxima nota do mesmo emitente é resolvida automaticamente — sem chutes por similaridade.

## Fora do escopo

- Não vou mexer no parser da IA, no fluxo de itens, em RLS, nem no schema.
- Não vou alterar a tela `/fornecedores` no frontend.
