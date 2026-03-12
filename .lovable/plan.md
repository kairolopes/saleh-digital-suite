

## Problema

A IA (Gemini) está sendo forçada a chamar `register_purchase` via `tool_choice: { type: "function", function: { name: "register_purchase" } }`, mesmo quando a mensagem contém apenas "arroz" sem quantidade nem valor. A IA inventa valores (quantidade: 1, valor: 0.00) para satisfazer os campos `required`.

## Solução

Duas camadas de proteção:

### 1. Mudar `tool_choice` de forçado para automático
Trocar `tool_choice: { type: "function", function: { name: "register_purchase" } }` por `tool_choice: "auto"`. Isso permite que a IA decida **não** chamar a função quando os dados estão incompletos.

### 2. Atualizar o prompt do sistema
Instruir explicitamente a IA a **não** chamar a função se faltar quantidade ou valor total. Algo como: "Só chame register_purchase se a mensagem contiver explicitamente produto, quantidade E valor. Se faltar algum dado, NÃO chame a função."

### 3. Validação pós-parse no código
Após receber o resultado da IA, validar que `quantidade > 0` e `valor_total > 0` antes de prosseguir. Se inválido, pedir ao usuário que envie a mensagem completa com exemplo.

### Arquivo a editar
- `supabase/functions/webhook-zapi-purchase/index.ts`: prompt do sistema, `tool_choice`, e validação após `parseWithAI`.

