import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowUpCircle, ArrowDownCircle, Receipt, Clock, User, CreditCard, Package, ExternalLink } from 'lucide-react';

interface FinancialEntry {
  id: string;
  entry_type: string;
  amount: number;
  category: string;
  description: string | null;
  entry_date: string;
  created_at: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_by: string | null;
}

interface EntryDetailsDialogProps {
  entry: FinancialEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryLabels: Record<string, string>;
}

export function EntryDetailsDialog({ entry, open, onOpenChange, categoryLabels }: EntryDetailsDialogProps) {
  // Fetch order details if reference_type is 'pedido'
  const { data: orderDetails } = useQuery({
    queryKey: ['order-details', entry?.reference_id],
    queryFn: async () => {
      if (!entry?.reference_id || entry?.reference_type !== 'pedido') return null;
      
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            id,
            quantity,
            unit_price,
            total_price,
            notes,
            menu_items (
              recipes (name)
            )
          )
        `)
        .eq('id', entry.reference_id)
        .single();
      
      if (error) return null;
      return data;
    },
    enabled: !!entry?.reference_id && entry?.reference_type === 'pedido',
  });

  // Fetch creator profile
  const { data: creatorProfile } = useQuery({
    queryKey: ['profile', entry?.created_by],
    queryFn: async () => {
      if (!entry?.created_by) return null;
      
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', entry.created_by)
        .single();
      
      if (error) return null;
      return data;
    },
    enabled: !!entry?.created_by,
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  if (!entry) return null;

  const isIncome = entry.entry_type === 'receita';
  const isFromOrder = entry.reference_type === 'pedido';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isIncome ? (
              <ArrowUpCircle className="h-5 w-5 text-success" />
            ) : (
              <ArrowDownCircle className="h-5 w-5 text-destructive" />
            )}
            Detalhes do Lançamento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Main Info */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div>
              <p className="text-sm text-muted-foreground">Valor</p>
              <p className={`text-2xl font-bold ${isIncome ? 'text-success' : 'text-destructive'}`}>
                {isIncome ? '+' : '-'}{formatCurrency(entry.amount)}
              </p>
            </div>
            <Badge variant={isIncome ? 'default' : 'destructive'} className="text-sm">
              {isIncome ? 'Entrada' : 'Saída'}
            </Badge>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Receipt className="h-3 w-3" /> Categoria
              </p>
              <p className="font-medium">{categoryLabels[entry.category] || entry.category}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> Data
              </p>
              <p className="font-medium">
                {format(new Date(entry.entry_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
            </div>
          </div>

          {/* Description */}
          {entry.description && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">Descrição</p>
              <p className="p-3 rounded-lg bg-muted/50">{entry.description}</p>
            </div>
          )}

          {/* Creator Info */}
          {creatorProfile && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span>Criado por: {creatorProfile.full_name}</span>
            </div>
          )}

          {/* Order Details */}
          {isFromOrder && orderDetails && (
            <>
              <Separator />
              <div className="space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Pedido #{orderDetails.order_number}
                </h4>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Mesa:</span>{' '}
                    <span className="font-medium">{orderDetails.table_number || 'S/N'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Cliente:</span>{' '}
                    <span className="font-medium">{orderDetails.customer_name || 'Não informado'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CreditCard className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Pagamento:</span>{' '}
                    <span className="font-medium uppercase">{orderDetails.payment_method || '-'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Data:</span>{' '}
                    <span className="font-medium">
                      {orderDetails.created_at && format(new Date(orderDetails.created_at), 'dd/MM HH:mm')}
                    </span>
                  </div>
                </div>

                {/* Order Items */}
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Itens do pedido:</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {orderDetails.order_items?.map((item: any) => (
                      <div key={item.id} className="flex justify-between text-sm p-2 rounded bg-muted/30">
                        <span>
                          {item.quantity}x {item.menu_items?.recipes?.name || 'Item'}
                        </span>
                        <span className="font-medium">{formatCurrency(item.total_price)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Metadata */}
          <div className="text-xs text-muted-foreground pt-2 border-t">
            <p>ID: {entry.id}</p>
            {entry.created_at && (
              <p>Registrado em: {format(new Date(entry.created_at), "dd/MM/yyyy 'às' HH:mm")}</p>
            )}
            {isFromOrder && (
              <p className="flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />
                Origem: Pedido (automático)
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
