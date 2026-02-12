

## Configurar Webhook na Z-API

### O que sera feito
Chamar a API da Z-API para registrar a URL do webhook de mensagens recebidas, apontando para a edge function `webhook-zapi-purchase` ja deployada.

### Chamada a ser feita

```text
PUT https://api.z-api.io/instances/3EDDC00C4442415A1099DEFCC216B74C/token/6909F71A3D29D570F0A8C65C/update-webhook-received

Headers:
  Client-Token: Ff94d05bcd8b546afb957fc52d8e33ebaS
  Content-Type: application/json

Body:
  { "value": "https://flsuimpkucvvzsrycfmc.supabase.co/functions/v1/webhook-zapi-purchase" }
```

### Resultado esperado
Apos essa configuracao, toda mensagem recebida no WhatsApp conectado a essa instancia Z-API sera encaminhada automaticamente para a edge function, que processara a compra e respondera com a confirmacao.

### Detalhes tecnicos
- A chamada sera feita usando `lov-fetch-website` ou diretamente via edge function auxiliar
- Nao requer alteracoes de codigo -- apenas uma chamada HTTP unica para a API da Z-API
- A edge function `webhook-zapi-purchase` ja esta deployada e testada com `verify_jwt = false`

