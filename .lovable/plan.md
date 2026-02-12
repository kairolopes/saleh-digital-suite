

## Melhorar Seleção de Fornecedor nas Compras via WhatsApp

### Problema Atual
A edge function já suporta fornecedor na mensagem (ex: "5kg frango 45 tatico"), mas o matching é frágil e se o fornecedor não for mencionado, fica sem.

### Solução
Melhorar o fluxo para:

1. **Se o fornecedor for mencionado e encontrado**: registra normalmente com confirmação
2. **Se o fornecedor for mencionado mas não encontrado**: avisa que não achou e pede para corrigir
3. **Se o fornecedor não for mencionado**: após parsear a compra, envia a lista de fornecedores cadastrados e pede para o usuário responder com o número correspondente (ou "0" para nenhum)

### Fluxo com Seleção de Fornecedor

```text
Usuario: "5kg frango 45 reais"
Bot:     "Encontrei: Filé de peito frango, 5kg, R$45
          Escolha o fornecedor:
          1 - Tatico T9
          0 - Nenhum
          Responda com o número."

Usuario: "1"
Bot:     "Compra registrada! Filé de peito frango 5kg R$45 - Fornecedor: Tatico T9"
```

### Detalhes Tecnicos

**Estado temporário**: Armazenar a compra pendente numa tabela auxiliar `pending_whatsapp_purchases` para aguardar a resposta do fornecedor.

Nova tabela:
- `id` (uuid, PK)
- `phone` (text) - número do WhatsApp
- `product_id` (uuid)
- `quantity` (decimal)
- `total_price` (decimal)
- `unit` (text)
- `message_original` (text)
- `created_at` (timestamptz, default now())
- `expires_at` (timestamptz, default now() + 5 min)

**Fluxo na edge function**:
1. Recebe mensagem
2. Verifica se há compra pendente para aquele telefone
   - Se sim: interpreta a resposta como seleção de fornecedor (número)
   - Se não: parseia a mensagem normalmente com IA
3. Se parsear com sucesso e fornecedor não estiver na mensagem:
   - Salva em `pending_whatsapp_purchases`
   - Envia lista de fornecedores
4. Se fornecedor estiver na mensagem e for encontrado:
   - Registra direto sem pendência
5. Resposta do usuário com número:
   - Busca pendência, associa fornecedor, insere em `purchase_history`, apaga pendência

**Limpeza**: Compras pendentes expiram após 5 minutos. Um check simples no código ignora pendências expiradas.

### Arquivos a Criar/Modificar
1. **Criar tabela**: `pending_whatsapp_purchases` (via migração)
2. **Modificar**: `supabase/functions/webhook-zapi-purchase/index.ts` - adicionar lógica de estado para seleção de fornecedor

