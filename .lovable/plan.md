## Objetivo

Expandir `webhook-zapi-purchase` para aceitar **fotos, PDFs e notas fiscais** com **múltiplos itens**, usando o Gemini multimodal (sem OCR externo). Confirmação em lote, fornecedor com memória de apelidos, e produtos novos com pergunta antes de cadastrar.

## Hoje vs. Depois

| | Hoje | Depois |
|---|---|---|
| Texto WhatsApp | ✅ 1 item | ✅ N itens |
| Foto | ✅ 1 item (item principal) | ✅ N itens da nota inteira |
| PDF | ❌ | ✅ N itens |
| Áudio | ❌ | (fora desta entrega) |
| Confirmação | item único | **lote** ("1=confirmar tudo, 2=cancelar") |
| Produto não cadastrado | matching obriga escolha | **pergunta** antes de criar |
| Fornecedor | escolher da lista toda vez | **detecta da nota + aprende apelidos** |

## Mudanças

### 1. Banco de dados (migration)

**`supplier_aliases`** (nova tabela) — memória de nomes alternativos:
```
id, supplier_id (FK suppliers), alias text, cnpj text nullable, created_at
unique(alias normalizado)
```
RLS: admin/estoque manage; staff view.

**`pending_whatsapp_purchases`** (alterar):
- `items jsonb` — array `[{produto, quantidade, unidade, valor_total, product_id?, needs_creation?, suggested_category?}, ...]`
- `current_item_index int default 0` — para perguntas item-a-item de produto novo
- novo `status`: `awaiting_supplier_alias`, `awaiting_new_product_confirm`, `awaiting_batch_confirm`

### 2. Edge function `webhook-zapi-purchase`

**a) Detecção de mídia no webhook Z-API:**
- `image.imageUrl` → foto (já existe, expandir para multi-item)
- `document.documentUrl` + mime `application/pdf` → PDF
- `document` com mime de imagem → tratar como foto

**b) Download e envio ao Gemini:**
- Imagem: já funciona (base64 inline `image_url`)
- PDF: baixar, enviar como base64 com `mime_type: application/pdf` no Gemini 2.5 Pro (suporta PDF nativo até ~50 páginas). Modelo: `google/gemini-2.5-pro` (Pro, não Flash, pra OCR de nota).

**c) Tool call `register_purchase_batch`** — substitui o single-item no fluxo de mídia:
```json
{
  "fornecedor": { "nome": "...", "cnpj": "..." },
  "itens": [
    { "produto": "Tomate", "quantidade": 5, "unidade": "kg", "valor_total": 25.00 },
    ...
  ]
}
```
Sistema: "Extraia TODOS os itens visíveis. Se for nota fiscal, leia razão social e CNPJ do emitente."

**d) Resolução de fornecedor (com aliases):**
1. Match por CNPJ exato em `suppliers.cnpj` → vincula
2. Match por `supplier_aliases.alias` (normalizado) → vincula
3. Match fuzzy em `suppliers.name` (score ≥ 0.7) → vincula
4. Senão → status `awaiting_supplier_alias`, pergunta:
   > "Identifiquei fornecedor *Distrib. ABC LTDA* (CNPJ 12.345…). Não está cadastrado com esse nome. A qual fornecedor da lista corresponde? \n1 - Hortifruti X\n2 - Atacadão Y\n…\n*N* - Cadastrar como novo"
   - Se escolher existente → grava em `supplier_aliases` (nome+CNPJ). Próxima nota desse CNPJ vincula sozinha.
   - Se "N" → cria novo `supplier`.

**e) Resolução de produtos (item por item, antes do lote):**
- Para cada item extraído, roda matching atual (`scoreProduct`).
- Se score ≥ 0.7 e único → marca `product_id` direto.
- Se score < 0.7 → marca `needs_creation=true` com `suggested_unit` da nota.
- Após resolver fornecedor, **percorre itens com `needs_creation`** um a um:
  > "Item 3/7: *Queijo mussarela 2kg R$ 89,90* — não está cadastrado. Quer cadastrar?\n1 - Sim (categoria: Laticínios, unid: kg)\n2 - Vincular a produto existente (responda nome)\n3 - Pular este item"
  - Categoria sugerida: pede ao Gemini classificar nome do produto contra `product_categories` existentes.
- Itens com múltiplos matches ambíguos → mesma lógica do fluxo atual (lista numerada).

**f) Confirmação em lote final:**
```
🧾 *Nota de Distrib. ABC* — 7 itens, R$ 432,50

1. Tomate 5kg — R$ 25,00 ✅
2. Cebola 3kg — R$ 18,00 ✅
3. Queijo musc. 2kg — R$ 89,90 🆕 (será cadastrado)
4. Óleo soja 12un — R$ 76,80 ✅
…

*1* - Confirmar tudo | *2* - Cancelar | *r N* - remover item N
```
- `r 3` remove item 3 e re-renderiza.
- `1` → cria produtos novos pendentes, insere N linhas em `purchase_history`, dispara triggers de estoque (já existem), apaga pending.

### 3. Arquivos afetados

- `supabase/functions/webhook-zapi-purchase/index.ts` — refactor grande
- Migration: criar `supplier_aliases`, alterar `pending_whatsapp_purchases`
- `src/pages/Fornecedores.tsx` — pequena seção mostrando apelidos aprendidos (opcional, não bloqueia)
- Memory: atualizar `mem://features/integracao-whatsapp-zapi` e `mem://logica/parsing-ia-compras`

## Detalhes técnicos

- **Modelo IA**: `google/gemini-2.5-pro` para mídia (melhor OCR), mantém `gemini-2.5-flash` para texto puro.
- **PDF**: enviado inline base64 ao Gemini Pro — sem libs externas, sem `pdf-parse`.
- **Limite Z-API**: URLs de mídia expiram; baixar imediatamente no recebimento.
- **Idempotência**: hash do `messageId` Z-API para não processar duas vezes a mesma foto.
- **Timeout**: parsing de PDF pode levar 30-60s; resposta inicial "🔍 Analisando nota, aguarde…" antes de chamar Gemini.

## Fora do escopo (não faz agora)

- Áudio/voz
- Edição de quantidade/valor de item individual via WhatsApp (só remover/confirmar)
- UI web pra revisar pendentes antes de confirmar (continua tudo no chat)

## Riscos

- Notas com baixa qualidade de foto: o Gemini pode errar valores. Mitigação: tela de confirmação em lote já obriga revisão humana.
- PDFs grandes (>50 páginas) cortados pelo modelo. Mitigação: avisar usuário se nota tiver mais de 50 itens.
