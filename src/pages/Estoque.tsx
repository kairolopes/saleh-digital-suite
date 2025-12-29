import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Package, AlertTriangle, TrendingUp, Search, RefreshCw, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { z } from 'zod';

const productSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').max(100),
  unit: z.string().min(1, 'Selecione uma unidade'),
  min_quantity: z.number().min(0, 'Quantidade mínima deve ser positiva'),
});

const units = [
  { value: 'kg', label: 'Quilograma (kg)' },
  { value: 'g', label: 'Grama (g)' },
  { value: 'l', label: 'Litro (l)' },
  { value: 'ml', label: 'Mililitro (ml)' },
  { value: 'un', label: 'Unidade (un)' },
];

type Product = {
  id: string;
  name: string;
  unit: string;
  current_quantity: number | null;
  average_price: number | null;
  last_price: number | null;
  min_quantity: number | null;
  is_active: boolean;
};

export default function Estoque() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAdjustDialogOpen, setIsAdjustDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    unit: 'kg',
    min_quantity: 0,
  });
  const [adjustData, setAdjustData] = useState({
    newQuantity: 0,
    reason: '',
  });

  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as Product[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('products').insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Produto criado com sucesso!' });
      resetForm();
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar produto', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase.from('products').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Produto atualizado com sucesso!' });
      resetForm();
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar produto', description: error.message, variant: 'destructive' });
    },
  });

  const adjustStockMutation = useMutation({
    mutationFn: async ({ productId, newQuantity, oldQuantity, reason }: { 
      productId: string; 
      newQuantity: number; 
      oldQuantity: number;
      reason: string;
    }) => {
      const difference = newQuantity - oldQuantity;
      const movementType = difference > 0 ? 'ajuste_entrada' : 'ajuste_saida';
      
      // Update product quantity
      const { error: updateError } = await supabase
        .from('products')
        .update({ current_quantity: newQuantity })
        .eq('id', productId);
      if (updateError) throw updateError;

      // Register stock movement for reporting
      const { error: movementError } = await supabase
        .from('stock_movements')
        .insert({
          product_id: productId,
          movement_type: movementType,
          quantity: Math.abs(difference),
          reference_type: 'ajuste_manual',
          notes: reason || 'Ajuste manual de estoque',
        });
      if (movementError) throw movementError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Estoque ajustado com sucesso!' });
      resetAdjustForm();
    },
    onError: (error) => {
      toast({ title: 'Erro ao ajustar estoque', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // First check if product is used in recipe_items
      const { data: recipeItems } = await supabase
        .from('recipe_items')
        .select('id')
        .eq('product_id', id)
        .limit(1);
      
      if (recipeItems && recipeItems.length > 0) {
        // Deactivate instead of delete
        const { error } = await supabase
          .from('products')
          .update({ is_active: false })
          .eq('id', id);
        if (error) throw error;
        return { deactivated: true };
      }

      // Try to delete
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) {
        if (error.code === '23503') {
          // Foreign key constraint - deactivate instead
          const { error: updateError } = await supabase
            .from('products')
            .update({ is_active: false })
            .eq('id', id);
          if (updateError) throw updateError;
          return { deactivated: true };
        }
        throw error;
      }
      return { deactivated: false };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      if (result?.deactivated) {
        toast({ 
          title: 'Produto desativado', 
          description: 'O produto está vinculado a receitas e foi desativado.' 
        });
      } else {
        toast({ title: 'Produto excluído com sucesso!' });
      }
    },
    onError: (error) => {
      toast({ title: 'Erro ao excluir produto', description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFormData({ name: '', unit: 'kg', min_quantity: 0 });
    setEditingProduct(null);
    setIsDialogOpen(false);
  };

  const resetAdjustForm = () => {
    setAdjustData({ newQuantity: 0, reason: '' });
    setAdjustingProduct(null);
    setIsAdjustDialogOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = productSchema.safeParse(formData);
    if (!validation.success) {
      toast({ title: 'Erro de validação', description: validation.error.errors[0].message, variant: 'destructive' });
      return;
    }
    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      unit: product.unit,
      min_quantity: product.min_quantity ?? 0,
    });
    setIsDialogOpen(true);
  };

  const handleAdjustStock = (product: Product) => {
    setAdjustingProduct(product);
    setAdjustData({
      newQuantity: product.current_quantity ?? 0,
      reason: '',
    });
    setIsAdjustDialogOpen(true);
  };

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingProduct) return;
    
    if (!adjustData.reason.trim()) {
      toast({ title: 'Informe o motivo do ajuste', variant: 'destructive' });
      return;
    }

    adjustStockMutation.mutate({
      productId: adjustingProduct.id,
      newQuantity: adjustData.newQuantity,
      oldQuantity: adjustingProduct.current_quantity ?? 0,
      reason: adjustData.reason,
    });
  };

  const filteredProducts = products?.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const lowStockProducts = products?.filter(p => (p.current_quantity ?? 0) <= (p.min_quantity ?? 0)) || [];
  const totalValue = products?.reduce((sum, p) => sum + ((p.current_quantity ?? 0) * (p.average_price ?? 0)), 0) || 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <AppLayout requiredRoles={['admin', 'estoque']}>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Estoque</h1>
            <p className="text-muted-foreground">Gerencie seus insumos e produtos</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary hover:opacity-90">
                <Plus className="h-4 w-4 mr-2" /> Novo Produto
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingProduct ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
                <DialogDescription>
                  {editingProduct ? 'Atualize as informações do produto' : 'Adicione um novo insumo ao estoque'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do produto</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
                    placeholder="Ex: Tomate"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit">Unidade de medida</Label>
                  <Select value={formData.unit} onValueChange={(v) => setFormData(f => ({ ...f, unit: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map(u => (
                        <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="min_quantity">Estoque mínimo</Label>
                  <Input
                    id="min_quantity"
                    type="number"
                    step="0.001"
                    min="0"
                    value={formData.min_quantity}
                    onChange={(e) => setFormData(f => ({ ...f, min_quantity: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {editingProduct ? 'Salvar' : 'Criar'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Adjust Stock Dialog */}
        <Dialog open={isAdjustDialogOpen} onOpenChange={(open) => { setIsAdjustDialogOpen(open); if (!open) resetAdjustForm(); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ajustar Estoque</DialogTitle>
              <DialogDescription>
                Corrigir quantidade de {adjustingProduct?.name}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAdjustSubmit} className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Quantidade atual:</p>
                <p className="text-lg font-semibold">
                  {(adjustingProduct?.current_quantity ?? 0).toFixed(3)} {adjustingProduct?.unit}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="newQuantity">Nova quantidade</Label>
                <Input
                  id="newQuantity"
                  type="number"
                  step="0.001"
                  min="0"
                  value={adjustData.newQuantity}
                  onChange={(e) => setAdjustData(d => ({ ...d, newQuantity: parseFloat(e.target.value) || 0 }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">Motivo do ajuste *</Label>
                <Textarea
                  id="reason"
                  value={adjustData.reason}
                  onChange={(e) => setAdjustData(d => ({ ...d, reason: e.target.value }))}
                  placeholder="Ex: Contagem física, produto vencido, erro de lançamento..."
                  required
                />
              </div>
              {adjustingProduct && adjustData.newQuantity !== (adjustingProduct.current_quantity ?? 0) && (
                <div className={`p-3 rounded-lg ${adjustData.newQuantity > (adjustingProduct.current_quantity ?? 0) ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                  <p className="text-sm font-medium">
                    Diferença: {adjustData.newQuantity > (adjustingProduct.current_quantity ?? 0) ? '+' : ''}
                    {(adjustData.newQuantity - (adjustingProduct.current_quantity ?? 0)).toFixed(3)} {adjustingProduct.unit}
                  </p>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={resetAdjustForm}>Cancelar</Button>
                <Button type="submit" disabled={adjustStockMutation.isPending}>
                  Confirmar Ajuste
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total de Produtos</CardTitle>
              <Package className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{products?.length || 0}</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Valor em Estoque</CardTitle>
              <TrendingUp className="h-5 w-5 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Estoque Baixo</CardTitle>
              <AlertTriangle className="h-5 w-5 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{lowStockProducts.length}</div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-md">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle>Produtos em Estoque</CardTitle>
                <CardDescription>Lista de todos os insumos cadastrados</CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar produto..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Carregando...</p>
            ) : filteredProducts?.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                {searchTerm ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado. Clique em "Novo Produto" para começar.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Quantidade</TableHead>
                      <TableHead>Preço Médio</TableHead>
                      <TableHead>Último Preço</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts?.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>
                          {(product.current_quantity ?? 0).toFixed(3)} {product.unit}
                        </TableCell>
                        <TableCell>{formatCurrency(product.average_price ?? 0)}/{product.unit}</TableCell>
                        <TableCell>{formatCurrency(product.last_price ?? 0)}/{product.unit}</TableCell>
                        <TableCell>
                          {(product.current_quantity ?? 0) <= (product.min_quantity ?? 0) ? (
                            <Badge variant="destructive">Baixo</Badge>
                          ) : (
                            <Badge className="bg-success">OK</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleAdjustStock(product)}
                              title="Ajustar estoque"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleEdit(product)}
                              title="Editar produto"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  title="Excluir produto"
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tem certeza que deseja excluir "{product.name}"? 
                                    Se estiver vinculado a receitas, será desativado em vez de excluído.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction 
                                    onClick={() => deleteMutation.mutate(product.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Excluir
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
