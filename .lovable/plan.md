## Alteração

Renomear o produto ativo `Arroz cristal` (id `eae798a2…`, 7,000 kg em estoque) para **`Arroz Califórnia`**.

- Mantém o mesmo `id`, então todas as fichas técnicas, compras, movimentações de estoque e histórico de preços continuam apontando para o mesmo produto — só muda o nome exibido.
- Não mexe em `Arroz` (inativo) nem em `Arroz arbóreo`.
- Não cria produto novo, não mescla nada.

## SQL

```sql
UPDATE products
SET name = 'Arroz Califórnia'
WHERE id = 'eae798a2-def5-42ee-a464-5bf185189b84';
```

Confirma que é só renomear esse mesmo produto (sem criar um novo SKU separado)?
