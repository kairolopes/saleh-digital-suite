import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useKitchenNotifications } from "@/hooks/useKitchenNotifications";
import { Clock, CheckCircle, ChefHat, AlertTriangle, Bell, Volume2, VolumeX } from "lucide-react";
import { useState, useCallback } from "react";

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
  status: string;
  notes: string | null;
  created_at: string;
  order_items?: OrderItem[];
}

export default function Cozinha() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [soundEnabled, setSoundEnabled] = useState(true);

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
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const { error } = await supabase
        .from("orders")
        .update({ status })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kitchen-orders"] });
      toast({ title: "Pedido atualizado!" });
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

  const newOrders = orders?.filter((o) => o.status === "pending") || [];
  const pendingOrders = orders?.filter((o) => o.status === "confirmed") || [];
  const preparingOrders = orders?.filter((o) => o.status === "preparing") || [];

  // Check if all items are done
  const allItemsDone = (order: Order) => {
    return order.order_items?.every((item) => item.status === "done") || false;
  };

  return (
    <AppLayout requiredRoles={["admin", "cozinha"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <ChefHat className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Cozinha</h1>
              <p className="text-muted-foreground">
                Gerencie a preparação dos pedidos
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? "Desativar som" : "Ativar som"}
            >
              {soundEnabled ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
            </Button>
            <div className="flex gap-4">
              {newOrders.length > 0 && (
                <div className="text-center">
                  <div className="text-3xl font-bold text-red-600 animate-pulse flex items-center gap-1">
                    <Bell className="h-5 w-5" />
                    {newOrders.length}
                  </div>
                  <div className="text-sm text-muted-foreground">Novos</div>
                </div>
              )}
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-600">
                  {pendingOrders.length}
                </div>
                <div className="text-sm text-muted-foreground">Confirmados</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-orange-600">
                  {preparingOrders.length}
                </div>
                <div className="text-sm text-muted-foreground">Preparando</div>
              </div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground">Carregando...</p>
        ) : !orders?.length ? (
          <div className="text-center py-16">
            <ChefHat className="mx-auto h-16 w-16 text-muted-foreground/50" />
            <p className="mt-4 text-xl text-muted-foreground">
              Nenhum pedido para preparar
            </p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Pending Orders */}
            <div>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-600" />
                Aguardando Preparo ({pendingOrders.length})
              </h2>
              <div className="space-y-4">
                {pendingOrders.map((order) => (
                  <Card key={order.id} className="border-l-4 border-l-yellow-500">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-lg">
                          #{order.order_number}
                          {order.table_number && (
                            <Badge variant="outline" className="ml-2">
                              Mesa {order.table_number}
                            </Badge>
                          )}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              getWaitingTime(order.created_at) > 15
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            <Clock className="h-3 w-3 mr-1" />
                            {getWaitingTime(order.created_at)} min
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 mb-4">
                        {order.order_items?.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between p-2 rounded bg-muted/50"
                          >
                            <div>
                              <span className="font-medium">
                                {item.quantity}x{" "}
                                {item.menu_items?.recipes?.name}
                              </span>
                              {item.notes && (
                                <p className="text-xs text-orange-600 flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  {item.notes}
                                </p>
                              )}
                            </div>
                            {item.menu_items?.recipes?.preparation_time && (
                              <span className="text-xs text-muted-foreground">
                                ~{item.menu_items.recipes.preparation_time} min
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                      {order.notes && (
                        <div className="mb-4 p-2 rounded bg-orange-100 text-orange-800 text-sm">
                          <strong>Obs:</strong> {order.notes}
                        </div>
                      )}
                      <Button
                        className="w-full"
                        onClick={() =>
                          updateOrderMutation.mutate({
                            orderId: order.id,
                            status: "preparing",
                          })
                        }
                      >
                        <ChefHat className="h-4 w-4 mr-2" />
                        Iniciar Preparo
                      </Button>
                    </CardContent>
                  </Card>
                ))}
                {pendingOrders.length === 0 && (
                  <p className="text-center py-4 text-muted-foreground">
                    Nenhum pedido aguardando
                  </p>
                )}
              </div>
            </div>

            {/* Preparing Orders */}
            <div>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <ChefHat className="h-5 w-5 text-orange-600" />
                Em Preparo ({preparingOrders.length})
              </h2>
              <div className="space-y-4">
                {preparingOrders.map((order) => (
                  <Card key={order.id} className="border-l-4 border-l-orange-500">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-lg">
                          #{order.order_number}
                          {order.table_number && (
                            <Badge variant="outline" className="ml-2">
                              Mesa {order.table_number}
                            </Badge>
                          )}
                        </CardTitle>
                        <Badge
                          variant={
                            getWaitingTime(order.created_at) > 20
                              ? "destructive"
                              : "outline"
                          }
                        >
                          <Clock className="h-3 w-3 mr-1" />
                          {getWaitingTime(order.created_at)} min
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 mb-4">
                        {order.order_items?.map((item) => (
                          <div
                            key={item.id}
                            className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                              item.status === "done"
                                ? "bg-green-100 line-through opacity-60"
                                : "bg-muted/50 hover:bg-muted"
                            }`}
                            onClick={() =>
                              updateItemMutation.mutate({
                                itemId: item.id,
                                status: item.status === "done" ? "pending" : "done",
                              })
                            }
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                                  item.status === "done"
                                    ? "bg-green-500 border-green-500"
                                    : "border-muted-foreground"
                                }`}
                              >
                                {item.status === "done" && (
                                  <CheckCircle className="h-4 w-4 text-white" />
                                )}
                              </div>
                              <div>
                                <span className="font-medium">
                                  {item.quantity}x{" "}
                                  {item.menu_items?.recipes?.name}
                                </span>
                                {item.notes && (
                                  <p className="text-xs text-orange-600">
                                    {item.notes}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {order.notes && (
                        <div className="mb-4 p-2 rounded bg-orange-100 text-orange-800 text-sm">
                          <strong>Obs:</strong> {order.notes}
                        </div>
                      )}
                      <Button
                        className="w-full bg-green-600 hover:bg-green-700"
                        onClick={() =>
                          updateOrderMutation.mutate({
                            orderId: order.id,
                            status: "ready",
                          })
                        }
                        disabled={!allItemsDone(order)}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {allItemsDone(order)
                          ? "Marcar como Pronto"
                          : "Complete todos os itens"}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
                {preparingOrders.length === 0 && (
                  <p className="text-center py-4 text-muted-foreground">
                    Nenhum pedido em preparo
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
