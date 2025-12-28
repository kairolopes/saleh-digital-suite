import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useElapsedTime } from "@/hooks/useElapsedTime";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Bell,
  BellRing,
  Volume2,
  VolumeX,
  CheckCircle,
  Clock,
  User,
  Phone,
  MapPin,
  CreditCard,
  Banknote,
  Smartphone,
  ChefHat,
  HandPlatter,
  X,
} from "lucide-react";

interface OrderItem {
  id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes: string | null;
  menu_items?: {
    recipes?: {
      name: string;
    } | null;
  } | null;
}

interface Order {
  id: string;
  order_number: number;
  order_type: string;
  table_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  status: string;
  total: number | null;
  notes: string | null;
  rejection_reason: string | null;
  payment_method: string | null;
  created_at: string;
  ready_at: string | null;
  order_items?: OrderItem[];
}

const paymentMethods = [
  { value: "pix", label: "PIX", icon: Smartphone, color: "bg-emerald-500" },
  { value: "dinheiro", label: "Dinheiro", icon: Banknote, color: "bg-green-500" },
  { value: "credito", label: "Crédito", icon: CreditCard, color: "bg-blue-500" },
  { value: "debito", label: "Débito", icon: CreditCard, color: "bg-purple-500" },
];

const statusConfig = {
  pending: { label: "Aguardando", color: "bg-amber-500", textColor: "text-amber-600" },
  confirmed: { label: "Confirmado", color: "bg-blue-500", textColor: "text-blue-600" },
  preparing: { label: "Preparando", color: "bg-orange-500", textColor: "text-orange-600" },
  ready: { label: "PRONTO!", color: "bg-green-500", textColor: "text-green-600" },
  delivered: { label: "Entregue", color: "bg-gray-500", textColor: "text-gray-600" },
  cancelled: { label: "Cancelado", color: "bg-red-500", textColor: "text-red-600" },
};

export default function Garcom() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [selectedPayment, setSelectedPayment] = useState("");
  const [readyAlert, setReadyAlert] = useState<Order | null>(null);
  const [waiterCalls, setWaiterCalls] = useState<any[]>([]);

  // Elapsed time hook for live counters
  const { getElapsedTime, getUrgencyColor } = useElapsedTime(30000);

  // Audio for notifications
  const playSound = useCallback(() => {
    if (soundEnabled) {
      const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3");
      audio.volume = 0.8;
      audio.play().catch(console.error);
    }
  }, [soundEnabled]);

  // Fetch orders
  const { data: orders, isLoading } = useQuery({
    queryKey: ["waiter-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`*, order_items (*, menu_items (*, recipes (name)))`)
        .in("status", ["pending", "confirmed", "preparing", "ready"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Order[];
    },
  });

  // Fetch waiter calls
  const { data: waiterCallsData } = useQuery({
    queryKey: ["waiter-calls"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("type", "call_waiter")
        .eq("is_read", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("waiter-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const newOrder = payload.new as Order;
          const oldOrder = payload.old as Order;

          // Show big alert when order becomes ready
          if (newOrder.status === "ready" && oldOrder.status !== "ready") {
            playSound();
            // Fetch full order data for alert
            supabase
              .from("orders")
              .select(`*, order_items (*, menu_items (*, recipes (name)))`)
              .eq("id", newOrder.id)
              .single()
              .then(({ data }) => {
                if (data) setReadyAlert(data as Order);
              });
          }

          queryClient.invalidateQueries({ queryKey: ["waiter-orders"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["waiter-orders"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: "type=eq.call_waiter" },
        (payload) => {
          playSound();
          queryClient.invalidateQueries({ queryKey: ["waiter-calls"] });
          const notification = payload.new as any;
          toast.warning(`Mesa ${notification.data?.table_number || "?"} chamando!`, {
            description: notification.data?.customer_name || "Cliente precisa de atendimento",
            duration: 10000,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [playSound, queryClient]);

  // Dismiss waiter call
  const dismissCall = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", notificationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waiter-calls"] });
      toast.success("Chamado atendido!");
    },
  });

  // Deliver order mutation
  const deliverMutation = useMutation({
    mutationFn: async ({ orderId, paymentMethod }: { orderId: string; paymentMethod: string }) => {
      const { error } = await supabase
        .from("orders")
        .update({
          status: "delivered",
          delivered_at: new Date().toISOString(),
          payment_method: paymentMethod,
          paid_at: new Date().toISOString(),
        })
        .eq("id", orderId);
      if (error) throw error;

      // Create financial entry
      const order = orders?.find((o) => o.id === orderId);
      if (order) {
        await supabase.from("financial_entries").insert({
          entry_type: "receita",
          category: "vendas",
          amount: order.total || 0,
          description: `Pedido #${order.order_number} - ${paymentMethod.toUpperCase()}`,
          reference_type: "pedido",
          reference_id: orderId,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waiter-orders"] });
      toast.success("Pedido entregue e pago!");
      setPaymentOrder(null);
      setSelectedPayment("");
      setSelectedOrder(null);
    },
    onError: () => {
      toast.error("Erro ao finalizar pedido");
    },
  });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const readyOrders = orders?.filter((o) => o.status === "ready") || [];
  const preparingOrders = orders?.filter((o) => o.status === "preparing") || [];
  const pendingOrders = orders?.filter((o) => ["pending", "confirmed"].includes(o.status)) || [];

  const handleConfirmPayment = () => {
    if (!paymentOrder || !selectedPayment) {
      toast.error("Selecione a forma de pagamento");
      return;
    }
    deliverMutation.mutate({ orderId: paymentOrder.id, paymentMethod: selectedPayment });
  };

  return (
    <AppLayout requiredRoles={["admin", "garcom"]}>
      <div className="min-h-screen">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b pb-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <HandPlatter className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Garçom</h1>
                <p className="text-muted-foreground text-sm">Acompanhe seus pedidos</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-muted/50">
                <span className="text-sm font-medium">Som</span>
                <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
                {soundEnabled ? (
                  <Volume2 className="h-5 w-5 text-green-500" />
                ) : (
                  <VolumeX className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <BellRing className="h-5 w-5 text-green-600" />
                <span className="text-3xl font-bold text-green-600">{readyOrders.length}</span>
              </div>
              <p className="text-sm font-medium text-green-700">Prontos para Servir</p>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <ChefHat className="h-5 w-5 text-orange-600" />
                <span className="text-3xl font-bold text-orange-600">{preparingOrders.length}</span>
              </div>
              <p className="text-sm font-medium text-orange-700">Na Cozinha</p>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Clock className="h-5 w-5 text-amber-600" />
                <span className="text-3xl font-bold text-amber-600">{pendingOrders.length}</span>
              </div>
              <p className="text-sm font-medium text-amber-700">Aguardando</p>
            </div>
          </div>
        </div>

        {/* Waiter Calls Section */}
        {waiterCallsData && waiterCallsData.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="h-6 w-6 text-red-600 animate-bounce" />
              <h2 className="text-xl font-bold text-red-700">Chamados de Mesa</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {waiterCallsData.map((call: any) => (
                <Card
                  key={call.id}
                  className="border-2 border-red-500 bg-red-50 dark:bg-red-950/30 shadow-lg shadow-red-500/20 animate-pulse"
                >
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-6 w-6 text-red-700" />
                          <span className="text-3xl font-black text-red-700">
                            Mesa {call.data?.table_number || "?"}
                          </span>
                        </div>
                        {call.data?.customer_name && (
                          <p className="text-red-700 flex items-center gap-1 mt-2">
                            <User className="h-4 w-4" />
                            {call.data.customer_name}
                          </p>
                        )}
                      </div>
                      <Badge className="bg-red-600 text-white text-lg px-4 py-1">CHAMANDO</Badge>
                    </div>
                    <Button
                      className="w-full h-14 text-lg font-bold bg-red-600 hover:bg-red-700"
                      onClick={() => dismissCall.mutate(call.id)}
                      disabled={dismissCall.isPending}
                    >
                      <CheckCircle className="h-6 w-6 mr-2" />
                      Atender Mesa
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Ready Orders - Priority Section */}
        {readyOrders.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <BellRing className="h-6 w-6 text-green-600 animate-bounce" />
              <h2 className="text-xl font-bold text-green-700">Prontos para Servir!</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {readyOrders.map((order) => (
                <Card
                  key={order.id}
                  className="cursor-pointer border-2 border-green-500 bg-green-50 dark:bg-green-950/30 shadow-lg shadow-green-500/20 hover:shadow-xl transition-all animate-pulse"
                  onClick={() => setSelectedOrder(order)}
                >
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-3xl font-black text-green-700">
                            #{order.order_number}
                          </span>
                          <span className="relative flex h-4 w-4">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-4 w-4 bg-green-500"></span>
                          </span>
                        </div>
                        {order.table_number && (
                          <div className="flex items-center gap-1 mt-1 text-green-700">
                            <MapPin className="h-4 w-4" />
                            <span className="font-bold text-lg">Mesa {order.table_number}</span>
                          </div>
                        )}
                      </div>
                      <Badge className="bg-green-600 text-white text-lg px-4 py-1">PRONTO!</Badge>
                    </div>
                    <div className="flex items-center justify-between mb-3">
                      {order.customer_name && (
                        <div className="flex items-center gap-2 text-green-800">
                          <User className="h-5 w-5" />
                          <span className="font-semibold text-lg">{order.customer_name}</span>
                        </div>
                      )}
                      <div className={`flex items-center gap-1 px-2 py-1 rounded-lg font-medium ${getUrgencyColor(order.created_at)}`}>
                        <Clock className="h-4 w-4" />
                        <span className="text-sm">{getElapsedTime(order.created_at)}</span>
                      </div>
                    </div>
                    <div className="space-y-1 mb-4">
                      {order.order_items?.map((item) => (
                        <p key={item.id} className="text-green-800 font-medium">
                          {item.quantity}x {item.menu_items?.recipes?.name}
                        </p>
                      ))}
                    </div>
                    <Button
                      className="w-full h-14 text-lg font-bold bg-green-600 hover:bg-green-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPaymentOrder(order);
                      }}
                    >
                      <CheckCircle className="h-6 w-6 mr-2" />
                      Entregar e Fechar
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Preparing Orders */}
        {preparingOrders.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <ChefHat className="h-6 w-6 text-orange-600" />
              <h2 className="text-xl font-bold text-orange-700">Na Cozinha</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {preparingOrders.map((order) => (
                <Card
                  key={order.id}
                  className="cursor-pointer border border-orange-300 bg-orange-50/50 dark:bg-orange-950/20 hover:shadow-md transition-all"
                  onClick={() => setSelectedOrder(order)}
                >
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span className="text-2xl font-bold text-orange-700">#{order.order_number}</span>
                        {order.table_number && (
                          <p className="text-orange-600 flex items-center gap-1 mt-1">
                            <MapPin className="h-4 w-4" />
                            Mesa {order.table_number}
                          </p>
                        )}
                      </div>
                      <Badge className="bg-orange-500 text-white">Preparando</Badge>
                    </div>
                    {order.customer_name && (
                      <p className="text-muted-foreground flex items-center gap-1 text-sm mb-2">
                        <User className="h-4 w-4" />
                        {order.customer_name}
                      </p>
                    )}
                    <div className="text-sm text-muted-foreground space-y-0.5">
                      {order.order_items?.slice(0, 3).map((item) => (
                        <p key={item.id}>
                          {item.quantity}x {item.menu_items?.recipes?.name}
                        </p>
                      ))}
                      {(order.order_items?.length || 0) > 3 && (
                        <p className="text-muted-foreground">
                          +{(order.order_items?.length || 0) - 3} itens
                        </p>
                      )}
                    </div>
                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-orange-200">
                      <div className={`flex items-center gap-1 px-2 py-1 rounded-lg font-medium ${getUrgencyColor(order.created_at)}`}>
                        <Clock className="h-4 w-4" />
                        <span className="text-sm">{getElapsedTime(order.created_at)}</span>
                      </div>
                      <span className="font-bold text-orange-700">{formatCurrency(order.total || 0)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Pending Orders */}
        {pendingOrders.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-6 w-6 text-amber-600" />
              <h2 className="text-xl font-bold text-amber-700">Aguardando Confirmação</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pendingOrders.map((order) => (
                <Card
                  key={order.id}
                  className="cursor-pointer border border-amber-200 bg-amber-50/30 dark:bg-amber-950/10 hover:shadow-md transition-all"
                  onClick={() => setSelectedOrder(order)}
                >
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span className="text-2xl font-bold">#{order.order_number}</span>
                        {order.table_number && (
                          <p className="text-muted-foreground flex items-center gap-1 mt-1">
                            <MapPin className="h-4 w-4" />
                            Mesa {order.table_number}
                          </p>
                        )}
                      </div>
                      <Badge
                        className={`${statusConfig[order.status as keyof typeof statusConfig]?.color} text-white`}
                      >
                        {statusConfig[order.status as keyof typeof statusConfig]?.label}
                      </Badge>
                    </div>
                    {order.customer_name && (
                      <p className="text-muted-foreground flex items-center gap-1 text-sm mb-2">
                        <User className="h-4 w-4" />
                        {order.customer_name}
                      </p>
                    )}
                    <div className="text-sm text-muted-foreground space-y-0.5">
                      {order.order_items?.slice(0, 2).map((item) => (
                        <p key={item.id}>
                          {item.quantity}x {item.menu_items?.recipes?.name}
                        </p>
                      ))}
                      {(order.order_items?.length || 0) > 2 && (
                        <p>+{(order.order_items?.length || 0) - 2} itens</p>
                      )}
                    </div>
                    <div className="flex justify-between items-center mt-3 pt-3 border-t">
                      <div className={`flex items-center gap-1 px-2 py-1 rounded-lg font-medium ${getUrgencyColor(order.created_at)}`}>
                        <Clock className="h-4 w-4" />
                        <span className="text-sm">{getElapsedTime(order.created_at)}</span>
                      </div>
                      <span className="font-bold text-primary">{formatCurrency(order.total || 0)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Carregando pedidos...</p>
          </div>
        )}

        {!isLoading && orders?.length === 0 && (
          <div className="text-center py-12">
            <Bell className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-xl font-semibold text-muted-foreground">Nenhum pedido ativo</h3>
            <p className="text-muted-foreground">Os pedidos aparecerão aqui automaticamente</p>
          </div>
        )}

        {/* Big Ready Alert Modal */}
        <Dialog open={!!readyAlert} onOpenChange={(open) => !open && setReadyAlert(null)}>
          <DialogContent className="sm:max-w-xl bg-green-50 border-4 border-green-500">
            <button
              onClick={() => setReadyAlert(null)}
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="text-center py-6">
              <div className="mb-6">
                <div className="h-24 w-24 mx-auto rounded-full bg-green-500 flex items-center justify-center animate-bounce">
                  <BellRing className="h-12 w-12 text-white" />
                </div>
              </div>
              <h2 className="text-4xl font-black text-green-700 mb-2">PEDIDO PRONTO!</h2>
              <p className="text-6xl font-black text-green-800 mb-4">#{readyAlert?.order_number}</p>
              {readyAlert?.table_number && (
                <div className="inline-flex items-center gap-2 bg-green-200 text-green-800 px-6 py-3 rounded-full text-2xl font-bold mb-4">
                  <MapPin className="h-8 w-8" />
                  Mesa {readyAlert.table_number}
                </div>
              )}
              {readyAlert?.customer_name && (
                <p className="text-2xl font-semibold text-green-700 mb-4">
                  <User className="h-6 w-6 inline mr-2" />
                  {readyAlert.customer_name}
                </p>
              )}
              <div className="bg-white rounded-xl p-4 mb-6 text-left max-h-48 overflow-y-auto">
                <p className="font-bold text-green-800 mb-2">Itens:</p>
                {readyAlert?.order_items?.map((item) => (
                  <p key={item.id} className="text-lg text-green-700">
                    {item.quantity}x {item.menu_items?.recipes?.name}
                    {item.notes && <span className="text-sm text-green-600 ml-2">({item.notes})</span>}
                  </p>
                ))}
              </div>
              <Button
                className="w-full h-16 text-xl font-bold bg-green-600 hover:bg-green-700"
                onClick={() => {
                  setPaymentOrder(readyAlert);
                  setReadyAlert(null);
                }}
              >
                <CheckCircle className="h-8 w-8 mr-3" />
                Buscar e Entregar
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Order Details Modal */}
        <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-2xl">
                Pedido #{selectedOrder?.order_number}
                {selectedOrder?.table_number && (
                  <Badge variant="outline" className="ml-3 text-base">
                    Mesa {selectedOrder.table_number}
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge
                    className={`${
                      statusConfig[selectedOrder.status as keyof typeof statusConfig]?.color
                    } text-white text-base px-4 py-1`}
                  >
                    {statusConfig[selectedOrder.status as keyof typeof statusConfig]?.label}
                  </Badge>
                </div>

                {selectedOrder.customer_name && (
                  <div className="flex items-center gap-2 text-lg">
                    <User className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">{selectedOrder.customer_name}</span>
                  </div>
                )}

                {selectedOrder.customer_phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-5 w-5 text-muted-foreground" />
                    <span>{selectedOrder.customer_phone}</span>
                  </div>
                )}

                {selectedOrder.rejection_reason && (
                  <div className="bg-red-100 text-red-800 p-4 rounded-xl text-base">
                    <strong>Recusado pela cozinha:</strong> {selectedOrder.rejection_reason}
                  </div>
                )}

                <div className="border rounded-xl divide-y">
                  {selectedOrder.order_items?.map((item) => (
                    <div key={item.id} className="p-4 flex justify-between">
                      <div>
                        <span className="font-medium text-base">
                          {item.quantity}x {item.menu_items?.recipes?.name}
                        </span>
                        {item.notes && (
                          <p className="text-sm text-muted-foreground mt-1">Obs: {item.notes}</p>
                        )}
                      </div>
                      <span className="font-medium text-primary">{formatCurrency(item.total_price)}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center text-xl font-bold pt-3 border-t">
                  <span>Total:</span>
                  <span className="text-primary">{formatCurrency(selectedOrder.total || 0)}</span>
                </div>

                {selectedOrder.notes && (
                  <div className="bg-muted/50 rounded-xl p-4">
                    <p className="text-muted-foreground">
                      <strong>Observações:</strong> {selectedOrder.notes}
                    </p>
                  </div>
                )}

                {selectedOrder.status === "ready" && (
                  <Button
                    className="w-full h-14 text-lg font-bold bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      setPaymentOrder(selectedOrder);
                      setSelectedOrder(null);
                    }}
                  >
                    <CheckCircle className="h-6 w-6 mr-2" />
                    Entregar e Fechar Comanda
                  </Button>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Payment Dialog */}
        <Dialog open={!!paymentOrder} onOpenChange={(open) => !open && setPaymentOrder(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-2xl text-center">
                Fechar Comanda #{paymentOrder?.order_number}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="text-center">
                <p className="text-muted-foreground mb-1">Total a Pagar</p>
                <p className="text-5xl font-black text-primary">
                  {formatCurrency(paymentOrder?.total || 0)}
                </p>
              </div>

              <div className="space-y-3">
                <p className="font-semibold text-center">Forma de Pagamento</p>
                <div className="grid grid-cols-2 gap-4">
                  {paymentMethods.map((method) => (
                    <Button
                      key={method.value}
                      type="button"
                      variant={selectedPayment === method.value ? "default" : "outline"}
                      className={`h-20 flex flex-col gap-2 text-base ${
                        selectedPayment === method.value ? method.color : ""
                      }`}
                      onClick={() => setSelectedPayment(method.value)}
                    >
                      <method.icon className="h-8 w-8" />
                      <span className="font-bold">{method.label}</span>
                    </Button>
                  ))}
                </div>
              </div>

              <Button
                className="w-full h-14 text-lg font-bold"
                onClick={handleConfirmPayment}
                disabled={!selectedPayment || deliverMutation.isPending}
              >
                <CheckCircle className="h-6 w-6 mr-2" />
                Confirmar Pagamento
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
