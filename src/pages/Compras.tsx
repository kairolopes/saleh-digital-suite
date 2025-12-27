import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, ShoppingCart, TrendingUp, DollarSign } from 'lucide-react';
import { z } from 'zod';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const purchaseSchema = z.object({
  product_id: z.string().min(1, 'Selecione um produto'),
  supplier_id: z.string().optional(),
  quantity: z.number().positive('Quantidade deve ser maior que zero'),
  total_price: z.number().positive('Valor deve ser maior que zero'),
  purchase_date: z.string().min(1, 'Selecione uma data'),
  notes: z.string().max(500).optional(),
});

export default function Compras() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    product_id: '',
    supplier_id: '',
    quantity: 0,
    total_price: 0,
    purchase_date: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  });

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: purchases, isLoading } = useQuery({
    queryKey: ['purchases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_history')
        .select(`
          *,
          products(name, unit),
          suppliers(name)
        `)
        .order('purchase_date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // Validar que data não é futura
      const purchaseDate = new Date(data.purchase_date);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      
      if (purchaseDate > today) {
        throw new Error('Data de compra não pode ser no futuro');
      }

      const { error } = await supabase.from('purchase_history').insert([{
        product_id: data.product_id,
        supplier_id: data.supplier_id || null,
        quantity: data.quantity,
        total_price: data.total_price,
        purchase_date: data.purchase_date,
        notes: data.notes || null,
        created_by: user?.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Compra registrada com sucesso!' });
      resetForm();
    },
    onError: (error) => {
      toast({ title: 'Erro ao registrar compra', description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFormData({
      product_id: '',
      supplier_id: '',
      quantity: 0,
      total_price: 0,
      purchase_date: format(new Date(), 'yyyy-MM-dd'),
      notes: '',
    });
    setIsDialogOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = purchaseSchema.safeParse(formData);
    if (!validation.success) {
      toast({ title: 'Erro de validação', description: validation.error.errors[0].message, variant: 'destructive' });
      return;
    }
    createMutation.mutate(formData);
  };

  const selectedProduct = products?.find(p => p.id === formData.product_id);
  const unitPrice = formData.quantity > 0 ? formData.total_price / formData.quantity : 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const totalToday = purchases?.filter(p => 
    p.purchase_date === format(new Date(), 'yyyy-MM-dd')
  ).reduce((sum, p) => sum + Number(p.total_price), 0) || 0;

  const totalMonth = purchases?.filter(p => 
    p.purchase_date?.startsWith(format(new Date(), 'yyyy-MM'))
  ).reduce((sum, p) => sum + Number(p.total_price), 0) || 0;

  return (
    <AppLayout requiredRoles={['admin', 'estoque']}>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Compras</h1>
            <p className="text-muted-foreground">Registre entradas de insumos</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary hover:opacity-90">
                <Plus className="h-4 w-4 mr-2" /> Nova Compra
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Registrar Compra</DialogTitle>
                <DialogDescription>Adicione uma nova entrada de insumo ao estoque</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Produto *</Label>
                  <Select value={formData.product_id} onValueChange={(v) => setFormData(f => ({ ...f, product_id: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o produto" />
                    </SelectTrigger>
                    <SelectContent>
                      {products?.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.unit})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Fornecedor</Label>
                  <Select value={formData.supplier_id} onValueChange={(v) => setFormData(f => ({ ...f, supplier_id: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o fornecedor (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers?.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Quantidade *</Label>
                    <Input
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={formData.quantity || ''}
                      onChange={(e) => setFormData(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                      required
                    />
                    {selectedProduct && <span className="text-xs text-muted-foreground">{selectedProduct.unit}</span>}
                  </div>
                  <div className="space-y-2">
                    <Label>Valor Total (R$) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={formData.total_price || ''}
                      onChange={(e) => setFormData(f => ({ ...f, total_price: parseFloat(e.target.value) || 0 }))}
                      required
                    />
                  </div>
                </div>
                {formData.quantity > 0 && formData.total_price > 0 && (
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Preço unitário calculado:</p>
                    <p className="text-lg font-bold text-primary">
                      {formatCurrency(unitPrice)}/{selectedProduct?.unit || 'un'}
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Data da Compra *</Label>
                  <Input
                    type="date"
                    max={format(new Date(), 'yyyy-MM-dd')}
                    value={formData.purchase_date}
                    onChange={(e) => setFormData(f => ({ ...f, purchase_date: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Notas sobre a compra..."
                    maxLength={500}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    Registrar Compra
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Compras Hoje</CardTitle>
              <ShoppingCart className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalToday)}</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Compras no Mês</CardTitle>
              <TrendingUp className="h-5 w-5 text-info" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalMonth)}</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total de Registros</CardTitle>
              <DollarSign className="h-5 w-5 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{purchases?.length || 0}</div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle>Histórico de Compras</CardTitle>
            <CardDescription>Últimas 50 compras registradas</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Carregando...</p>
            ) : purchases?.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                Nenhuma compra registrada ainda.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Quantidade</TableHead>
                      <TableHead>Valor Total</TableHead>
                      <TableHead>Preço Unit.</TableHead>
                      <TableHead>Fornecedor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchases?.map((purchase) => (
                      <TableRow key={purchase.id}>
                        <TableCell>
                          {format(new Date(purchase.purchase_date), 'dd/MM/yyyy', { locale: ptBR })}
                        </TableCell>
                        <TableCell className="font-medium">
                          {purchase.products?.name}
                        </TableCell>
                        <TableCell>
                          {Number(purchase.quantity).toFixed(3)} {purchase.products?.unit}
                        </TableCell>
                        <TableCell>{formatCurrency(Number(purchase.total_price))}</TableCell>
                        <TableCell>
                          {formatCurrency(Number(purchase.unit_price))}/{purchase.products?.unit}
                        </TableCell>
                        <TableCell>{purchase.suppliers?.name || '-'}</TableCell>
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