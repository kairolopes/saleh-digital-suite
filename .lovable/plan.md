

## Problema

Quando o fornecedor já foi identificado pela IA (ex: "tatico t9"), a confirmação final mostra "Sim/Não", mas o usuário quer que o fornecedor também seja explicitamente confirmado antes do registro. Além disso, trocar "Sim/Não" por "1/2" em todas as confirmações.

## Solução

### 1. Trocar "Sim/Não" por "1/2" em todas as mensagens de confirmação

Locais a alterar no arquivo `supabase/functions/webhook-zapi-purchase/index.ts`:

- **Linha 291, 402, 550**: Trocar `✅ Responda *Sim* para confirmar ou *Não* para cancelar.` por `✅ *1* - Confirmar | *2* - Cancelar`
- **Linha 335**: Mensagem de "responda Sim ou Não" → `Responda *1* para confirmar ou *2* para cancelar.`

### 2. Atualizar `handleConfirmation` para aceitar 1/2

- **Linha 302**: `answer === "sim" || answer === "s" || answer === "1"` → manter "1", adicionar que "sim"/"s" continuam funcionando (retrocompatibilidade)
- **Linha 329**: `answer === "nao" || ... || answer === "0"` → trocar "0" por "2", manter "nao"/"não"/"n" como alternativas

### 3. Forçar confirmação do fornecedor

Quando o fornecedor é identificado automaticamente pela IA (ex: `matchedSupplierId` não é null na linha 509-512), o fluxo atual pula direto para confirmação geral. A mudança:

- **Não pular a etapa de fornecedor**: mesmo quando a IA identifica o fornecedor, incluir na mensagem de confirmação o fornecedor com destaque, e o "1/2" já cobre a confirmação de tudo junto.
- Na verdade o fluxo já mostra o fornecedor na confirmação (linha 549). Com a troca para 1/2, o usuário confirma tudo (incluindo fornecedor) de uma vez. Isso já resolve — o fornecedor aparece no resumo e o usuário confirma com "1".

### Arquivo a editar
- `supabase/functions/webhook-zapi-purchase/index.ts`: ~6 pontos de troca de texto "Sim/Não" → "1/2" e ajuste no `handleConfirmation` para aceitar "2" como cancelamento.

