
Diagnóstico direto do problema (por que está errando):
1) O parser de IA está extraindo “Feijão” corretamente (isso aparece nos logs), então o erro principal não está na extração.
2) O erro está no match do produto no backend: a função de similaridade considera correspondência quando qualquer palavra do produto contém 1 letra (ex.: “e”), porque usa `w.includes(wb)`.
3) Exemplo real: “feijao”.includes(“e”) = true. Então itens não relacionados que tenham “e” no nome (como “Coxa e sobrecoxa”) podem ganhar score alto e serem escolhidos.
4) Além disso, no cadastro existem “Feijão carioca” e “Feijão preto”, mas não “Feijão” exato. Ou seja: entrada genérica deveria virar ambiguidade (escolha), não escolha automática.

Se aprovado, plano de correção:
1) Corrigir o algoritmo de similaridade (arquivo `supabase/functions/webhook-zapi-purchase/index.ts`)
- Remover lógica que dá match por token de 1 caractere.
- Tokenizar e normalizar os dois lados (minúsculo, sem acento, espaços limpos).
- Ignorar stopwords curtas comuns (`e`, `de`, `da`, `do`, etc.).
- Aplicar tiers determinísticos: exato > começa com > contém > sobreposição de tokens.
- Definir limite mínimo de confiança para aceitar match automático.

2) Tratar ambiguidade explicitamente (não registrar automático)
- Se houver 2+ candidatos próximos (ex.: “Feijão carioca” e “Feijão preto”), enviar lista numerada no WhatsApp para usuário escolher o produto.
- Só após a escolha do produto seguir para a confirmação “Sim/Não”.

3) Ajustar fluxo de estados da conversa
```text
mensagem completa -> extração IA -> (a) produto único/confiante -> confirmação Sim/Não
                                  -> (b) ambíguo -> escolha do produto -> confirmação Sim/Não
-> escolha fornecedor -> registro final
```

4) Ajustes de dados (migração)
- Atualizar tabela de pendências para suportar etapa “awaiting_product_choice” e guardar opções de produto temporárias.
- Manter expiração atual (5 min) para não deixar sessão pendente indefinidamente.

5) Validação fim a fim
- “Feijão 10 kg 130 reais” => deve perguntar qual feijão.
- “Coxa e sobrecoxa 10 kg 130 reais” => deve identificar direto.
- “Feijão” (sem preço/quantidade) => não registra; pede dados completos.
- Confirmar que só grava no histórico após confirmação explícita.

Detalhes técnicos (resumo):
- Causa-raiz: falso positivo no `similarity()` por comparação reversa com token curto (`w.includes(wb)`).
- Efeito: score artificialmente alto para produtos com conectivos no nome.
- Correção técnica: scoring por tokens relevantes + detecção de ambiguidade antes da confirmação.
