## Problema

Existem ~220 produtos ativos. Muitos são variações do mesmo insumo cadastrado como produtos distintos (ex.: `Filé mignon` vs `Filé Mignon Bovino (BDJ)`, `Catchup` vs `Katchup`, `Óleo de soja` vs `Óleo de Soja Vila Velha 900ml`, `Mussarela VINILAC` / `CENAGGIO` vs `Queijo mussarela`, `Margarina` vs `Margarina delicia kg` vs `Margarina Sina balde 80% 15kg`, etc.). Eles deveriam ser **o mesmo produto da ficha técnica**, com a marca/embalagem apenas em `brand`.

## Estratégia

Usar os 46 produtos **vinculados a `recipe_items`** como **âncoras canônicas**. Todo outro produto ativo cujo nome "encaixe" em uma âncora deve virar candidato a mesclagem nessa âncora (preservando marca/embalagem em `brand`).

### Como detectar candidatos

Para cada produto não-âncora com mesma `unit` de uma âncora, calcular score = combinação de:

1. Match de token raiz (primeira palavra significativa, sem acento/case) — ex.: `mignon` ⊂ `Filé mignon` e `Filé Mignon Bovino (BDJ)`.
2. Distância de Levenshtein normalizada ≤ 0,25 sobre nomes normalizados (trim, sem acentos, lower, sem pontuação, sem números/medidas como `350ml`, `5kg`, `un`).
3. Contém o nome inteiro da âncora como substring (ex.: `Margarina delicia` contém `Margarina`).
4. Sinônimos manuais conhecidos: `catchup↔katchup`, `mussarela↔queijo mussarela`, `oleo de soja↔óleo de soja`, `paprica↔páprica`.

Cada candidato vira uma **proposta** com: âncora sobrevivente, duplicata a absorver, marca extraída (palavras restantes após remover a âncora — ex.: `VINILAC`, `Vila Velha 900ml`, `BDJ`, `delicia`, `Sina balde 80% 15kg`).

### Importante: confirmação obrigatória

Não dá para mesclar automaticamente porque há falsos positivos óbvios (`Açúcar cristal` vs `Açúcar refinado`, `Bacon` vs `Bacon fino`, `Sal refinado` vs `Sal grosso`, `Refri coca 355ml` vs `Refri coca 1lt`, `Cerveja heineken long neck` vs `Cerveja heineken 600ml`, `Pimenta bode` vs `Pimenta dedo de moça`, `Filme pvc 30m` vs `Filme pvc 40m`). O usuário precisa aprovar grupo a grupo.

## Execução (após aprovação)

### Etapa 1 — Gerar e mostrar relatório de candidatos

Rodar a heurística e listar no chat todos os grupos detectados, agrupados em 3 níveis de confiança:

- **Alta confiança** (substring exata da âncora ou sinônimo conhecido): `Catchup`/`Katchup`, `Óleo de soja`/`Óleo de Soja Vila Velha 900ml`, `Filé mignon`/`Filé Mignon Bovino (BDJ)`, `Mussarela VINILAC`/`Mussarela CENAGGIO` → `Queijo mussarela`, `Margarina delicia kg`/`Margarina Sina balde 80% 15kg` → `Margarina`, `Arroz` → `Arroz cristal`, `Repolho` → `Repolho branco`, `Banana da Terra` (a inativa já foi tratada na rodada anterior).
- **Média confiança** (distância pequena, mesma unidade, mesmo radical): pedir confirmação 1 a 1.
- **Não tocar**: SKUs com medida/sabor distintos (refris, cervejas, águas com/sem gás, tipos de pimenta, tipos de açúcar, `Bacon` vs `Bacon fino`, `Filme pvc 30m` vs `40m`, `Paprica doce` vs `Paprica doce defumada`).

O relatório é apresentado como tabela "ÂNCORA ← duplicata (marca extraída, qty atual)". Usuário marca quais aprovar.

### Etapa 2 — Migração de consolidação (mesmo padrão da rodada anterior)

Para cada par aprovado:

1. Sobrevivente = produto âncora (o que está em `recipe_items`).
2. `current_quantity` += quantidade da duplicata.
3. `average_price` = média ponderada por quantidade.
4. `last_price` = do mais recente.
5. Se `brand` da âncora ainda está nulo e a marca extraída faz sentido, **não** sobrescrever — deixar nulo (a âncora é genérica). A marca fica registrada na nota do `stock_movements` de auditoria.
6. Reapontar `purchase_history.product_id`, `stock_movements.product_id`, `recipe_items.product_id` para o sobrevivente.
7. Inserir `stock_movements` tipo `ajuste` com nota: `"Consolidação: <nome duplicata> (marca: <X>) absorvido em <âncora>"`.
8. `UPDATE products SET is_active = false` na duplicata.

### Etapa 3 — Prevenção (frontend)

Em `src/pages/Estoque.tsx`:

- No **bulk upload JSON** e na **criação manual**, antes de inserir, normalizar o nome (sem acento, lower, sem pontuação, sem medidas) e comparar com produtos ativos.
- Se houver match com um produto **que está em receita** (âncora), bloquear a criação e mostrar diálogo: `"Já existe '<âncora>' na ficha técnica. Use o produto existente ou registre a compra apontando para ele. Continuar mesmo assim?"` (com botão "Usar existente" / "Criar novo mesmo assim").
- Se for upload em lote, agregar como já fazemos e somar à âncora encontrada (em vez de criar novo).

Em `src/pages/Compras.tsx` (WhatsApp e manual já apontam para `product_id`, sem mudança necessária — o webhook já usa matching semântico).

## Detalhes técnicos

- Migração será um único arquivo SQL com `DO $$` blocks por par aprovado, para manter atomicidade por grupo.
- Não mexer em `Filme pvc`, refris, cervejas, águas saborizadas, tipos de pimenta, tipos de açúcar, `Bacon`/`Bacon fino`.
- Não mexer no webhook do WhatsApp.

## Fora do escopo

- Criar UI de "merge produtos" administrativa (poderia ser feita depois se for recorrente).
- Renomear automaticamente produtos âncora (manter nome como está nas receitas).

---

**Próximo passo**: Se aprovar este plano, na implementação eu vou primeiro **listar no chat** todos os grupos candidatos detectados (com nomes, IDs e quantidades), você marca quais mesclar, e só então rodo a migração + ajustes no Estoque.