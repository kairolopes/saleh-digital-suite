import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useKitchenNotifications } from "@/hooks/useKitchenNotifications";
import { Clock, CheckCircle, ChefHat, AlertTriangle, Bell, Volume2, VolumeX, XCircle, Phone, User } from "lucide-react";
import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  notes: string | null;
  status: string;
  menu_items?: {
    recipes?: {
      name: string;
      preparation_time: number | null;
    };
  };
}

interface Order {
  id: string;
  order_number: number;
  table_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  status: string;
  notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  order_items?: OrderItem[];
}

export default function Cozinha() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [rejectingOrder, setRejectingOrder] = useState<Order | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Realtime notifications
  const handleNewOrder = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["kitchen-orders"] });
  }, [queryClient]);

  useKitchenNotifications({
    enabled: true,
    onNewOrder: handleNewOrder,
    playSound: soundEnabled,
  });

  // Fetch orders in preparation or ready to prepare
  const { data: orders, isLoading } = useQuery({
    queryKey: ["kitchen-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          order_items (
            *,
            menu_items (
              recipes (name, preparation_time)
            )
          )
        `)
        .in("status", ["pending", "confirmed", "preparing"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Order[];
    },
  });

  // Update order status
  const updateOrderMutation = useMutation({
    mutationFn: async ({ orderId, status, rejectionReason }: { orderId: string; status: string; rejectionReason?: string }) => {
      const updateData: Record<string, any> = { status };
      
      if (status === "confirmed") {
        updateData.confirmed_at = new Date().toISOString();
      } else if (status === "preparing") {
        updateData.preparing_at = new Date().toISOString();
      } else if (status === "ready") {
        updateData.ready_at = new Date().toISOString();
      } else if (status === "cancelled" && rejectionReason) {
        updateData.rejection_reason = rejectionReason;
      }
      
      const { error } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", orderId);
      if (error) throw error;

      // Send webhook notification for status change
      try {
        await supabase.functions.invoke("webhook-order-status-notify", {
          body: { order_id: orderId, status, rejection_reason: rejectionReason }
        });
      } catch (e) {
        console.log("Webhook notification failed:", e);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kitchen-orders"] });
      toast({ title: "Pedido atualizado!" });
      setRejectingOrder(null);
      setRejectionReason("");
    },
    onError: () => {
      toast({ title: "Erro ao atualizar pedido", variant: "destructive" });
    },
  });

  // Update order item status
  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: string }) => {
      const { error } = await supabase
        .from("order_items")
        .update({ status })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kitchen-orders"] });
    },
  });

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getWaitingTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    return minutes;
  };

  const handleReject = (order: Order) => {
    setRejectingOrder(order);
    setRejectionReason("");
  };

  const confirmReject = () => {
    if (!rejectingOrder) return;
    if (!rejectionReason.trim()) {
      toast({ title: "Informe o motivo da recusa", variant: "destructive" });
      return;
    }
    updateOrderMutation.mutate({
      orderId: rejectingOrder.id,
      status: "cancelled",
      rejectionReason: rejectionReason,
    });
  };

  const newOrders = orders?.filter((o) => o.status === "pending") || [];
  const confirmedOrders = orders?.filter((o) => o.status === "confirmed") || [];
  const preparingOrders = orders?.filter((o) => o.status === "preparing") || [];

  // Check if all items are done
  const allItemsDone = (order: Order) => {
    return order.order_items?.every((item) => item.status === "done") || false;
  };

  return (
    <AppLayout requiredRoles={["admin", "cozinha"]}>
      <div className="min-h-screen">
        {/* Header - Tablet Optimized */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b pb-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center">
                <ChefHat className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Cozinha</h1>
                <p className="text-muted-foreground text-sm">Gerencie os pedidos</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="lg"
                className="h-14 w-14"
                onClick={() => setSoundEnabled(!soundEnabled)}
                title={soundEnabled ? "Desativar som" : "Ativar som"}
              >
                {soundEnabled ? (
                  <Volume2 className="h-6 w-6 text-green-500" />
                ) : (
                  <VolumeX className="h-6 w-6 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          {/* Stats - Large Touch Targets */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className={`rounded-2xl p-4 text-center ${newOrders.length > 0 ? 'bg-red-500/10 border-2 border-red-500 animate-pulse' : 'bg-muted/50 border border-border'}`}>
              <div className="flex items-center justify-center gap-2 mb-1">
                <Bell className={`h-5 w-5 ${newOrders.length > 0 ? 'text-red-600' : 'text-muted-foreground'}`} />
                <span className={`text-3xl font-bold ${newOrders.length > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>{newOrders.length}</span>
              </div>
              <p className={`text-sm font-medium ${newOrders.length > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>Novos</p>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Clock className="h-5 w-5 text-amber-600" />
                <span className="text-3xl font-bold text-amber-600">{confirmedOrders.length}</span>
              </div>
              <p className="text-sm font-medium text-amber-700">Aguardando</p>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <ChefHat className="h-5 w-5 text-orange-600" />
                <span className="text-3xl font-bold text-orange-600">{preparingOrders.length}</span>
              </div>
              <p className="text-sm font-medium text-orange-700">Preparando</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Carregando pedidos...</p>
          </div>
        ) : !orders?.length ? (
          <div className="text-center py-16">
            <ChefHat className="mx-auto h-20 w-20 text-muted-foreground/30" />
            <p className="mt-4 text-xl text-muted-foreground">
              Nenhum pedido para preparar
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Os pedidos aparecerão aqui automaticamente
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* New Orders - Need Accept/Reject - Large Touch Targets */}
            {newOrders.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Bell className="h-6 w-6 text-red-600 animate-bounce" />
                  <h2 className="text-xl font-bold text-red-700">
                    Novos Pedidos ({newOrders.length})
                  </h2>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {newOrders.map((order) => (
                    <Card 
                      key={order.id} 
                      className="border-2 border-red-500 bg-red-50 dark:bg-red-950/30 shadow-lg shadow-red-500/20 animate-pulse"
                    >
                      <CardContent className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <span className="text-3xl font-black text-red-700">
                              #{order.order_number}
                            </span>
                            {order.table_number && (
                              <div className="flex items-center gap-1 mt-1 text-red-700">
                                <span className="font-bold text-lg">Mesa {order.table_number}</span>
                              </div>
                            )}
                          </div>
                          <Badge className="bg-red-600 text-white text-lg px-4 py-1">
                            <Clock className="h-4 w-4 mr-1" />
                            {getWaitingTime(order.created_at)}min
                          </Badge>
                        </div>
                        
                        {(order.customer_name || order.customer_phone) && (
                          <div className="flex flex-wrap gap-3 text-red-800 mb-3">
                            {order.customer_name && (
                              <span className="flex items-center gap-1 font-medium">
                                <User className="h-4 w-4" />
                                {order.customer_name}
                              </span>
                            )}
                            {order.customer_phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-4 w-4" />
                                {order.customer_phone}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="space-y-2 mb-4">
                          {order.order_items?.map((item) => (
                            <div
                              key={item.id}
                              className="p-3 rounded-lg bg-white/50 dark:bg-black/20"
                            >
                              <span className="font-bold text-lg text-red-800">
                                {item.quantity}x {item.menu_items?.recipes?.name}
                              </span>
                              {item.notes && (
                                <p className="text-orange-600 flex items-center gap-1 mt-1">
                                  <AlertTriangle className="h-4 w-4" />
                                  {item.notes}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>

                        {order.notes && (
                          <div className="mb-4 p-3 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200">
                            <strong>Obs:</strong> {order.notes}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          <Button
                            variant="outline"
                            className="h-14 text-lg font-bold border-2 border-red-500 text-red-600 hover:bg-red-100"
                            onClick={() => handleReject(order)}
                          >
                            <XCircle className="h-5 w-5 mr-2" />
                            Recusar
                          </Button>
                          <Button
                            className="h-14 text-lg font-bold bg-green-600 hover:bg-green-700"
                            onClick={() =>
                              updateOrderMutation.mutate({
                                orderId: order.id,
                                status: "confirmed",
                              })
                            }
                          >
                            <CheckCircle className="h-5 w-5 mr-2" />
                            Aceitar
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Confirmed Orders - Tablet Optimized */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="h-6 w-6 text-amber-600" />
                  <h2 className="text-xl font-bold text-amber-700">
                    Aguardando Preparo ({confirmedOrders.length})
                  </h2>
                </div>
                <div className="space-y-4">
                  {confirmedOrders.map((order) => (
                    <Card 
                      key={order.id} 
                      className="border-2 border-amber-400 bg-amber-50/50 dark:bg-amber-950/20"
                    >
                      <CardContent className="p-5">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <span className="text-2xl font-bold text-amber-700">#{order.order_number}</span>
                            {order.table_number && (
                              <p className="text-amber-600 font-semibold mt-1">
                                Mesa {order.table_number}
                              </p>
                            )}
                          </div>
                          <Badge
                            className={`text-lg px-3 py-1 ${
                              getWaitingTime(order.created_at) > 15
                                ? "bg-red-500 text-white"
                                : "bg-amber-500 text-white"
                            }`}
                          >
                            <Clock className="h-4 w-4 mr-1" />
                            {getWaitingTime(order.created_at)}min
                          </Badge>
                        </div>
                        
                        {order.customer_name && (
                          <p className="text-amber-700 flex items-center gap-1 font-medium mb-3">
                            <User className="h-4 w-4" />
                            {order.customer_name}
                          </p>
                        )}

                        <div className="space-y-2 mb-4">
                          {order.order_items?.map((item) => (
                            <div
                              key={item.id}
                              className="p-3 rounded-lg bg-white/50 dark:bg-black/20"
                            >
                              <span className="font-bold text-lg">
                                {item.quantity}x {item.menu_items?.recipes?.name}
                              </span>
                              {item.notes && (
                                <p className="text-orange-600 flex items-center gap-1 mt-1">
                                  <AlertTriangle className="h-4 w-4" />
                                  {item.notes}
                                </p>
                              )}
                              {item.menu_items?.recipes?.preparation_time && (
                                <p className="text-muted-foreground text-sm mt-1">
                                  ~{item.menu_items.recipes.preparation_time} min preparo
                                </p>
                              )}
                            </div>
                          ))}
                        </div>

                        {order.notes && (
                          <div className="mb-4 p-3 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200">
                            <strong>Obs:</strong> {order.notes}
                          </div>
                        )}

                        <Button
                          className="w-full h-14 text-lg font-bold bg-amber-600 hover:bg-amber-700"
                          onClick={() =>
                            updateOrderMutation.mutate({
                              orderId: order.id,
                              status: "preparing",
                            })
                          }
                        >
                          <ChefHat className="h-5 w-5 mr-2" />
                          Iniciar Preparo
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                  {confirmedOrders.length === 0 && (
                    <p className="text-center py-8 text-muted-foreground">
                      Nenhum pedido aguardando
                    </p>
                  )}
                </div>
              </div>

              {/* Preparing Orders - Tablet Optimized */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <ChefHat className="h-6 w-6 text-orange-600" />
                  <h2 className="text-xl font-bold text-orange-700">
                    Em Preparo ({preparingOrders.length})
                  </h2>
                </div>
                <div className="space-y-4">
                  {preparingOrders.map((order) => (
                    <Card 
                      key={order.id} 
                      className="border-2 border-orange-400 bg-orange-50/50 dark:bg-orange-950/20"
                    >
                      <CardContent className="p-5">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <span className="text-2xl font-bold text-orange-700">#{order.order_number}</span>
                            {order.table_number && (
                              <p className="text-orange-600 font-semibold mt-1">
                                Mesa {order.table_number}
                              </p>
                            )}
                          </div>
                          <Badge
                            className={`text-lg px-3 py-1 ${
                              getWaitingTime(order.created_at) > 20
                                ? "bg-red-500 text-white"
                                : "bg-orange-500 text-white"
                            }`}
                          >
                            <Clock className="h-4 w-4 mr-1" />
                            {getWaitingTime(order.created_at)}min
                          </Badge>
                        </div>

                        {order.customer_name && (
                          <p className="text-orange-700 flex items-center gap-1 font-medium mb-3">
                            <User className="h-4 w-4" />
                            {order.customer_name}
                          </p>
                        )}

                        <div className="space-y-2 mb-4">
                          {order.order_items?.map((item) => (
                            <div
                              key={item.id}
                              className={`p-4 rounded-lg cursor-pointer transition-all active:scale-95 ${
                                item.status === "done"
                                  ? "bg-green-100 dark:bg-green-900/30 border-2 border-green-500"
                                  : "bg-white/50 dark:bg-black/20 border-2 border-transparent hover:border-orange-300"
                              }`}
                              onClick={() =>
                                updateItemMutation.mutate({
                                  itemId: item.id,
                                  status: item.status === "done" ? "pending" : "done",
                                })
                              }
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={`h-8 w-8 rounded-full border-3 flex items-center justify-center flex-shrink-0 ${
                                    item.status === "done"
                                      ? "bg-green-500 border-green-500"
                                      : "border-2 border-muted-foreground"
                                  }`}
                                >
                                  {item.status === "done" && (
                                    <CheckCircle className="h-5 w-5 text-white" />
                                  )}
                                </div>
                                <div className={item.status === "done" ? "line-through opacity-60" : ""}>
                                  <span className="font-bold text-lg">
                                    {item.quantity}x {item.menu_items?.recipes?.name}
                                  </span>
                                  {item.notes && (
                                    <p className="text-orange-600 text-sm mt-1">
                                      {item.notes}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {order.notes && (
                          <div className="mb-4 p-3 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200">
                            <strong>Obs:</strong> {order.notes}
                          </div>
                        )}

                        <Button
                          className={`w-full h-14 text-lg font-bold ${
                            allItemsDone(order)
                              ? "bg-green-600 hover:bg-green-700"
                              : "bg-muted text-muted-foreground cursor-not-allowed"
                          }`}
                          onClick={() =>
                            updateOrderMutation.mutate({
                              orderId: order.id,
                              status: "ready",
                            })
                          }
                          disabled={!allItemsDone(order)}
                        >
                          <CheckCircle className="h-5 w-5 mr-2" />
                          {allItemsDone(order)
                            ? "Marcar como Pronto"
                            : "Marque todos os itens"}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                  {preparingOrders.length === 0 && (
                    <p className="text-center py-8 text-muted-foreground">
                      Nenhum pedido em preparo
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reject Order Dialog */}
      <Dialog open={!!rejectingOrder} onOpenChange={(open) => !open && setRejectingOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              Recusar Pedido #{rejectingOrder?.order_number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-muted-foreground">
              Informe o motivo da recusa. Esta mensagem será enviada ao cliente.
            </p>
            <div className="space-y-2">
              <Label>Motivo da Recusa</Label>
              <Textarea
                placeholder="Ex: Ingrediente em falta, prato indisponível no momento..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingOrder(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmReject}>
              Confirmar Recusa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
