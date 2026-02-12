

## Integração Z-API WhatsApp para Compras por Mensagem

### Objetivo
Permitir registrar compras de insumos enviando mensagens pelo WhatsApp. O sistema interpreta a mensagem, identifica o produto por similaridade e registra a compra automaticamente.

### Fluxo de Funcionamento

```text
Usuario envia WhatsApp          Z-API Webhook              Edge Function
"Comprei 10kg arroz R$60"  -->  POST /webhook-zapi  -->  1. Parseia mensagem (IA)
                                                         2. Busca produto similar
                                                         3. Insere purchase_history
                                                         4. Responde via Z-API
                            <-- "Compra registrada:      <--
                                 Arroz 10kg R$60
                                 Preco unit: R$6/kg"
```

### Exemplos de Mensagens Aceitas
- "comprei 10kg de arroz por R$60"
- "5kg frango 45 reais"
- "alho 2kg 30"
- "20 litros leite integral 120 reais fornecedor tatico"

### Parte 1: Armazenar Secrets da Z-API

Salvar 3 secrets no projeto:
- `ZAPI_INSTANCE_ID` = 3EDDC00C4442415A1099DEFCC216B74C
- `ZAPI_TOKEN` = 6909F71A3D29D570F0A8C65C
- `ZAPI_CLIENT_TOKEN` = Ff94d05bcd8b546afb957fc52d8e33ebaS

### Parte 2: Edge Function `webhook-zapi-purchase`

Uma nova edge function que:

1. **Recebe o webhook da Z-API** (POST com dados da mensagem recebida)
2. **Filtra**: ignora mensagens de grupo, status replies, e mensagens enviadas por voce (fromMe)
3. **Usa IA (Lovable AI - gemini-2.5-flash)** para extrair da mensagem:
   - Nome do produto
   - Quantidade
   - Unidade (kg, un, L)
   - Valor total
   - Fornecedor (se mencionado)
4. **Busca por similaridade**: carrega todos os produtos do banco e faz matching pelo nome mais similar (comparacao case-insensitive, parcial, removendo acentos)
5. **Insere em `purchase_history`**: o trigger existente `update_stock_after_purchase` atualiza automaticamente o estoque
6. **Responde via Z-API**: envia mensagem de confirmacao ou erro de volta pelo WhatsApp

### Parte 3: Configurar Webhook na Z-API

Apos o deploy da edge function, configurar a URL do webhook de mensagens recebidas na Z-API:

```text
PUT https://api.z-api.io/instances/{INSTANCE_ID}/token/{TOKEN}/update-webhook-received

Body: {
  "value": "https://flsuimpkucvvzsrycfmc.supabase.co/functions/v1/webhook-zapi-purchase"
}

Header: Client-Token: {CLIENT_TOKEN}
```

Isso sera feito automaticamente pela edge function na primeira execucao, ou pode ser configurado manualmente.

### Parte 4: Configuracao no `config.toml`

```toml
[functions.webhook-zapi-purchase]
verify_jwt = false
```

### Detalhes Tecnicos

**Parsing com IA**: A edge function enviara a mensagem para o modelo `google/gemini-2.5-flash` via Lovable AI pedindo para extrair dados estruturados (produto, quantidade, unidade, valor, fornecedor).

**Matching de produtos**: Apos receber o nome do produto da IA, faz busca por similaridade:
1. Normaliza (lowercase, remove acentos)
2. Busca por `ILIKE '%nome%'` no banco
3. Se nao encontrar, busca parcial (palavras-chave)
4. Se ambiguo, responde pedindo confirmacao

**Seguranca**: 
- Validacao do `Client-Token` da Z-API no header para garantir que o request vem da Z-API
- Apenas numeros autorizados podem registrar compras (configuravel)

**Resposta WhatsApp**: Usa o endpoint `send-text` da Z-API para enviar confirmacao:
```text
POST https://api.z-api.io/instances/{ID}/token/{TOKEN}/send-text
Header: Client-Token: {CLIENT_TOKEN}
Body: { "phone": "55...", "message": "Compra registrada!..." }
```

### Arquivos a Criar/Modificar
1. **Criar**: `supabase/functions/webhook-zapi-purchase/index.ts`
2. **Modificar**: `supabase/config.toml` (adicionar verify_jwt = false)
3. **Secrets**: Adicionar ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN

