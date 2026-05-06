## Diagnóstico

Olhei o fluxo de cadastro de produto em `src/pages/Estoque.tsx` e o estado do banco:

- O banco tem **237 produtos (235 ativos)** — então cadastros normalmente funcionam.
- Não existe nenhum produto cujo nome contenha "salsa" no banco — o INSERT realmente não foi gravado.
- Nas requisições de rede da sessão atual, os GETs em `/products` voltam `[]` mesmo com 235 ativos no banco. Isso é sintoma clássico de **RLS bloqueando** porque o request está saindo apenas com a anon key (usuário não autenticado, ou sessão expirada).
- A política de INSERT em `products` exige `has_role(admin) OR has_role(estoque)`. Se o usuário que tentou cadastrar a "salsa" não tem nenhuma dessas roles (ou o token expirou), o insert é silenciosamente rejeitado pelo RLS — e o `onError` mostra a mensagem do Postgres, mas só por ~3s no toast.

Causa mais provável: **sessão sem role admin/estoque** (ou token expirado) → RLS rejeita o INSERT. Outras hipóteses menores: validação Zod silenciosa, ou clique sem preencher unidade.

### Pontos frágeis no código que pioram o diagnóstico

1. `handleSubmit` chama `productSchema.safeParse` mas **não valida `category_id`** corretamente quando vem `null` (Zod aceita, mas vale conferir).
2. O `onError` do `createMutation` só mostra `error.message` num toast curto. Se a mensagem for genérica ("new row violates row-level security policy"), o usuário não entende.
3. Não existe nenhum `console.error` — quando o toast some, perde-se o rastro.

## Mudanças propostas

### 1. `src/pages/Estoque.tsx` — melhorar feedback de erro do cadastro

- No `createMutation.onError` e `updateMutation.onError`:
  - Adicionar `console.error("Erro produto:", error)` para deixar rastro no console.
  - Detectar erro de RLS (`error.code === '42501'` ou mensagem contendo `row-level security`) e mostrar mensagem amigável: *"Você não tem permissão para cadastrar produtos. Faça login com uma conta admin ou estoque."*
  - Detectar erro de duplicidade/constraint e dar mensagem clara.
  - Manter o toast aberto mais tempo (`duration: 8000`) quando for erro.

- No `handleSubmit`: logar `console.log("Tentando salvar produto:", formData)` antes de chamar a mutation, para confirmar nos logs que o submit disparou.

### 2. Verificar a role do usuário que tentou cadastrar

Como parte da resposta, vou pedir para você confirmar **qual usuário tentou cadastrar a salsa** — preciso disso para checar no banco se ele tem a role `admin` ou `estoque` em `user_roles`. Se não tiver, o fix real é atribuir a role, não mexer no código.

## Fora do escopo

- Não vou mexer em RLS nem em schema. As políticas atuais estão corretas.
- Não vou mexer no fluxo do WhatsApp.

## Resultado esperado

Depois disso:
- Se o problema for permissão, o usuário vai ver claramente *"Você não tem permissão…"* em vez de uma mensagem técnica curta.
- Os logs do console vão mostrar exatamente o erro retornado pelo Supabase, facilitando diagnósticos futuros.
- Saberemos se precisamos atribuir role ao usuário ou se há outro bug.

## Pergunta antes de implementar

Qual e-mail/usuário tentou cadastrar a salsa? Assim eu confirmo no banco se ele tem role `admin` ou `estoque` antes de seguir.
