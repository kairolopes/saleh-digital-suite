import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWaiterNotifications } from "@/hooks/useWaiterNotifications";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Minus, ShoppingCart, Clock, CheckCircle, XCircle, Trash2, Volume2, VolumeX, Bell } from "lucide-react";

interface MenuItem {
  id: string;
  recipe_id: string;
  sell_price: number;
  category: string;
  is_available: boolean;
  recipes?: {
    name: string;
    description: string | null;
  } | null;
}

interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes: string | null;
  status: string | null;
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
  subtotal: number | null;
  discount: number | null;
  total: number | null;
  notes: string | null;
  created_at: string;
  order_items?: OrderItem[];
}

const orderStatuses = {
  pending: { label: "Pendente", color: "bg-yellow-500" },
  confirmed: { label: "Confirmado", color: "bg-blue-500" },
  preparing: { label: "Preparando", color: "bg-orange-500" },
  ready: { label: "Pronto", color: "bg-green-500" },
  delivered: { label: "Entregue", color: "bg-gray-500" },
  cancelled: { label: "Cancelado", color: "bg-red-500" },
};

export default function Pedidos() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderType, setOrderType] = useState<"local" | "delivery" | "takeout">("local");
  const [tableNumber, setTableNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [cart, setCart] = useState<{ menuItem: MenuItem; quantity: number; notes: string }[]>([]);
  const [activeTab, setActiveTab] = useState("active");
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Real-time notifications for when orders are ready
  useWaiterNotifications({
    enabled: true,
    playSound: soundEnabled,
    onOrderReady: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  // Fetch menu items
  const { data: menuItems } = useQuery({
    queryKey: ["menu-items-available"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select(`
          *,
          recipes (name, description)
        `)
        .eq("is_available", true)
        .order("category");
      if (error) throw error;
      return data as MenuItem[];
    },
  });

  // Fetch orders
  const { data: orders, isLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          order_items (
            *,
            menu_items (
              *,
              recipes (name)
            )
          )
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Order[];
    },
  });

  // Create order
  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Carrinho vazio");

      const subtotal = cart.reduce(
        (sum, item) => sum + item.menuItem.sell_price * item.quantity,
        0
      );

      const { data: newOrder, error: orderError } = await supabase
        .from("orders")
        .insert({
          order_type: orderType,
          table_number: orderType === "local" ? tableNumber : null,
          customer_name: customerName || null,
          customer_phone: customerPhone || null,
          notes: orderNotes || null,
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

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItems);

      if (itemsError) throw itemsError;

      return newOrder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast({ title: "Pedido criado com sucesso!" });
      resetNewOrder();
    },
    onError: (error) => {
      console.error(error);
      toast({ title: "Erro ao criar pedido", variant: "destructive" });
    },
  });

  // Update order status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const { error } = await supabase
        .from("orders")
        .update({ status })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast({ title: "Status atualizado!" });
      setSelectedOrder(null);
    },
    onError: () => {
      toast({ title: "Erro ao atualizar status", variant: "destructive" });
    },
  });

  const resetNewOrder = () => {
    setCart([]);
    setOrderType("local");
    setTableNumber("");
    setCustomerName("");
    setCustomerPhone("");
    setOrderNotes("");
    setIsNewOrderOpen(false);
  };

  const addToCart = (menuItem: MenuItem) => {
    const existing = cart.find((item) => item.menuItem.id === menuItem.id);
    if (existing) {
      setCart(
        cart.map((item) =>
          item.menuItem.id === menuItem.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setCart([...cart, { menuItem, quantity: 1, notes: "" }]);
    }
  };

  const updateCartQuantity = (menuItemId: string, delta: number) => {
    setCart(
      cart
        .map((item) =>
          item.menuItem.id === menuItemId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const updateCartNotes = (menuItemId: string, notes: string) => {
    setCart(
      cart.map((item) =>
        item.menuItem.id === menuItemId ? { ...item, notes } : item
      )
    );
  };

  const cartTotal = cart.reduce(
    (sum, item) => sum + item.menuItem.sell_price * item.quantity,
    0
  );

  const activeOrders = orders?.filter(
    (o) => !["delivered", "cancelled"].includes(o.status)
  );
  const completedOrders = orders?.filter((o) =>
    ["delivered", "cancelled"].includes(o.status)
  );

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Group menu items by category
  const groupedMenuItems = menuItems?.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  return (
    <AppLayout requiredRoles={["admin", "garcom", "cozinha"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Pedidos</h1>
            <p className="text-muted-foreground">
              Gerencie os pedidos do restaurante
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Som</span>
              <Switch
                checked={soundEnabled}
                onCheckedChange={setSoundEnabled}
              />
              {soundEnabled ? (
                <Volume2 className="h-4 w-4 text-green-500" />
              ) : (
                <VolumeX className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <Button onClick={() => setIsNewOrderOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Pedido
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pendentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {orders?.filter((o) => o.status === "pending").length || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Preparando
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {orders?.filter((o) => o.status === "preparing").length || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Prontos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {orders?.filter((o) => o.status === "ready").length || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Hoje
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {formatCurrency(
                  orders
                    ?.filter(
                      (o) =>
                        new Date(o.created_at).toDateString() ===
                        new Date().toDateString()
                    )
                    .reduce((sum, o) => sum + (o.total || 0), 0) || 0
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Orders Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="active">
              Ativos ({activeOrders?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="completed">
              Finalizados ({completedOrders?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4">
            {isLoading ? (
              <p className="text-center py-8 text-muted-foreground">
                Carregando...
              </p>
            ) : !activeOrders?.length ? (
              <p className="text-center py-8 text-muted-foreground">
                Nenhum pedido ativo
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {activeOrders.map((order) => (
                  <Card
                    key={order.id}
                    className={`cursor-pointer hover:shadow-lg transition-all ${
                      order.status === "ready" 
                        ? "ring-2 ring-green-500 animate-pulse shadow-lg shadow-green-500/20" 
                        : ""
                    }`}
                    onClick={() => setSelectedOrder(order)}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-lg">
                            #{order.order_number}
                          </span>
                          {order.status === "ready" && (
                            <span className="relative flex h-3 w-3">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                            </span>
                          )}
                          {order.table_number && (
                            <Badge variant="outline" className="ml-1">
                              Mesa {order.table_number}
                            </Badge>
                          )}
                        </div>
                        <Badge
                          className={`${
                            orderStatuses[order.status as keyof typeof orderStatuses]
                              ?.color
                          } text-white`}
                        >
                          {
                            orderStatuses[order.status as keyof typeof orderStatuses]
                              ?.label
                          }
                        </Badge>
                      </div>
                      <div className="space-y-1 text-sm">
                        {order.order_items?.slice(0, 3).map((item) => (
                          <p key={item.id} className="text-muted-foreground">
                            {item.quantity}x{" "}
                            {item.menu_items?.recipes?.name || "Item"}
                          </p>
                        ))}
                        {(order.order_items?.length || 0) > 3 && (
                          <p className="text-muted-foreground">
                            +{(order.order_items?.length || 0) - 3} itens
                          </p>
                        )}
                      </div>
                      <div className="flex justify-between items-center mt-3 pt-3 border-t">
                        <span className="text-sm text-muted-foreground flex items-center">
                          <Clock className="h-4 w-4 mr-1" />
                          {formatTime(order.created_at)}
                        </span>
                        <span className="font-bold text-primary">
                          {formatCurrency(order.total || 0)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-4">
            {!completedOrders?.length ? (
              <p className="text-center py-8 text-muted-foreground">
                Nenhum pedido finalizado
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {completedOrders.slice(0, 12).map((order) => (
                  <Card key={order.id} className="opacity-75">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <span className="font-bold">#{order.order_number}</span>
                        <Badge
                          className={`${
                            orderStatuses[order.status as keyof typeof orderStatuses]
                              ?.color
                          } text-white`}
                        >
                          {
                            orderStatuses[order.status as keyof typeof orderStatuses]
                              ?.label
                          }
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-sm text-muted-foreground">
                          {formatTime(order.created_at)}
                        </span>
                        <span className="font-medium">
                          {formatCurrency(order.total || 0)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* New Order Dialog */}
        <Dialog open={isNewOrderOpen} onOpenChange={setIsNewOrderOpen}>
          <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Novo Pedido</DialogTitle>
            </DialogHeader>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Menu */}
              <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                <h3 className="font-semibold text-lg">Cardápio</h3>
                {Object.entries(groupedMenuItems || {}).map(([category, items]) => (
                  <div key={category}>
                    <h4 className="font-medium text-muted-foreground text-sm mb-2">
                      {category}
                    </h4>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="flex justify-between items-center p-2 rounded-lg border hover:bg-muted/50 cursor-pointer"
                          onClick={() => addToCart(item)}
                        >
                          <div>
                            <p className="font-medium">{item.recipes?.name}</p>
                            <p className="text-sm text-primary">
                              {formatCurrency(item.sell_price)}
                            </p>
                          </div>
                          <Plus className="h-5 w-5 text-primary" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Cart & Order Details */}
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Tipo de Pedido</Label>
                    <Select
                      value={orderType}
                      onValueChange={(v) =>
                        setOrderType(v as "local" | "delivery" | "takeout")
                      }
                    >
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
                      <Input
                        value={tableNumber}
                        onChange={(e) => setTableNumber(e.target.value)}
                        placeholder="Ex: 5"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label>Cliente (opcional)</Label>
                      <Input
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Nome"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Telefone (opcional)</Label>
                      <Input
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ShoppingCart className="h-5 w-5" />
                    <h3 className="font-semibold">
                      Carrinho ({cart.length} itens)
                    </h3>
                  </div>

                  {cart.length === 0 ? (
                    <p className="text-center py-4 text-muted-foreground">
                      Carrinho vazio
                    </p>
                  ) : (
                    <div className="space-y-3 max-h-[30vh] overflow-y-auto">
                      {cart.map((item) => (
                        <div
                          key={item.menuItem.id}
                          className="flex flex-col gap-2 p-3 rounded-lg border"
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium">
                              {item.menuItem.recipes?.name}
                            </span>
                            <span className="text-primary font-bold">
                              {formatCurrency(
                                item.menuItem.sell_price * item.quantity
                              )}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() =>
                                  updateCartQuantity(item.menuItem.id, -1)
                                }
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-8 text-center">
                                {item.quantity}
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() =>
                                  updateCartQuantity(item.menuItem.id, 1)
                                }
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                            <Input
                              placeholder="Observação"
                              className="w-32 h-7 text-xs"
                              value={item.notes}
                              onChange={(e) =>
                                updateCartNotes(item.menuItem.id, e.target.value)
                              }
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Observações do Pedido</Label>
                  <Textarea
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    placeholder="Observações gerais..."
                    rows={2}
                  />
                </div>

                <div className="border-t pt-4">
                  <div className="flex justify-between items-center text-lg font-bold mb-4">
                    <span>Total:</span>
                    <span className="text-primary">
                      {formatCurrency(cartTotal)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={resetNewOrder}
                    >
                      Cancelar
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => createOrderMutation.mutate()}
                      disabled={
                        cart.length === 0 || createOrderMutation.isPending
                      }
                    >
                      Criar Pedido
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Order Details Dialog */}
        <Dialog
          open={!!selectedOrder}
          onOpenChange={(open) => !open && setSelectedOrder(null)}
        >
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                Pedido #{selectedOrder?.order_number}
                {selectedOrder?.table_number && (
                  <Badge variant="outline" className="ml-2">
                    Mesa {selectedOrder.table_number}
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge
                    className={`${
                      orderStatuses[selectedOrder.status as keyof typeof orderStatuses]
                        ?.color
                    } text-white`}
                  >
                    {
                      orderStatuses[selectedOrder.status as keyof typeof orderStatuses]
                        ?.label
                    }
                  </Badge>
                </div>

                <div className="border rounded-lg divide-y">
                  {selectedOrder.order_items?.map((item) => (
                    <div key={item.id} className="p-3 flex justify-between">
                      <div>
                        <span className="font-medium">
                          {item.quantity}x {item.menu_items?.recipes?.name}
                        </span>
                        {item.notes && (
                          <p className="text-xs text-muted-foreground">
                            {item.notes}
                          </p>
                        )}
                      </div>
                      <span className="text-primary font-medium">
                        {formatCurrency(item.total_price)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                  <span>Total:</span>
                  <span className="text-primary">
                    {formatCurrency(selectedOrder.total || 0)}
                  </span>
                </div>

                {selectedOrder.notes && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-sm text-muted-foreground">
                      <strong>Obs:</strong> {selectedOrder.notes}
                    </p>
                  </div>
                )}

                {/* Status Actions */}
                <div className="grid grid-cols-2 gap-2 pt-4 border-t">
                  {selectedOrder.status === "pending" && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() =>
                          updateStatusMutation.mutate({
                            orderId: selectedOrder.id,
                            status: "cancelled",
                          })
                        }
                        className="text-destructive"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Cancelar
                      </Button>
                      <Button
                        onClick={() =>
                          updateStatusMutation.mutate({
                            orderId: selectedOrder.id,
                            status: "confirmed",
                          })
                        }
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Confirmar
                      </Button>
                    </>
                  )}
                  {selectedOrder.status === "confirmed" && (
                    <Button
                      className="col-span-2"
                      onClick={() =>
                        updateStatusMutation.mutate({
                          orderId: selectedOrder.id,
                          status: "preparing",
                        })
                      }
                    >
                      Enviar para Cozinha
                    </Button>
                  )}
                  {selectedOrder.status === "ready" && (
                    <Button
                      className="col-span-2"
                      onClick={() =>
                        updateStatusMutation.mutate({
                          orderId: selectedOrder.id,
                          status: "delivered",
                        })
                      }
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Marcar como Entregue
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
