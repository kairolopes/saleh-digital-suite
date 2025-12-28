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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Plus,
  Minus,
  ShoppingCart,
  UtensilsCrossed,
  XCircle,
  AlertTriangle,
  Trash2,
  Split,
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
  delivered: { label: "Entregue", color: "bg-purple-500", textColor: "text-purple-600" },
  paid: { label: "Pago", color: "bg-gray-500", textColor: "text-gray-600" },
  cancelled: { label: "Cancelado", color: "bg-red-500", textColor: "text-red-600" },
};

interface MenuItem {
  id: string;
  recipe_id: string;
  sell_price: number;
  category: string;
  is_available: boolean;
  recipes?: {
    name: string;
    description: string | null;
    image_url: string | null;
  } | null;
}

interface PaymentSplit {
  method: string;
  amount: number;
}

export default function Garcom() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [readyAlert, setReadyAlert] = useState<Order | null>(null);
  const [waiterCalls, setWaiterCalls] = useState<any[]>([]);
  
  // Split payment state
  const [useSplitPayment, setUseSplitPayment] = useState(false);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([{ method: "", amount: 0 }]);
  const [singlePaymentMethod, setSinglePaymentMethod] = useState("");

  // Menu and new order state
  const [showMenuDialog, setShowMenuDialog] = useState(false);
  const [showNewOrderDialog, setShowNewOrderDialog] = useState(false);
  const [cart, setCart] = useState<{ menuItem: MenuItem; quantity: number; notes: string }[]>([]);
  const [orderType, setOrderType] = useState<"local" | "delivery" | "takeout">("local");
  const [tableNumber, setTableNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  
  // Cancel order state
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

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
        .in("status", ["pending", "confirmed", "preparing", "ready", "delivered"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Order[];
    },
  });

  // Fetch menu items for viewing and creating orders
  const { data: menuItems } = useQuery({
    queryKey: ["menu-items-available"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select(`*, recipes:recipe_id (name, description, image_url)`)
        .eq("is_available", true)
        .order("category");
      if (error) throw error;
      return data as MenuItem[];
    },
  });

  // Fetch waiter calls and bill requests
  const { data: waiterCallsData } = useQuery({
    queryKey: ["waiter-calls"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .in("type", ["call_waiter", "request_bill"])
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
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: "type=eq.request_bill" },
        (payload) => {
          playSound();
          queryClient.invalidateQueries({ queryKey: ["waiter-calls"] });
          const notification = payload.new as any;
          toast.warning(`Mesa ${notification.data?.table_number || "?"} pediu a CONTA!`, {
            description: `${notification.data?.customer_name || "Cliente"} - ${notification.data?.payment_method || ""}`,
            duration: 15000,
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

  // Deliver order mutation (just changes status, stock deducted by trigger)
  const deliverMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase
        .from("orders")
        .update({
          status: "delivered",
          delivered_at: new Date().toISOString(),
        })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waiter-orders"] });
      toast.success("Pedido entregue! Estoque atualizado.");
      setSelectedOrder(null);
    },
    onError: () => {
      toast.error("Erro ao entregar pedido");
    },
  });

  // Close order mutation (payment and financial entry)
  const closeOrderMutation = useMutation({
    mutationFn: async ({ orderId, paymentMethod }: { orderId: string; paymentMethod: string }) => {
      const { error } = await supabase
        .from("orders")
        .update({
          status: "paid",
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
      toast.success("Comanda fechada!");
      setPaymentOrder(null);
      setUseSplitPayment(false);
      setPaymentSplits([{ method: "", amount: 0 }]);
      setSinglePaymentMethod("");
      setSelectedOrder(null);
    },
    onError: () => {
      toast.error("Erro ao fechar comanda");
    },
  });

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Carrinho vazio");
      const subtotal = cart.reduce((sum, item) => sum + item.menuItem.sell_price * item.quantity, 0);
      const { data: newOrder, error: orderError } = await supabase
        .from("orders")
        .insert({
          order_type: orderType,
          table_number: orderType === "local" ? tableNumber : null,
          customer_name: customerName || null,
          customer_phone: customerPhone || null,
          subtotal,
          total: subtotal,
          status: "pending",
          waiter_id: user?.id,
        })
        .select()
        .single();
      if (orderError) throw orderError;
      const orderItems = cart.map((item) => ({
        order_id: newOrder.id,
        menu_item_id: item.menuItem.id,
        quantity: item.quantity,
        unit_price: item.menuItem.sell_price,
        total_price: item.menuItem.sell_price * item.quantity,
        notes: item.notes || null,
        status: "pending",
      }));
      const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
      if (itemsError) throw itemsError;
      return newOrder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waiter-orders"] });
      toast.success("Pedido criado com sucesso!");
      resetNewOrder();
    },
    onError: () => {
      toast.error("Erro ao criar pedido");
    },
  });

  // Cancel order mutation
  const cancelOrderMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      if (!reason.trim()) throw new Error("Motivo é obrigatório");
      
      const { error } = await supabase
        .from("orders")
        .update({
          status: "cancelled",
          rejection_reason: reason,
          cancelled_by: user?.id,
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waiter-orders"] });
      toast.success("Pedido cancelado!");
      setCancelOrderId(null);
      setCancelReason("");
      setSelectedOrder(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao cancelar pedido");
    },
  });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const readyOrders = orders?.filter((o) => o.status === "ready") || [];
  const deliveredOrders = orders?.filter((o) => o.status === "delivered") || [];
  const preparingOrders = orders?.filter((o) => o.status === "preparing") || [];
  const pendingOrders = orders?.filter((o) => ["pending", "confirmed"].includes(o.status)) || [];

  const groupedMenuItems = menuItems?.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  const addToCart = (menuItem: MenuItem) => {
    const existing = cart.find((item) => item.menuItem.id === menuItem.id);
    if (existing) {
      setCart(cart.map((item) => item.menuItem.id === menuItem.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { menuItem, quantity: 1, notes: "" }]);
    }
  };

  const updateCartQuantity = (menuItemId: string, delta: number) => {
    setCart(cart.map((item) => item.menuItem.id === menuItemId ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item).filter((item) => item.quantity > 0));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.menuItem.sell_price * item.quantity, 0);

  const resetNewOrder = () => {
    setCart([]);
    setOrderType("local");
    setTableNumber("");
    setCustomerName("");
    setCustomerPhone("");
    setShowNewOrderDialog(false);
  };

  // Split payment helpers
  const addPaymentSplit = () => {
    setPaymentSplits([...paymentSplits, { method: "", amount: 0 }]);
  };

  const removePaymentSplit = (index: number) => {
    if (paymentSplits.length > 1) {
      setPaymentSplits(paymentSplits.filter((_, i) => i !== index));
    }
  };

  const updatePaymentSplit = (index: number, field: "method" | "amount", value: string | number) => {
    const updated = [...paymentSplits];
    if (field === "method") {
      updated[index].method = value as string;
    } else {
      updated[index].amount = Number(value);
    }
    setPaymentSplits(updated);
  };

  const splitTotal = paymentSplits.reduce((sum, p) => sum + p.amount, 0);
  const remainingAmount = (paymentOrder?.total || 0) - splitTotal;

  const handleConfirmPayment = () => {
    if (!paymentOrder) return;

    if (useSplitPayment) {
      // Validate split payments
      const invalidSplits = paymentSplits.some(p => !p.method || p.amount <= 0);
      if (invalidSplits) {
        toast.error("Preencha todos os valores e formas de pagamento");
        return;
      }
      if (Math.abs(remainingAmount) > 0.01) {
        toast.error("A soma dos valores deve ser igual ao total");
        return;
      }
      // Format payment method string for split payment
      const paymentMethodStr = paymentSplits.map(p => `${p.method}:${p.amount.toFixed(2)}`).join("|");
      closeOrderMutation.mutate({ orderId: paymentOrder.id, paymentMethod: paymentMethodStr });
    } else {
      if (!singlePaymentMethod) {
        toast.error("Selecione a forma de pagamento");
        return;
      }
      closeOrderMutation.mutate({ orderId: paymentOrder.id, paymentMethod: singlePaymentMethod });
    }
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
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => setShowMenuDialog(true)}>
                <UtensilsCrossed className="h-4 w-4 mr-2" />
                Ver Cardápio
              </Button>
              <Button onClick={() => setShowNewOrderDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Pedido
              </Button>
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
          <div className="grid grid-cols-4 gap-4 mt-4">
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <BellRing className="h-5 w-5 text-green-600" />
                <span className="text-3xl font-bold text-green-600">{readyOrders.length}</span>
              </div>
              <p className="text-sm font-medium text-green-700">Prontos</p>
            </div>
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <CreditCard className="h-5 w-5 text-purple-600" />
                <span className="text-3xl font-bold text-purple-600">{deliveredOrders.length}</span>
              </div>
              <p className="text-sm font-medium text-purple-700">Aguard. Pagamento</p>
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

        {/* Waiter Calls & Bill Requests Section */}
        {waiterCallsData && waiterCallsData.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="h-6 w-6 text-red-600 animate-bounce" />
              <h2 className="text-xl font-bold text-red-700">Chamados e Solicitações</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {waiterCallsData.map((call: any) => {
                const isBillRequest = call.type === "request_bill";
                return (
                  <Card
                    key={call.id}
                    className={`border-2 shadow-lg animate-pulse ${
                      isBillRequest 
                        ? "border-orange-500 bg-orange-50 dark:bg-orange-950/30 shadow-orange-500/20"
                        : "border-red-500 bg-red-50 dark:bg-red-950/30 shadow-red-500/20"
                    }`}
                  >
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <MapPin className={`h-6 w-6 ${isBillRequest ? "text-orange-700" : "text-red-700"}`} />
                            <span className={`text-3xl font-black ${isBillRequest ? "text-orange-700" : "text-red-700"}`}>
                              Mesa {call.data?.table_number || "?"}
                            </span>
                          </div>
                          {call.data?.customer_name && (
                            <p className={`flex items-center gap-1 mt-2 ${isBillRequest ? "text-orange-700" : "text-red-700"}`}>
                              <User className="h-4 w-4" />
                              {call.data.customer_name}
                            </p>
                          )}
                          {isBillRequest && call.data?.payment_method && (
                            <p className="text-orange-600 flex items-center gap-1 mt-1 font-semibold">
                              <CreditCard className="h-4 w-4" />
                              {call.data.payment_method === "pix" ? "PIX" :
                               call.data.payment_method === "credit" ? "Cartão Crédito" :
                               call.data.payment_method === "debit" ? "Cartão Débito" :
                               call.data.payment_method === "cash" ? "Dinheiro" : call.data.payment_method}
                            </p>
                          )}
                        </div>
                        <Badge className={`text-white text-lg px-4 py-1 ${isBillRequest ? "bg-orange-600" : "bg-red-600"}`}>
                          {isBillRequest ? "CONTA" : "CHAMANDO"}
                        </Badge>
                      </div>
                      <Button
                        className={`w-full h-14 text-lg font-bold ${
                          isBillRequest 
                            ? "bg-orange-600 hover:bg-orange-700" 
                            : "bg-red-600 hover:bg-red-700"
                        }`}
                        onClick={() => dismissCall.mutate(call.id)}
                        disabled={dismissCall.isPending}
                      >
                        <CheckCircle className="h-6 w-6 mr-2" />
                        {isBillRequest ? "Levar Conta" : "Atender Mesa"}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
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
                        deliverMutation.mutate(order.id);
                      }}
                      disabled={deliverMutation.isPending}
                    >
                      <CheckCircle className="h-6 w-6 mr-2" />
                      Entregar Pedido
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Delivered Orders - Awaiting Payment */}
        {deliveredOrders.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="h-6 w-6 text-purple-600" />
              <h2 className="text-xl font-bold text-purple-700">Aguardando Pagamento</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {deliveredOrders.map((order) => (
                <Card
                  key={order.id}
                  className="cursor-pointer border-2 border-purple-400 bg-purple-50 dark:bg-purple-950/30 hover:shadow-lg transition-all"
                  onClick={() => setSelectedOrder(order)}
                >
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-3xl font-black text-purple-700">
                            #{order.order_number}
                          </span>
                        </div>
                        {order.table_number && (
                          <div className="flex items-center gap-1 mt-1 text-purple-700">
                            <MapPin className="h-4 w-4" />
                            <span className="font-bold text-lg">Mesa {order.table_number}</span>
                          </div>
                        )}
                      </div>
                      <Badge className="bg-purple-600 text-white text-lg px-4 py-1">Entregue</Badge>
                    </div>
                    <div className="flex items-center justify-between mb-3">
                      {order.customer_name && (
                        <div className="flex items-center gap-2 text-purple-800">
                          <User className="h-5 w-5" />
                          <span className="font-semibold text-lg">{order.customer_name}</span>
                        </div>
                      )}
                    </div>
                    <div className="text-center mb-4">
                      <p className="text-muted-foreground text-sm">Total</p>
                      <p className="text-3xl font-bold text-purple-700">{formatCurrency(order.total || 0)}</p>
                    </div>
                    <Button
                      className="w-full h-14 text-lg font-bold bg-purple-600 hover:bg-purple-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPaymentOrder(order);
                      }}
                    >
                      <CreditCard className="h-6 w-6 mr-2" />
                      Fechar Comanda
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
                  if (readyAlert) {
                    deliverMutation.mutate(readyAlert.id);
                  }
                  setReadyAlert(null);
                }}
                disabled={deliverMutation.isPending}
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
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 h-14 text-lg font-bold bg-green-600 hover:bg-green-700"
                      onClick={() => {
                        deliverMutation.mutate(selectedOrder.id);
                      }}
                      disabled={deliverMutation.isPending}
                    >
                      <CheckCircle className="h-6 w-6 mr-2" />
                      Entregar Pedido
                    </Button>
                    <Button
                      variant="destructive"
                      className="h-14"
                      onClick={() => setCancelOrderId(selectedOrder.id)}
                    >
                      <XCircle className="h-6 w-6" />
                    </Button>
                  </div>
                )}
                {selectedOrder.status === "delivered" && (
                  <Button
                    className="w-full h-14 text-lg font-bold bg-purple-600 hover:bg-purple-700"
                    onClick={() => {
                      setPaymentOrder(selectedOrder);
                      setSelectedOrder(null);
                    }}
                  >
                    <CreditCard className="h-6 w-6 mr-2" />
                    Fechar Comanda
                  </Button>
                )}
                {["pending", "confirmed", "preparing"].includes(selectedOrder.status) && (
                  <Button
                    variant="destructive"
                    className="w-full h-14 text-lg font-bold"
                    onClick={() => setCancelOrderId(selectedOrder.id)}
                  >
                    <XCircle className="h-6 w-6 mr-2" />
                    Cancelar Pedido
                  </Button>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Cancel Order Dialog */}
        <Dialog open={!!cancelOrderId} onOpenChange={(open) => {
          if (!open) {
            setCancelOrderId(null);
            setCancelReason("");
          }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-6 w-6" />
                Cancelar Pedido
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-muted-foreground">
                Informe o motivo do cancelamento. Esta ação não pode ser desfeita.
              </p>
              <div className="space-y-2">
                <Label htmlFor="cancel-reason">Motivo do Cancelamento *</Label>
                <Input
                  id="cancel-reason"
                  placeholder="Ex: Cliente desistiu, item indisponível..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setCancelOrderId(null);
                    setCancelReason("");
                  }}
                >
                  Voltar
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => {
                    if (cancelOrderId) {
                      cancelOrderMutation.mutate({ orderId: cancelOrderId, reason: cancelReason });
                    }
                  }}
                  disabled={cancelOrderMutation.isPending || !cancelReason.trim()}
                >
                  Confirmar Cancelamento
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Payment Dialog with Split Option */}
        <Dialog open={!!paymentOrder} onOpenChange={(open) => {
          if (!open) {
            setPaymentOrder(null);
            setUseSplitPayment(false);
            setPaymentSplits([{ method: "", amount: 0 }]);
            setSinglePaymentMethod("");
          }
        }}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
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

              {/* Toggle split payment */}
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant={!useSplitPayment ? "default" : "outline"}
                  onClick={() => setUseSplitPayment(false)}
                  className="flex-1"
                >
                  Pagamento Único
                </Button>
                <Button
                  variant={useSplitPayment ? "default" : "outline"}
                  onClick={() => setUseSplitPayment(true)}
                  className="flex-1"
                >
                  <Split className="h-4 w-4 mr-2" />
                  Dividir Pagamento
                </Button>
              </div>

              {!useSplitPayment ? (
                <div className="space-y-3">
                  <p className="font-semibold text-center">Forma de Pagamento</p>
                  <div className="grid grid-cols-2 gap-4">
                    {paymentMethods.map((method) => (
                      <Button
                        key={method.value}
                        type="button"
                        variant={singlePaymentMethod === method.value ? "default" : "outline"}
                        className={`h-20 flex flex-col gap-2 text-base ${
                          singlePaymentMethod === method.value ? method.color : ""
                        }`}
                        onClick={() => setSinglePaymentMethod(method.value)}
                      >
                        <method.icon className="h-8 w-8" />
                        <span className="font-bold">{method.label}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="font-semibold text-center">Dividir em múltiplas formas</p>
                  
                  {paymentSplits.map((split, index) => (
                    <div key={index} className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
                      <Select value={split.method} onValueChange={(v) => updatePaymentSplit(index, "method", v)}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Forma" />
                        </SelectTrigger>
                        <SelectContent>
                          {paymentMethods.map((m) => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="pl-10"
                          value={split.amount || ""}
                          onChange={(e) => updatePaymentSplit(index, "amount", e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                      {paymentSplits.length > 1 && (
                        <Button variant="ghost" size="icon" onClick={() => removePaymentSplit(index)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}

                  <Button variant="outline" onClick={addPaymentSplit} className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Forma de Pagamento
                  </Button>

                  <div className={`text-center p-3 rounded-lg ${Math.abs(remainingAmount) < 0.01 ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                    <p className="text-sm font-medium">
                      {Math.abs(remainingAmount) < 0.01 
                        ? "✓ Valor completo" 
                        : remainingAmount > 0 
                          ? `Faltam ${formatCurrency(remainingAmount)}`
                          : `Excedente de ${formatCurrency(Math.abs(remainingAmount))}`}
                    </p>
                  </div>
                </div>
              )}

              <Button
                className="w-full h-14 text-lg font-bold"
                onClick={handleConfirmPayment}
                disabled={closeOrderMutation.isPending || (useSplitPayment ? Math.abs(remainingAmount) > 0.01 : !singlePaymentMethod)}
              >
                <CheckCircle className="h-6 w-6 mr-2" />
                Confirmar Pagamento
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Menu View Dialog */}
        <Dialog open={showMenuDialog} onOpenChange={setShowMenuDialog}>
          <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="text-2xl flex items-center gap-2">
                <UtensilsCrossed className="h-6 w-6" />
                Cardápio
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="h-[70vh] pr-4">
              <div className="space-y-6">
                {Object.entries(groupedMenuItems || {}).map(([category, items]) => (
                  <div key={category}>
                    <h3 className="font-bold text-lg mb-3 text-primary border-b pb-2">{category}</h3>
                    <div className="grid gap-3">
                      {items.map((item) => (
                        <div key={item.id} className="flex gap-4 p-3 rounded-lg border bg-card">
                          {item.recipes?.image_url && (
                            <img 
                              src={item.recipes.image_url} 
                              alt={item.recipes?.name} 
                              className="w-20 h-20 object-cover rounded-lg"
                            />
                          )}
                          <div className="flex-1">
                            <h4 className="font-semibold">{item.recipes?.name}</h4>
                            {item.recipes?.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2">{item.recipes.description}</p>
                            )}
                            <p className="text-primary font-bold mt-1">{formatCurrency(item.sell_price)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* New Order Dialog */}
        <Dialog open={showNewOrderDialog} onOpenChange={setShowNewOrderDialog}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl">Novo Pedido</DialogTitle>
            </DialogHeader>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Menu side */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Cardápio</h3>
                <ScrollArea className="h-[50vh]">
                  <div className="space-y-4 pr-4">
                    {Object.entries(groupedMenuItems || {}).map(([category, items]) => (
                      <div key={category}>
                        <h4 className="font-medium text-muted-foreground text-sm mb-2">{category}</h4>
                        <div className="space-y-2">
                          {items.map((item) => (
                            <div 
                              key={item.id} 
                              className="flex justify-between items-center p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors" 
                              onClick={() => addToCart(item)}
                            >
                              <div>
                                <p className="font-medium">{item.recipes?.name}</p>
                                <p className="text-sm text-primary font-semibold">{formatCurrency(item.sell_price)}</p>
                              </div>
                              <Plus className="h-5 w-5 text-primary" />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Cart and details side */}
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Tipo de Pedido</Label>
                    <Select value={orderType} onValueChange={(v) => setOrderType(v as "local" | "delivery" | "takeout")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local">Mesa</SelectItem>
                        <SelectItem value="delivery">Delivery</SelectItem>
                        <SelectItem value="takeout">Retirada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {orderType === "local" && (
                    <div className="space-y-2">
                      <Label>Número da Mesa</Label>
                      <Input value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} placeholder="Ex: 5" />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label>Cliente</Label>
                      <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nome" />
                    </div>
                    <div className="space-y-2">
                      <Label>Telefone</Label>
                      <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="(00) 00000-0000" />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ShoppingCart className="h-5 w-5" />
                    <h3 className="font-semibold">Carrinho ({cart.length} itens)</h3>
                  </div>
                  {cart.length === 0 ? (
                    <p className="text-center py-4 text-muted-foreground">Carrinho vazio</p>
                  ) : (
                    <div className="space-y-2 max-h-[25vh] overflow-y-auto">
                      {cart.map((item) => (
                        <div key={item.menuItem.id} className="flex justify-between items-center p-3 rounded-lg border">
                          <div>
                            <span className="font-medium">{item.menuItem.recipes?.name}</span>
                            <p className="text-primary font-bold text-sm">{formatCurrency(item.menuItem.sell_price * item.quantity)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => updateCartQuantity(item.menuItem.id, -1)}>
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-6 text-center font-medium">{item.quantity}</span>
                            <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => updateCartQuantity(item.menuItem.id, 1)}>
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t pt-4">
                  <div className="flex justify-between items-center text-lg font-bold mb-4">
                    <span>Total:</span>
                    <span className="text-primary">{formatCurrency(cartTotal)}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={resetNewOrder}>Cancelar</Button>
                    <Button 
                      className="flex-1" 
                      onClick={() => createOrderMutation.mutate()} 
                      disabled={cart.length === 0 || createOrderMutation.isPending}
                    >
                      Criar Pedido
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
