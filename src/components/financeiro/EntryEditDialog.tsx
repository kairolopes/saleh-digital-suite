import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Trash2, Save, AlertTriangle } from 'lucide-react';

interface FinancialEntry {
  id: string;
  entry_type: string;
  amount: number;
  category: string;
  description: string | null;
  entry_date: string;
  reference_type: string | null;
  reference_id: string | null;
}

interface EntryEditDialogProps {
  entry: FinancialEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryLabels: Record<string, string>;
  incomeCategories: string[];
  expenseCategories: string[];
}

export function EntryEditDialog({ 
  entry, 
  open, 
  onOpenChange, 
  categoryLabels,
  incomeCategories,
  expenseCategories
}: EntryEditDialogProps) {
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    amount: '',
    category: '',
    description: '',
    entry_date: ''
  });

  useEffect(() => {
    if (entry) {
      setFormData({
        amount: entry.amount.toString(),
        category: entry.category,
        description: entry.description || '',
        entry_date: entry.entry_date
      });
    }
  }, [entry]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!entry) throw new Error('Nenhum lançamento selecionado');
      
      const { error } = await supabase
        .from('financial_entries')
        .update({
          amount: parseFloat(formData.amount),
          category: formData.category,
          description: formData.description || null,
          entry_date: formData.entry_date
        })
        .eq('id', entry.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-entries'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      queryClient.invalidateQueries({ queryKey: ['category-breakdown'] });
      toast.success('Lançamento atualizado com sucesso!');
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar: ' + error.message);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!entry) throw new Error('Nenhum lançamento selecionado');
      
      const { error } = await supabase
        .from('financial_entries')
        .delete()
        .eq('id', entry.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-entries'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      queryClient.invalidateQueries({ queryKey: ['category-breakdown'] });
      toast.success('Lançamento excluído com sucesso!');
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir: ' + error.message);
    }
  });

  if (!entry) return null;

  const isFromOrder = entry.reference_type === 'pedido';
  const isIncome = entry.entry_type === 'receita';
  const categories = isIncome ? incomeCategories : expenseCategories;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Editar Lançamento</DialogTitle>
          <DialogDescription>
            {isFromOrder ? (
              <span className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                Este lançamento foi gerado automaticamente por um pedido
              </span>
            ) : (
              'Modifique os dados do lançamento'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div>
            <Label>Valor</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              disabled={isFromOrder}
            />
          </div>

          <div>
            <Label>Categoria</Label>
            <Select
              value={formData.category}
              onValueChange={(value) => setFormData({ ...formData, category: value })}
              disabled={isFromOrder}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a categoria" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>
                    {categoryLabels[cat]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Data</Label>
            <Input
              type="date"
              value={formData.entry_date}
              onChange={(e) => setFormData({ ...formData, entry_date: e.target.value })}
              disabled={isFromOrder}
            />
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descrição do lançamento..."
              disabled={isFromOrder}
            />
          </div>

          {isFromOrder && (
            <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
              Lançamentos de pedidos não podem ser editados. Para modificar, altere o pedido original.
            </p>
          )}

          <div className="flex justify-between pt-4">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isFromOrder || deleteMutation.isPending}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tem certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className="bg-destructive hover:bg-destructive/90"
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => updateMutation.mutate()}
                disabled={isFromOrder || updateMutation.isPending || !formData.amount || !formData.category}
              >
                <Save className="h-4 w-4 mr-2" />
                {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
