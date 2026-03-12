

## Problema

O prompt da IA (linha 79-81) é muito rígido: exige que produto, quantidade e valor estejam **explicitamente** na mensagem. Isso faz a IA rejeitar mensagens naturais como:
- "comprei feijão 30kg a 2,50 o kg" (valor por unidade, não total)
- "paguei 150 em 5 fardos de cerveja" (ordem diferente)
- "óleo de soja, 3 cxs, R$89,90 no atacadão" (abreviações)

## Solução

### 1. Reescrever o system prompt da IA (linhas 79-81)
Tornar o prompt mais flexível e contextual:
- Aceitar valor total OU valor unitário (e calcular o total)
- Entender abreviações comuns (cx = caixa, fd = fardo, pct = pacote, un = unidade, lt = litro)
- Aceitar ordens variadas na frase
- Interpretar contexto (ex: "a 2,50 o kg" = preço unitário)
- Adicionar campo `valor_unitario` opcional na tool call para quando o usuário informa preço por unidade

### 2. Atualizar os parâmetros da tool call (linhas 86-105)
- Adicionar `valor_unitario` como campo opcional
- Tornar `valor_total` opcional (quando o usuário informa só o unitário)
- A IA pode preencher um ou outro (ou ambos)

### 3. Ajustar a lógica pós-parsing (linhas 440-446)
- Se `valor_unitario` veio mas `valor_total` não: calcular `total = unitario * quantidade`
- Se `valor_total` veio: usar como está
- Manter validação de quantidade > 0

### Arquivo a editar
- `supabase/functions/webhook-zapi-purchase/index.ts`: prompt da IA, parâmetros da tool, e lógica de validação pós-parse.

