## Diagnóstico

Olhei os logs da função `webhook-zapi-purchase` no momento em que você mandou `20kg cebola 8000 reais`, `bife 10kg 8000 reais` e `oleo 24 unidades a 9000 reais`. Em **todas** essas tentativas o webhook recebeu a mensagem e respondeu em ~1s — porém **sem o log "Parsed batch"**, e o usuário viu *"Não consegui identificar dados de compra"*. Isso significa que `parseTextWithAI` retornou `null`. Em apenas uma tentativa posterior o parse funcionou.

### Causas prováveis

1. **`tool_choice: "auto"` no parser de texto** (linha 220) — deixa o Gemini decidir se chama a tool. Quando o preço soa "absurdo" (8000 reais por 20kg de cebola), o modelo às vezes responde em texto livre em vez de chamar `register_purchase_batch`. No parser de mídia já usamos `tool_choice: required` — texto deveria fazer o mesmo.

2. **Filtro silencioso muito agressivo** (linha 230): `i.quantidade > 0 && i.valor_total > 0` descarta itens sem dizer por quê. Se o modelo chamou a tool mas mandou um campo errado (ex: `valor_unitario` em vez de `valor_total`), o array fica vazio e cai em "não identificado".

3. **Falta de log de diagnóstico**: hoje só logamos quando o parse dá certo. Quando falha, não dá pra saber se foi a IA que não chamou tool, se foi filtro, ou erro de JSON.

4. **Mensagem de erro pouco útil**: o usuário não sabe se o problema é o formato, a IA, ou bug. Hoje só recebe a lista de exemplos.

## Mudanças

### 1. `supabase/functions/webhook-zapi-purchase/index.ts`

**Em `parseTextWithAI`:**
- Trocar `tool_choice: "auto"` → `tool_choice: { type: "function", function: { name: "register_purchase_batch" } }` (forçar chamada da tool, igual ao parser de mídia).
- Adicionar logs:
  - `console.log("AI text raw response:", JSON.stringify(data.choices?.[0]?.message))` quando não vier `tool_calls`.
  - `console.log("AI text parsed args:", raw)` antes do filtro.
  - `console.warn("Item descartado pelo filtro:", i)` para cada item filtrado.
- Aceitar `valor_unitario` como fallback: se `valor_total` ausente mas `valor_unitario` e `quantidade` > 0 → calcular total.
- Reforçar prompt do sistema com exemplo: `"20kg cebola 8000 reais"` → `quantidade=20, unidade=kg, valor_total=8000`. Deixar claro que valores grandes são válidos.

**Em `parseMediaWithAI`:** aplicar a mesma melhoria de fallback `valor_unitario` e logs.

**Mensagem de erro mais útil** (linha 700): incluir um motivo quando possível, ex.:
> *"❌ Não consegui identificar a compra. A IA entendeu o texto mas não achou quantidade + preço. Tente: `20kg cebola 8000 reais`."*

### 2. (Opcional) Suavizar prompt
Hoje o prompt diz *"So extraia se TODOS os itens tiverem produto + quantidade + valor"*. Deixar um pouco mais permissivo: aceitar quando der pra inferir o valor a partir de unitário × quantidade.

## Arquivos afetados

- `supabase/functions/webhook-zapi-purchase/index.ts` (mudanças nas funções `parseTextWithAI`, `parseMediaWithAI` e na resposta de erro do handler)

## Fora do escopo

- Não vou mexer em banco — schema e RLS já estão OK.
- Não vou mexer no fluxo de confirmação em lote (já funciona).

## Resultado esperado

Depois disso, mensagens como `20kg cebola 8000 reais`, `bife 10kg 8000 reais` e `oleo 24 unidades a 9000 reais` devem ser parseadas corretamente. Quando ainda assim falhar, os logs vão mostrar exatamente o que o Gemini respondeu para podermos ajustar o prompt.
