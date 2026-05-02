## Problema

No formulário de adicionar ingrediente da ficha técnica, o campo **Unid.** (linhas 1289–1297 de `src/pages/FichasTecnicas.tsx`) é um `<Input>` de texto livre. Isso permite digitar qualquer coisa (ex: "kg", "Kg", "kgs", "quilo"), gerando inconsistência nas unidades salvas em `recipe_ingredients.unit`.

Você quer que vire um **select** com opções fixas, igual ao seletor já usado para `yield_unit` no rendimento.

## Plano

Trocar o `<Input>` do campo **Unid.** por um `<Select>` com opções fixas:

- `kg` (quilograma)
- `g` (grama)
- `L` (litro)
- `mL` (mililitro)
- `unidade`
- `porção`

### Comportamento

1. Quando o usuário seleciona um insumo do estoque, a unidade já é preenchida automaticamente a partir de `product.unit` (linha 1241). Se a unidade do produto não bater exatamente com uma das opções do select (ex: produto cadastrado como "Kg"), normalizar para minúsculo na hora de exibir, mas manter a opção mais próxima selecionada. Se mesmo assim não bater nenhuma, manter como `kg` por padrão e logar um aviso.
2. Quando o usuário seleciona um subproduto, já vem `sp.yield_unit || "porção"` (linha 1248) — isso continua funcionando porque o seletor de rendimento do subproduto já usa as mesmas opções.
3. Para o usuário, o select fica visível e clicável mesmo após auto-preencher, permitindo trocar a unidade manualmente se quiser.

### Arquivo afetado

- `src/pages/FichasTecnicas.tsx` — substituir o bloco `<div className="w-20">` (linhas 1288–1297) por um `<Select>` usando `currentIngredient.unit` como `value` e `setCurrentIngredient(...)` no `onValueChange`.

### Fora de escopo

- Não vou alterar dados existentes em `recipe_ingredients` (unidades já salvas como texto livre permanecem como estão; só novas inserções/edições passam pelo select).
- Os campos `unit` em outras telas (estoque, compras) não são alterados.

## Pergunta

A lista de unidades acima (`kg`, `g`, `L`, `mL`, `unidade`, `porção`) cobre tudo que você usa, ou quer adicionar/remover alguma (ex: `dúzia`, `colher`, `xícara`)?