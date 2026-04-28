## Resposta honesta

**Sim, eu consigo fazer isso por completo.** Já inspecionei o arquivo de verdade e confirmo que dá para importar tudo de forma consistente, com cálculos corretos e amarrações entre fichas. Mas quero que você entenda **exatamente** o que vou fazer e quais decisões precisam ser tomadas, para não ter surpresa.

---

## O que existe na planilha

- **271 produtos/insumos** organizados em 7 categorias (Secos, Hortifrúti, Proteínas animais, Queijos e Laticínios, Grãos de café, SubProdutos e outros).
- **32 fichas técnicas** (FT = ficha de custo, FR = ficha de receita/preparo).
- **25 sub-produtos referenciados** dentro das fichas (SB / SP) — ou seja, fichas que viram "ingredientes" de outras fichas (ex: a FT do "Bife acebolado" usa SB Arroz branco + SB Feijão carioca + SB Bife bovino + SB Salada 1 + SB Molho simples + Cebola).

Cada ficha traz: ingredientes, quantidade líquida, unidade, fator de rendimento, quantidade bruta, preço unitário, custo total, peso final, número de porções e custo por porção.

## O que existe hoje no seu sistema

- Estoque: já tem produtos cadastrados (com categorias funcionando).
- Fichas técnicas: praticamente vazias (3 fichas, sendo 1 duplicada).
- Estrutura no banco já suporta tudo: `products`, `product_categories`, `recipes` (com tipo `prato_final` ou `subproduto`), `recipe_items` (que aceita `product_id` OU `subrecipe_id` — perfeito para encadear subprodutos).

---

## Plano de execução (4 etapas)

### Etapa 1 — Sincronizar produtos do estoque
1. Ler os 271 produtos da planilha.
2. Criar/atualizar as 7 categorias na tabela `product_categories` (com cores).
3. Para cada produto da planilha:
   - Se já existe no estoque (match por nome normalizado, ignorando acentos/espaços/maiúsculas) → **atualizar** preço, unidade e categoria.
   - Se não existe → **criar** novo produto inativo com `current_quantity = valor da planilha`.
4. **Não vou apagar** produtos existentes que não estão na planilha (preserva seu histórico).

### Etapa 2 — Criar os subprodutos (fichas-base)
Vou criar primeiro as 16 fichas marcadas como `Sub Produto` ou referenciadas como SB/SP, com `recipe_type = 'subproduto'`:
- Ingredientes apontam para `product_id` (insumo do estoque).
- Salvo `yield_quantity` (peso final), `yield_unit` e número de porções.

### Etapa 3 — Criar os pratos finais
As 16 fichas marcadas como `Produto` viram `recipe_type = 'prato_final'`:
- Ingredientes que são SB/SP apontam para `subrecipe_id` (a ficha do subproduto criada na Etapa 2).
- Ingredientes simples apontam para `product_id`.
- Isso faz o **custo cascatear automaticamente**: se o preço do feijão preto subir, o custo da Base Feijoada sobe, e o custo da Feijoada como prato sobe junto.

### Etapa 4 — Validação e relatório
Após importar, gero um relatório com:
- Quantos produtos foram criados vs atualizados.
- Lista de fichas criadas com custo calculado pelo sistema **vs** custo da planilha (para você conferir).
- Lista de ingredientes que **não bateram** com o estoque (caso eu tenha que criar produto novo) — você revisa antes de eu vincular.

---

## Decisões que preciso de você ANTES de executar

```text
1. Match de produtos
   ┌─────────────────────────────────────────────────┐
   │ Se "Cebola" da planilha não bater com nada do   │
   │ estoque, eu CRIO ou PERGUNTO antes?             │
   └─────────────────────────────────────────────────┘

2. Quantidade em estoque
   ┌─────────────────────────────────────────────────┐
   │ Sobrescrevo a quantidade atual do estoque com a │
   │ da planilha, ou MANTENHO a do sistema?          │
   └─────────────────────────────────────────────────┘

3. Pratos no Cardápio
   ┌─────────────────────────────────────────────────┐
   │ Após criar a ficha técnica, JÁ adiciono o prato │
   │ no Cardápio (menu_items) ou só cria a ficha?    │
   │ Se sim, qual preço de venda usar?               │
   └─────────────────────────────────────────────────┘
```

## O que NÃO vou fazer (sendo transparente)

- **Não vou importar o "Modo de Preparo" das fichas FR** automaticamente nesta primeira leva, porque os textos da planilha estão em uma única célula gigante mal formatada. Posso fazer numa segunda etapa, ficha por ficha.
- **Não vou tocar em pedidos, financeiro ou cardápio existentes.** Só estoque + fichas.
- **Não posso garantir 100% de acerto no match de nomes** — vou usar normalização inteligente (sem acento, lowercase, trim), mas casos como "Alho " com espaço, "Óleo de soja" vs "Oleo soja" podem precisar de revisão manual. Por isso o relatório da Etapa 4 é importante.

## Tempo estimado de execução

Tudo automatizado por script + migrations. Da hora que você aprovar até estar tudo no banco: ~3-5 minutos.

---

**Para eu começar, preciso só das 3 respostas acima** (match de produtos, quantidade em estoque, e cardápio).