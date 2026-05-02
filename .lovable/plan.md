## Diagnóstico

Olhando o print, o campo "Rendimento (porções)" está com valor **558**, não 5,58. Foi por isso que o cálculo deu certinho R$ 0,29:

- Custo total: **R$ 81,40**
- 81,40 ÷ **558** = R$ 0,1458 por porção (≈ R$ 0,15)
- Com 100% de lucro = **R$ 0,29**

### Por que digitou 5,58 e virou 558?

O campo `yield_quantity` é um `<input type="text">` controlado, vinculado a um número (`formData.yield_quantity`). Hoje funciona assim:

1. Você digita `5`, vira `5`.
2. Você digita `,` → `parseDecimal("5,")` → `parseFloat("5.")` → `5` (vírgula descartada porque ainda não tem dígito depois).
3. Você digita `5` → o valor exibido é `5` (número), então fica `55` no input → `parseDecimal("55")` = `55`.
4. Você digita `8` → `558`.

A vírgula nunca "sobrevive" no estado porque ele é numérico. Em quantidade de ingredientes isso não acontece pois o estado é string.

Além disso, conceitualmente o campo está rotulado como "porções", mas para subprodutos (SP) o rendimento é em **kg/L/unidade**, não em porções. Para o "Peixe ao molho" você quer dizer "rende 5,58 kg", não "5,58 porções".

## Plano de correção

### 1. Permitir digitar vírgula no rendimento

Trocar o estado de `yield_quantity` no formulário para guardar **string** enquanto o usuário digita, e só converter para número na hora de calcular/salvar. Aplicar o mesmo para "Lucro (%)" para evitar o mesmo bug com decimais.

Mudanças em `src/pages/FichasTecnicas.tsx`:
- `formData.yield_quantity`: passa a ser `string` no estado do form (ex: `"5,58"`).
- `formData.profit_percent`: idem.
- No `onChange`, salvar `e.target.value` cru (sem `parseDecimal`).
- Nos cálculos (`getFormTotalCost / yield`, salvar mutation, etc.), aplicar `parseDecimal(formData.yield_quantity) || 1` na hora do uso.
- No reset/edit, converter número → string com vírgula (`String(value).replace(".", ",")`).

### 2. Rótulo correto conforme tipo de receita

No formulário, o label hoje é fixo "Rendimento (porções)". Ajustar para:
- Prato final: `Rendimento (porções)`
- Subproduto: `Rendimento (${yield_unit})` — ex: `Rendimento (kg)`

E exibir o campo `yield_unit` (já existe na tabela `recipes`) como um select ao lado quando for subproduto, com opções `kg`, `L`, `unidade`, `porção`.

### 3. Rótulo dos resultados

Onde aparece "Custo por Porção" e "Preço de Venda por Porção", trocar dinamicamente para "Custo por kg" / "Preço de Venda por kg" (ou unidade escolhida) quando for subproduto. Isso evita confusão futura.

### 4. Correção do dado atual no banco

A ficha "Peixe ao molho" está com `yield_quantity = 558`. Após o ajuste do form, abrir a ficha e digitar `5,58` no rendimento e salvar — ou eu rodo um UPDATE direto via migration para corrigir agora.

## Pergunta

Quer que eu já corrija o valor atual do "Peixe ao molho" para `5,58` junto com o ajuste do código, ou prefere reabrir a ficha e salvar manualmente depois?
