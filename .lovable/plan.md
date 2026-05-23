## Objetivo

Eliminar produtos duplicados no estoque (mussarelas VINILAC, CENAGGIO e outros), consolidando quantidade e histórico em um único registro por produto, **preservando a marca** numa coluna própria. Em seguida, corrigir o upload em lote do Estoque para nunca mais criar duplicatas.

## 1. Migração de schema

- Adicionar coluna `brand TEXT` em `products` (nullable). Vai guardar a marca (ex.: `VINILAC`, `CENAGGIO`), permitindo que dois produtos com mesma essência ("mussarela") mas marcas diferentes convivam claramente identificados.

## 2. Consolidação dos duplicados (operação de dados)

Para cada grupo de duplicatas:

1. Escolher como **sobrevivente** o registro mais antigo (menor `created_at`).
2. Atualizar no sobrevivente:
   - `current_quantity` = soma de todas as quantidades do grupo.
   - `average_price` = média ponderada `Σ(qty_i × avg_i) / Σ(qty_i)` (ignorando zeros para não enviesar).
   - `last_price` = `last_price` do mais recente.
   - `brand` = marca extraída do nome (ver lista abaixo).
   - Normalizar `name` (trim, colapsar espaços, capitalizar de forma consistente).
3. Reapontar registros filhos para o sobrevivente:
   - `purchase_history.product_id`
   - `stock_movements.product_id`
   - `recipe_items.product_id`
4. Inserir 1 `stock_movements` de auditoria por duplicata absorvida, tipo `ajuste`, notes: `"Consolidação de duplicata: <id antigo> mesclado em <id sobrevivente>"`.
5. Marcar duplicatas restantes como `is_active = false` (não deletar, conforme regra do projeto).

### Grupos a consolidar

| Grupo (normalizado) | Itens | Nome final sugerido | brand |
|---|---|---|---|
| `qjtmussvinilac` | 10 | `Mussarela VINILAC` | `VINILAC` |
| `qjmusscenaggio` | 6 | `Mussarela CENAGGIO` | `CENAGGIO` |
| `batatadoce` | 2 | `Batata doce` | null |
| `salgrosso` | 2 | `Sal grosso` | null |
| `bananadaterra` | 2 | `Banana da Terra` | null |
| `alho` | 2 | `Alho` | null |
| `beterraba` | 2 | `Beterraba` | null |
| `oleosojavilavelha900ml` | 2 | `Óleo de Soja Vila Velha 900ml` | `Vila Velha` |
| `pimentabode` | 2 | `Pimenta bode` | null |
| `bdjfilemignonbovino` | 2 | `Filé Mignon Bovino (BDJ)` | `BDJ` |

**Não consolidar** (são produtos legitimamente diferentes):
- `Filme pvc 30m 600g` vs `Filme pvc 40m 600g` (medidas diferentes).
- `Queijo mussarela` (o genérico, usado nas compras via WhatsApp) e `Mussarela de bufála - bola` permanecem como estão — não são duplicatas.

## 3. Corrigir bulk upload no Estoque

Em `src/pages/Estoque.tsx`, no fluxo de upload em lote (JSON):

- Antes de inserir cada item, calcular chave normalizada `lower(trim(collapse_spaces(name))) + '|' + lower(unit)`.
- Se já existe produto ativo com a mesma chave:
  - **Não criar** novo registro.
  - Somar `quantity` ao `current_quantity` do existente.
  - Recalcular `average_price` ponderado se houver `unit_price` informado.
  - Inserir um `stock_movements` tipo `entrada` referenciando o lote.
- Se for novo, inserir normalmente (com `brand` opcional, se o JSON trouxer).
- Mostrar no toast final um resumo: `X novos, Y mesclados em existentes`.

## 4. Exibição da marca

Em `src/pages/Estoque.tsx`:
- Listar a coluna/badge `brand` ao lado do nome quando preenchida.
- No formulário de criação/edição manual de produto, expor o campo `brand` (opcional).

Não é necessário mexer em Fichas Técnicas, Compras manual ou no webhook do WhatsApp — eles continuam funcionando pelo `product_id`.

## Resultado

- Estoque limpo: 1 linha por (produto, marca, unidade), com quantidade somada correta.
- Histórico de compras / movimentações / receitas preservados (apontam para o sobrevivente).
- Marcas continuam visíveis e separadas quando relevante.
- Próximos uploads em lote nunca mais criam duplicatas — somam ao existente.

## Fora do escopo

- Não alterar lógica do WhatsApp.
- Não mexer em `Filme pvc` (são SKUs diferentes).
- Não criar tela de gestão de marcas; `brand` é só texto livre por enquanto.
