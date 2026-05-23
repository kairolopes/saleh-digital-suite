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
import { Plus, Pencil, Package, AlertTriangle, TrendingUp, Search, RefreshCw, Trash2, Tag, FolderOpen, ArrowRightLeft, Eye, EyeOff } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { z } from 'zod';

const productSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').max(100),
  brand: z.string().max(60).optional().nullable(),
  unit: z.string().min(1, 'Selecione uma unidade'),
  min_quantity: z.number().min(0, 'Quantidade mínima deve ser positiva'),
  category_id: z.string().nullable().optional(),
});

const normalizeName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const units = [
  { value: 'kg', label: 'Quilograma (kg)' },
  { value: 'g', label: 'Grama (g)' },
  { value: 'l', label: 'Litro (l)' },
  { value: 'ml', label: 'Mililitro (ml)' },
  { value: 'un', label: 'Unidade (un)' },
];

type ProductCategory = {
  id: string;
  name: string;
  color: string;
  display_order: number;
};

type Product = {
  id: string;
  name: string;
  unit: string;
  current_quantity: number | null;
  average_price: number | null;
  last_price: number | null;
  min_quantity: number | null;
  is_active: boolean;
  is_visible_in_recipes: boolean;
  category_id: string | null;
};

export default function Estoque() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAdjustDialogOpen, setIsAdjustDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'visible' | 'hidden'>('all');

  const [formData, setFormData] = useState({
    name: '',
    unit: 'kg',
    min_quantity: 0,
    category_id: null as string | null,
  });
  const [categoryFormData, setCategoryFormData] = useState({ name: '', color: '#6b7280' });
  const [transferData, setTransferData] = useState({ fromCategory: '', toCategory: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  const [adjustData, setAdjustData] = useState({
    newQuantity: 0,
    reason: '',
  });
  const [activeTab, setActiveTab] = useState('produtos');

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ['product-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_categories')
        .select('*')
        .order('display_order');
      if (error) throw error;
      return data as ProductCategory[];
    },
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

  // Category mutations
  const createCategoryMutation = useMutation({
    mutationFn: async (data: { name: string; color: string }) => {
      const maxOrder = categories?.reduce((max, c) => Math.max(max, c.display_order), 0) || 0;
      const { error } = await supabase.from('product_categories').insert([{ ...data, display_order: maxOrder + 1 }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-categories'] });
      toast({ title: 'Categoria criada com sucesso!' });
      resetCategoryForm();
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao criar categoria', description: error.message?.includes('unique') ? 'Já existe uma categoria com esse nome' : error.message, variant: 'destructive' });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name: string; color: string } }) => {
      const { error } = await supabase.from('product_categories').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-categories'] });
      toast({ title: 'Categoria atualizada!' });
      resetCategoryForm();
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao atualizar categoria', description: error.message, variant: 'destructive' });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      // Set products in this category to null first
      const { error: updateError } = await supabase.from('products').update({ category_id: null }).eq('category_id', id);
      if (updateError) throw updateError;
      const { error } = await supabase.from('product_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-categories'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Categoria excluída!' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao excluir categoria', description: error.message, variant: 'destructive' });
    },
  });

  const transferCategoryMutation = useMutation({
    mutationFn: async ({ fromId, toId }: { fromId: string; toId: string }) => {
      const { error } = await supabase.from('products').update({ category_id: toId }).eq('category_id', fromId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Produtos transferidos com sucesso!' });
      setIsTransferDialogOpen(false);
      setTransferData({ fromCategory: '', toCategory: '' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao transferir', description: error.message, variant: 'destructive' });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('products').insert([{
        name: data.name,
        unit: data.unit,
        min_quantity: data.min_quantity,
        category_id: data.category_id || null,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Produto criado com sucesso!' });
      resetForm();
    },
    onError: (error: any) => {
      console.error('Erro ao criar produto:', error);
      const msg = error?.message || '';
      const isRls = error?.code === '42501' || /row-level security/i.test(msg);
      const isDup = error?.code === '23505' || /duplicate key/i.test(msg);
      toast({
        title: 'Erro ao criar produto',
        description: isRls
          ? 'Você não tem permissão para cadastrar produtos. Faça login com uma conta admin ou estoque.'
          : isDup
          ? 'Já existe um produto com esse nome.'
          : msg || 'Erro desconhecido. Veja o console para detalhes.',
        variant: 'destructive',
        duration: 8000,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase.from('products').update({
        name: data.name,
        unit: data.unit,
        min_quantity: data.min_quantity,
        category_id: data.category_id || null,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Produto atualizado com sucesso!' });
      resetForm();
    },
    onError: (error: any) => {
      console.error('Erro ao atualizar produto:', error);
      const msg = error?.message || '';
      const isRls = error?.code === '42501' || /row-level security/i.test(msg);
      toast({
        title: 'Erro ao atualizar produto',
        description: isRls
          ? 'Você não tem permissão para editar produtos. Faça login com uma conta admin ou estoque.'
          : msg || 'Erro desconhecido. Veja o console para detalhes.',
        variant: 'destructive',
        duration: 8000,
      });
    },
  });

  const adjustStockMutation = useMutation({
    mutationFn: async ({ productId, newQuantity, oldQuantity, reason }: { 
      productId: string; newQuantity: number; oldQuantity: number; reason: string;
    }) => {
      const difference = newQuantity - oldQuantity;
      const movementType = difference > 0 ? 'ajuste_entrada' : 'ajuste_saida';
      const { error: updateError } = await supabase.from('products').update({ current_quantity: newQuantity }).eq('id', productId);
      if (updateError) throw updateError;
      const { error: movementError } = await supabase.from('stock_movements').insert({
        product_id: productId, movement_type: movementType, quantity: Math.abs(difference),
        reference_type: 'ajuste_manual', notes: reason || 'Ajuste manual de estoque',
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
      const { data: recipeItems } = await supabase.from('recipe_items').select('id').eq('product_id', id).limit(1);
      if (recipeItems && recipeItems.length > 0) {
        const { error } = await supabase.from('products').update({ is_active: false }).eq('id', id);
        if (error) throw error;
        return { deactivated: true };
      }
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) {
        if (error.code === '23503') {
          const { error: updateError } = await supabase.from('products').update({ is_active: false }).eq('id', id);
          if (updateError) throw updateError;
          return { deactivated: true };
        }
        throw error;
      }
      return { deactivated: false };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: result?.deactivated ? 'Produto desativado' : 'Produto excluído com sucesso!',
        description: result?.deactivated ? 'O produto está vinculado a receitas e foi desativado.' : undefined });
    },
    onError: (error) => {
      toast({ title: 'Erro ao excluir produto', description: error.message, variant: 'destructive' });
    },
  });
  const toggleVisibilityMutation = useMutation({
    mutationFn: async ({ id, visible }: { id: string; visible: boolean }) => {
      const { error } = await supabase.from('products').update({ is_visible_in_recipes: visible }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: vars.visible ? 'Produto liberado para fichas técnicas' : 'Produto oculto das fichas técnicas' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao alterar visibilidade', description: error.message, variant: 'destructive' });
    },
  });


  const resetForm = () => {
    setFormData({ name: '', unit: 'kg', min_quantity: 0, category_id: null });
    setEditingProduct(null);
    setIsDialogOpen(false);
  };

  const resetAdjustForm = () => {
    setAdjustData({ newQuantity: 0, reason: '' });
    setAdjustingProduct(null);
    setIsAdjustDialogOpen(false);
  };

  const resetCategoryForm = () => {
    setCategoryFormData({ name: '', color: '#6b7280' });
    setEditingCategory(null);
    setIsCategoryDialogOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Tentando salvar produto:', formData);
    const validation = productSchema.safeParse(formData);
    if (!validation.success) {
      console.warn('Validação falhou:', validation.error.errors);
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
      category_id: product.category_id,
    });
    setIsDialogOpen(true);
  };

  const handleAdjustStock = (product: Product) => {
    setAdjustingProduct(product);
    setAdjustData({ newQuantity: product.current_quantity ?? 0, reason: '' });
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

  const handleCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryFormData.name.trim()) {
      toast({ title: 'Nome da categoria é obrigatório', variant: 'destructive' });
      return;
    }
    if (editingCategory) {
      updateCategoryMutation.mutate({ id: editingCategory.id, data: categoryFormData });
    } else {
      createCategoryMutation.mutate(categoryFormData);
    }
  };

  const handleEditCategory = (cat: ProductCategory) => {
    setEditingCategory(cat);
    setCategoryFormData({ name: cat.name, color: cat.color });
    setIsCategoryDialogOpen(true);
  };

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return null;
    return categories?.find(c => c.id === categoryId);
  };

  const getCategoryProductCount = (categoryId: string) => {
    return products?.filter(p => p.category_id === categoryId).length || 0;
  };

  const filteredProducts = products?.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategoryFilter === 'all' 
      ? true 
      : selectedCategoryFilter === 'uncategorized' 
        ? !p.category_id 
        : p.category_id === selectedCategoryFilter;
    const matchesVisibility = visibilityFilter === 'all'
      ? true
      : visibilityFilter === 'visible'
        ? p.is_visible_in_recipes !== false
        : p.is_visible_in_recipes === false;
    return matchesSearch && matchesCategory && matchesVisibility;
  });

  const totalPages = Math.ceil((filteredProducts?.length || 0) / itemsPerPage);
  const paginatedProducts = filteredProducts?.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const lowStockProducts = products?.filter(p => (p.current_quantity ?? 0) <= (p.min_quantity ?? 0)) || [];
  const totalValue = products?.reduce((sum, p) => sum + ((p.current_quantity ?? 0) * (p.average_price ?? 0)), 0) || 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const colorOptions = [
    { value: '#ef4444', label: 'Vermelho' },
    { value: '#f97316', label: 'Laranja' },
    { value: '#f59e0b', label: 'Amarelo' },
    { value: '#22c55e', label: 'Verde' },
    { value: '#06b6d4', label: 'Ciano' },
    { value: '#3b82f6', label: 'Azul' },
    { value: '#8b5cf6', label: 'Roxo' },
    { value: '#ec4899', label: 'Rosa' },
    { value: '#a16207', label: 'Marrom' },
    { value: '#6b7280', label: 'Cinza' },
    { value: '#9ca3af', label: 'Cinza claro' },
  ];

  return (
    <AppLayout requiredRoles={['admin', 'estoque']}>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Estoque</h1>
            <p className="text-muted-foreground">Gerencie seus insumos e produtos</p>
          </div>
        </div>

        {/* Adjust Stock Dialog */}
        <Dialog open={isAdjustDialogOpen} onOpenChange={(open) => { setIsAdjustDialogOpen(open); if (!open) resetAdjustForm(); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ajustar Estoque</DialogTitle>
              <DialogDescription>Corrigir quantidade de {adjustingProduct?.name}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAdjustSubmit} className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Quantidade atual:</p>
                <p className="text-lg font-semibold">{(adjustingProduct?.current_quantity ?? 0).toFixed(3)} {adjustingProduct?.unit}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="newQuantity">Nova quantidade</Label>
                <Input id="newQuantity" type="number" step="0.001" min="0" value={adjustData.newQuantity}
                  onChange={(e) => setAdjustData(d => ({ ...d, newQuantity: parseFloat(e.target.value) || 0 }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">Motivo do ajuste *</Label>
                <Textarea id="reason" value={adjustData.reason}
                  onChange={(e) => setAdjustData(d => ({ ...d, reason: e.target.value }))}
                  placeholder="Ex: Contagem física, produto vencido, erro de lançamento..." required />
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
                <Button type="submit" disabled={adjustStockMutation.isPending}>Confirmar Ajuste</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Transfer Category Dialog */}
        <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Transferir Produtos entre Categorias</DialogTitle>
              <DialogDescription>Mova todos os produtos de uma categoria para outra</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>De (categoria origem)</Label>
                <Select value={transferData.fromCategory} onValueChange={v => setTransferData(d => ({ ...d, fromCategory: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar origem" /></SelectTrigger>
                  <SelectContent>
                    {categories?.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: c.color }} />
                          {c.name} ({getCategoryProductCount(c.id)})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Para (categoria destino)</Label>
                <Select value={transferData.toCategory} onValueChange={v => setTransferData(d => ({ ...d, toCategory: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar destino" /></SelectTrigger>
                  <SelectContent>
                    {categories?.filter(c => c.id !== transferData.fromCategory).map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: c.color }} />
                          {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setIsTransferDialogOpen(false)}>Cancelar</Button>
                <Button 
                  disabled={!transferData.fromCategory || !transferData.toCategory || transferCategoryMutation.isPending}
                  onClick={() => transferCategoryMutation.mutate({ fromId: transferData.fromCategory, toId: transferData.toCategory })}
                >
                  Transferir
                </Button>
              </div>
            </div>
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

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="produtos" className="flex items-center gap-1.5">
              <Package className="h-4 w-4" /> Produtos
            </TabsTrigger>
            <TabsTrigger value="categorias" className="flex items-center gap-1.5">
              <Tag className="h-4 w-4" /> Categorias
            </TabsTrigger>
          </TabsList>

          {/* ===== PRODUTOS TAB ===== */}
          <TabsContent value="produtos">
            <Card className="border-0 shadow-md">
              <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <CardTitle>Produtos em Estoque</CardTitle>
                    <CardDescription>Lista de todos os insumos cadastrados</CardDescription>
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
                        <DialogDescription>{editingProduct ? 'Atualize as informações do produto' : 'Adicione um novo insumo ao estoque'}</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="name">Nome do produto</Label>
                          <Input id="name" value={formData.name}
                            onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
                            placeholder="Ex: Tomate" required />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="category">Categoria</Label>
                          <Select value={formData.category_id || 'none'} onValueChange={(v) => setFormData(f => ({ ...f, category_id: v === 'none' ? null : v }))}>
                            <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem categoria</SelectItem>
                              {categories?.map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                  <span className="flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: c.color }} />
                                    {c.name}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="unit">Unidade de medida</Label>
                          <Select value={formData.unit} onValueChange={(v) => setFormData(f => ({ ...f, unit: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {units.map(u => (<SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="min_quantity">Estoque mínimo</Label>
                          <Input id="min_quantity" type="number" step="0.001" min="0" value={formData.min_quantity}
                            onChange={(e) => setFormData(f => ({ ...f, min_quantity: parseFloat(e.target.value) || 0 }))} />
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
                {/* Filter bar */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar produto..." value={searchTerm} onChange={(e) => handleSearch(e.target.value)} className="pl-9" />
                  </div>
                  <Select value={selectedCategoryFilter} onValueChange={(v) => { setSelectedCategoryFilter(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder="Filtrar categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas categorias</SelectItem>
                      <SelectItem value="uncategorized">Sem categoria</SelectItem>
                      {categories?.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: c.color }} />
                            {c.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={visibilityFilter} onValueChange={(v: 'all' | 'visible' | 'hidden') => { setVisibilityFilter(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder="Visibilidade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos (visíveis + ocultos)</SelectItem>
                      <SelectItem value="visible">Visíveis em fichas</SelectItem>
                      <SelectItem value="hidden">Ocultos das fichas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-center py-8 text-muted-foreground">Carregando...</p>
                ) : filteredProducts?.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">
                    {searchTerm || selectedCategoryFilter !== 'all' ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado. Clique em "Novo Produto" para começar.'}
                  </p>
                ) : (
                  <div className="space-y-4">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Categoria</TableHead>
                            <TableHead>Quantidade</TableHead>
                            <TableHead>Preço Médio</TableHead>
                            <TableHead>Último Preço</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedProducts?.map((product) => {
                            const cat = getCategoryName(product.category_id);
                            return (
                              <TableRow key={product.id}>
                                <TableCell className="font-medium">{product.name}</TableCell>
                                <TableCell>
                                  {cat ? (
                                    <Badge variant="outline" className="gap-1.5 font-normal" style={{ borderColor: cat.color, color: cat.color }}>
                                      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: cat.color }} />
                                      {cat.name}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                  )}
                                </TableCell>
                                <TableCell>{(product.current_quantity ?? 0).toFixed(3)} {product.unit}</TableCell>
                                <TableCell>{formatCurrency(product.average_price ?? 0)}/{product.unit}</TableCell>
                                <TableCell>{formatCurrency(product.last_price ?? 0)}/{product.unit}</TableCell>
                                <TableCell>
                                  <div className="flex flex-col gap-1">
                                    {(product.current_quantity ?? 0) <= (product.min_quantity ?? 0) ? (
                                      <Badge variant="destructive">Baixo</Badge>
                                    ) : (
                                      <Badge className="bg-success">OK</Badge>
                                    )}
                                    {product.is_visible_in_recipes === false && (
                                      <Badge variant="outline" className="gap-1 font-normal text-xs">
                                        <EyeOff className="h-3 w-3" /> Oculto
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => toggleVisibilityMutation.mutate({ id: product.id, visible: !(product.is_visible_in_recipes !== false) })}
                                      title={product.is_visible_in_recipes === false ? 'Liberar para fichas técnicas' : 'Ocultar das fichas técnicas'}
                                    >
                                      {product.is_visible_in_recipes === false ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => handleAdjustStock(product)} title="Ajustar estoque">
                                      <RefreshCw className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => handleEdit(product)} title="Editar produto">
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" title="Excluir produto" className="text-destructive hover:text-destructive">
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Tem certeza que deseja excluir "{product.name}"? Se estiver vinculado a receitas, será desativado.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => deleteMutation.mutate(product.id)}
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                            Excluir
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {totalPages > 1 && (
                      <div className="flex items-center justify-between pt-4 border-t">
                        <p className="text-sm text-muted-foreground">
                          Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filteredProducts?.length || 0)} de {filteredProducts?.length || 0} produtos
                        </p>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                            Anterior
                          </Button>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                              let page: number;
                              if (totalPages <= 5) { page = i + 1; }
                              else if (currentPage <= 3) { page = i + 1; }
                              else if (currentPage >= totalPages - 2) { page = totalPages - 4 + i; }
                              else { page = currentPage - 2 + i; }
                              return (
                                <Button key={page} variant={currentPage === page ? "default" : "outline"} size="sm" className="w-8 h-8 p-0"
                                  onClick={() => setCurrentPage(page)}>{page}</Button>
                              );
                            })}
                          </div>
                          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                            Próximo
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== CATEGORIAS TAB ===== */}
          <TabsContent value="categorias">
            <Card className="border-0 shadow-md">
              <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <CardTitle>Categorias de Produtos</CardTitle>
                    <CardDescription>Organize seus produtos por tipo</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setIsTransferDialogOpen(true)}>
                      <ArrowRightLeft className="h-4 w-4 mr-2" /> Transferir
                    </Button>
                    <Dialog open={isCategoryDialogOpen} onOpenChange={(open) => { setIsCategoryDialogOpen(open); if (!open) resetCategoryForm(); }}>
                      <DialogTrigger asChild>
                        <Button className="gradient-primary hover:opacity-90">
                          <Plus className="h-4 w-4 mr-2" /> Nova Categoria
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{editingCategory ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
                          <DialogDescription>{editingCategory ? 'Atualize a categoria' : 'Crie uma nova categoria de produto'}</DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleCategorySubmit} className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="catName">Nome</Label>
                            <Input id="catName" value={categoryFormData.name}
                              onChange={(e) => setCategoryFormData(f => ({ ...f, name: e.target.value }))}
                              placeholder="Ex: Laticínios" required />
                          </div>
                          <div className="space-y-2">
                            <Label>Cor</Label>
                            <div className="flex flex-wrap gap-2">
                              {colorOptions.map(c => (
                                <button key={c.value} type="button" title={c.label}
                                  className={`w-8 h-8 rounded-full border-2 transition-all ${categoryFormData.color === c.value ? 'border-foreground scale-110' : 'border-transparent'}`}
                                  style={{ backgroundColor: c.value }}
                                  onClick={() => setCategoryFormData(f => ({ ...f, color: c.value }))} />
                              ))}
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button type="button" variant="outline" onClick={resetCategoryForm}>Cancelar</Button>
                            <Button type="submit" disabled={createCategoryMutation.isPending || updateCategoryMutation.isPending}>
                              {editingCategory ? 'Salvar' : 'Criar'}
                            </Button>
                          </div>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!categories || categories.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">Nenhuma categoria cadastrada.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {categories.map(cat => {
                      const count = getCategoryProductCount(cat.id);
                      return (
                        <Card key={cat.id} className="border shadow-sm cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { setSelectedCategoryFilter(cat.id); setActiveTab('produtos'); setCurrentPage(1); }}>
                          <CardContent className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: cat.color }} />
                              <div>
                                <p className="font-medium">{cat.name}</p>
                                <p className="text-xs text-muted-foreground">{count} {count === 1 ? 'produto' : 'produtos'}</p>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleEditCategory(cat)} title="Editar">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" title="Excluir">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir categoria "{cat.name}"?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {count > 0 
                                        ? `${count} produto(s) ficarão sem categoria. Você pode transferi-los antes.`
                                        : 'Essa ação não pode ser desfeita.'}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteCategoryMutation.mutate(cat.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                      Excluir
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
