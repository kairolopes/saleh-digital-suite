# Corrigir produtos "duplicados" no Histórico de Preços e limpar dados de teste

## Diagnóstico

No vídeo, o seletor de produto do Histórico de Preços mostra opções repetidas: "Cream Cheese (kg)" 2x, "Leite (l)" 2x e "Leite Azul (un)" 3x.

Consulta ao banco confirmou que **não são duplicatas** — são variações de marca (recurso implementado recentemente):

| Nome | Marca | Unid. |
|------|-------|-------|
| Cream Cheese | Polengui | kg |
| Cream Cheese | Scala | kg |
| Leite | Piracanjuba | l |
| Leite | Italac | l |
| Leite azul | gfgf | un |
| Leite Azul | fdf | un |
| Leite Azul | fdfdf | un |

O problema tem duas partes:

1. **Interface**: o seletor mostra apenas "Nome (unid.)" e omite a marca, então marcas diferentes parecem registros duplicados. O mesmo acontece em outras telas (Compras).
2. **Dados de teste**: os 3 produtos "Leite Azul" têm marcas sem sentido (`gfgf`, `fdf`, `fdfdf`) — claramente criados durante testes do recurso de marca.

## O que será feito

### 1. Exibir a marca nos seletores de produto
- `src/pages/HistoricoPrecos.tsx`: mostrar "Leite — Piracanjuba (l)" / "Leite — Italac (l)" no seletor. Itens sem marca mostram "Leite (l)".
- `src/pages/Compras.tsx`: mesma padronização no seletor de produto do formulário de compra.

### 2. Limpar produtos de teste
- Desativar (nunca excluir, seguindo a regra do projeto) os 3 produtos "Leite Azul" com marcas `gfgf`, `fdf` e `fdfdf` (`is_active = false`), removendo-os dos seletores.

### 3. Diferenciar maiúsculas/minúsculas (opcional, incluído)
- Normalizar o nome dos dois "Leite azul"/"Leite Azul" ao desativá-los não é necessário, pois serão desativados.

## Detalhes técnicos

- Alteração apenas de apresentação nos seletores: rótulo vira `` `${name}${brand ? ` — ${brand}` : ""} (${unit})` ``.
- SQL: `UPDATE public.products SET is_active = false WHERE id IN (<3 ids do Leite Azul de teste>)` — buscar os ids exatos por `name ILIKE 'leite azul' AND brand IN ('gfgf','fdf','fdfdf')`.
- Nenhuma mudança em regras de negócio, compras ou WhatsApp.
