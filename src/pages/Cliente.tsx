import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  Clock, 
  UtensilsCrossed,
  Send,
  CheckCircle,
  Phone,
  User,
  ArrowRight,
  MessageSquare,
  HandPlatter,
  Pencil,
  Receipt,
  History,
  ChefHat,
  Bell,
  XCircle,
  Loader2,
  CreditCard,
  Banknote,
  QrCode,
  Wallet,
  FileText
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
  imageUrl?: string;
  description?: string;
}

interface MenuItem {
  id: string;
  sell_price: number;
  category: string;
  is_available: boolean;
  recipes: {
    id: string;
    name: string;
    description: string | null;
    image_url: string | null;
    preparation_time: number | null;
  } | null;
}

interface OrderData {
  id: string;
  order_number: number;
  status: string;
  total: number | null;
  subtotal: number | null;
  notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  confirmed_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  paid_at: string | null;
  order_items?: {
    id: string;
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
  }[];
}

type MainTab = "menu" | "orders" | "bill";

const statusLabels: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  pending: { label: "Aguardando", color: "bg-yellow-500", icon: Clock },
  confirmed: { label: "Confirmado", color: "bg-blue-500", icon: CheckCircle },
  preparing: { label: "Preparando", color: "bg-orange-500", icon: ChefHat },
  ready: { label: "Pronto!", color: "bg-green-500", icon: Bell },
  delivered: { label: "Entregue", color: "bg-gray-500", icon: UtensilsCrossed },
  cancelled: { label: "Cancelado", color: "bg-red-500", icon: XCircle },
};

export default function Cliente() {
  const [searchParams] = useSearchParams();
  const tableNumber = searchParams.get("mesa") || "";
  const queryClient = useQueryClient();

  const [isRegistered, setIsRegistered] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("menu");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemNotes, setItemNotes] = useState("");
  const [callingWaiter, setCallingWaiter] = useState(false);
  const [editingCartItem, setEditingCartItem] = useState<string | null>(null);
  const [showCart, setShowCart] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null);
  
  // Persistent bill request state (stored in localStorage to persist across page refreshes)
  const [billRequested, setBillRequested] = useState(false);

  // Check if user already registered and load saved bill request state
  useEffect(() => {
    const savedName = localStorage.getItem(`customer_name_${tableNumber}`);
    const savedPhone = localStorage.getItem(`customer_phone_${tableNumber}`);
    const savedBillRequest = localStorage.getItem(`bill_requested_${tableNumber}`);
    
    if (savedName && savedPhone) {
      setCustomerName(savedName);
      setCustomerPhone(savedPhone);
      setIsRegistered(true);
    }
    
    if (savedBillRequest === "true") {
      setBillRequested(true);
    }
  }, [tableNumber]);

  // Fetch restaurant settings
  const { data: settings } = useQuery({
    queryKey: ["restaurant-settings-client"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_settings")
        .select("name, logo_url, primary_color")
        .limit(1)
        .single();
      if (error) return null;
      return data;
    },
  });

  // Fetch menu items
  const { data: menuItems = [], isLoading: menuLoading } = useQuery({
    queryKey: ["client-menu"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select(`
          id,
          sell_price,
          category,
          is_available,
          display_order,
          recipes:recipe_id (
            id,
            name,
            description,
            image_url,
            preparation_time
          )
        `)
        .eq("is_available", true)
        .order("category")
        .order("display_order");

      if (error) throw error;
      return data as MenuItem[];
    },
  });

  // Fetch customer orders for this table/phone (only unpaid orders to avoid showing old history)
  const { data: customerOrders = [], isLoading: ordersLoading, refetch: refetchOrders } = useQuery({
    queryKey: ["customer-orders", customerPhone, tableNumber],
    queryFn: async () => {
      if (!customerPhone) return [];
      
      let query = supabase
        .from("orders")
        .select(`
          *,
          order_items (
            id, quantity, unit_price, total_price, notes, status,
            menu_items (recipes (name))
          )
        `)
        .eq("customer_phone", customerPhone)
        .is("paid_at", null) // Only fetch unpaid orders
        .neq("status", "cancelled") // Exclude cancelled orders
        .order("created_at", { ascending: false });

      if (tableNumber) {
        query = query.eq("table_number", tableNumber);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as OrderData[];
    },
    enabled: !!customerPhone,
    refetchInterval: 5000,
  });
  
  // Check if all orders have been paid and reset the session
  useEffect(() => {
    const checkIfSessionEnded = async () => {
      if (!customerPhone || !tableNumber || !isRegistered) return;
      
      // Check if there was a bill request and now all orders are paid
      const savedBillRequest = localStorage.getItem(`bill_requested_${tableNumber}`);
      if (savedBillRequest !== "true") return;
      
      // If bill was requested and no unpaid orders remain, clear the session
      if (customerOrders.length === 0 && billRequested) {
        // Wait a bit to confirm the payment went through
        setTimeout(() => {
          localStorage.removeItem(`customer_name_${tableNumber}`);
          localStorage.removeItem(`customer_phone_${tableNumber}`);
          localStorage.removeItem(`bill_requested_${tableNumber}`);
          setIsRegistered(false);
          setCustomerName("");
          setCustomerPhone("");
          setBillRequested(false);
          setCart([]);
          toast.success("Obrigado pela visita! Volte sempre.");
        }, 2000);
      }
    };
    
    checkIfSessionEnded();
  }, [customerOrders, billRequested, customerPhone, tableNumber, isRegistered]);

  // Realtime subscription for orders
  useEffect(() => {
    if (!customerPhone) return;

    const channel = supabase
      .channel(`customer-orders-${customerPhone}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
        },
        (payload) => {
          // Immediately refetch when order status changes (especially for cancellations)
          refetchOrders();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
        },
        () => {
          refetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [customerPhone, refetchOrders]);

  // Create order mutation
  const createOrder = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Carrinho vazio");
      if (!customerPhone) throw new Error("Telefone é obrigatório");

      const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          table_number: tableNumber || null,
          customer_name: customerName || null,
          customer_phone: customerPhone,
          order_type: tableNumber ? "local" : "takeaway",
          status: "pending",
          subtotal,
          total: subtotal,
          notes: orderNotes || null,
        })
        .select("id, order_number")
        .single();

      if (orderError) throw orderError;

      const orderItems = cart.map((item) => ({
        order_id: order.id,
        menu_item_id: item.menuItemId,
        quantity: item.quantity,
        unit_price: item.price,
        total_price: item.price * item.quantity,
        notes: item.notes || null,
        status: "pending",
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItems);

      if (itemsError) throw itemsError;

      return order;
    },
    onSuccess: (order) => {
      toast.success(`Pedido #${order.order_number} enviado!`);
      setCart([]);
      setOrderNotes("");
      setShowCart(false);
      setMainTab("orders");
      queryClient.invalidateQueries({ queryKey: ["customer-orders"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar pedido");
    },
  });

  // Call waiter mutation
  const callWaiter = useMutation({
    mutationFn: async () => {
      if (!customerPhone || !tableNumber) throw new Error("Dados incompletos");
      
      const { error } = await supabase
        .from("notifications")
        .insert({
          type: "call_waiter",
          title: `Chamado da Mesa ${tableNumber}`,
          message: `${customerName || "Cliente"} está chamando o garçom`,
          priority: "high",
          target_roles: ["garcom", "admin"],
          data: {
            table_number: tableNumber,
            customer_name: customerName,
            customer_phone: customerPhone,
          },
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      setCallingWaiter(true);
      toast.success("Garçom chamado! Aguarde.");
      setTimeout(() => setCallingWaiter(false), 30000);
    },
    onError: () => {
      toast.error("Erro ao chamar garçom.");
    },
  });

  // Request bill mutation
  const requestBill = useMutation({
    mutationFn: async () => {
      if (!selectedPaymentMethod) throw new Error("Selecione uma forma de pagamento");
      if (!customerPhone || !tableNumber) throw new Error("Dados incompletos");

      const { error } = await supabase
        .from("notifications")
        .insert({
          type: "request_bill",
          title: `Conta Mesa ${tableNumber}`,
          message: `${customerName || "Cliente"} solicita conta - ${getPaymentMethodLabel(selectedPaymentMethod)}`,
          priority: "high",
          target_roles: ["garcom", "admin"],
          data: {
            table_number: tableNumber,
            customer_name: customerName,
            customer_phone: customerPhone,
            payment_method: selectedPaymentMethod,
            total: billTotal,
          },
        });

      if (error) throw error;
    },
    onSuccess: () => {
      setBillRequested(true);
      localStorage.setItem(`bill_requested_${tableNumber}`, "true");
      toast.success("Conta solicitada! O garçom trará em breve.");
      setSelectedPaymentMethod(null);
    },
    onError: () => {
      toast.error("Erro ao solicitar conta.");
    },
  });

  // Group menu items by category
  const menuByCategory = useMemo(() => {
    const grouped: Record<string, MenuItem[]> = {};
    menuItems.forEach((item) => {
      if (!grouped[item.category]) {
        grouped[item.category] = [];
      }
      grouped[item.category].push(item);
    });
    return grouped;
  }, [menuItems]);

  const categories = Object.keys(menuByCategory);

  // Calculate totals
  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Active orders (not delivered/cancelled)
  const activeOrders = customerOrders.filter(
    (o) => !["delivered", "cancelled"].includes(o.status)
  );

  // Open orders for billing (delivered and not paid)
  const openOrders = customerOrders.filter(
    (o) => o.status === "delivered" && !o.paid_at
  );

  // Bill total (only delivered and unpaid orders)
  const billTotal = openOrders.reduce((sum, o) => sum + (o.total || 0), 0);

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      pix: "PIX",
      credit: "Cartão Crédito",
      debit: "Cartão Débito",
      cash: "Dinheiro",
    };
    return labels[method] || method;
  };

  const handleRegister = () => {
    if (!customerName.trim()) {
      toast.error("Informe seu nome");
      return;
    }
    if (!customerPhone.trim() || customerPhone.length < 10) {
      toast.error("Informe um telefone válido");
      return;
    }
    
    localStorage.setItem(`customer_name_${tableNumber}`, customerName);
    localStorage.setItem(`customer_phone_${tableNumber}`, customerPhone);
    setIsRegistered(true);
  };

  const openItemDialog = (item: MenuItem) => {
    setSelectedItem(item);
    const existingItem = cart.find((c) => c.menuItemId === item.id);
    if (existingItem) {
      setItemQuantity(existingItem.quantity);
      setItemNotes(existingItem.notes);
    } else {
      setItemQuantity(1);
      setItemNotes("");
    }
  };

  const addToCartFromDialog = () => {
    if (!selectedItem?.recipes) return;

    const existingIndex = cart.findIndex((c) => c.menuItemId === selectedItem.id);
    
    if (existingIndex >= 0) {
      setCart((prev) =>
        prev.map((c, i) =>
          i === existingIndex
            ? { ...c, quantity: itemQuantity, notes: itemNotes }
            : c
        )
      );
      toast.success("Atualizado!");
    } else {
      setCart((prev) => [
        ...prev,
        {
          menuItemId: selectedItem.id,
          name: selectedItem.recipes.name,
          price: selectedItem.sell_price,
          quantity: itemQuantity,
          notes: itemNotes,
          imageUrl: selectedItem.recipes.image_url || undefined,
          description: selectedItem.recipes.description || undefined,
        },
      ]);
      toast.success("Adicionado!");
    }
    setSelectedItem(null);
  };

  const updateQuantity = (menuItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.menuItemId === menuItemId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const updateItemNotes = (menuItemId: string, notes: string) => {
    setCart((prev) =>
      prev.map((item) =>
        item.menuItemId === menuItemId ? { ...item, notes } : item
      )
    );
  };

  const removeFromCart = (menuItemId: string) => {
    setCart((prev) => prev.filter((item) => item.menuItemId !== menuItemId));
  };

  const getCartItemQuantity = (menuItemId: string) => {
    const item = cart.find((c) => c.menuItemId === menuItemId);
    return item?.quantity || 0;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  // Register screen
  if (!isRegistered) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 to-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt={settings.name} className="mx-auto h-20 w-20 object-contain mb-4" />
            ) : (
              <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <UtensilsCrossed className="w-8 h-8 text-primary" />
              </div>
            )}
            <CardTitle className="text-2xl">{settings?.name || "Bem-vindo!"}</CardTitle>
            {tableNumber && (
              <Badge variant="outline" className="mx-auto mt-2">
                Mesa {tableNumber}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-center text-muted-foreground">
              Informe seus dados para começar:
            </p>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Seu Nome
                </Label>
                <Input
                  id="name"
                  placeholder="Digite seu nome"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="h-14 text-lg"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  Telefone com DDD
                </Label>
                <Input
                  id="phone"
                  placeholder="(00) 00000-0000"
                  value={formatPhone(customerPhone)}
                  onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ""))}
                  className="h-14 text-lg"
                  maxLength={15}
                  inputMode="numeric"
                />
              </div>
            </div>

            <Button 
              className="w-full h-14 text-lg" 
              onClick={handleRegister}
            >
              Começar
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background border-b shadow-sm">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt={settings.name} className="h-10 w-10 object-contain rounded" />
              ) : (
                <UtensilsCrossed className="w-6 h-6 text-primary" />
              )}
              <div>
                <h1 className="font-bold">{settings?.name || "Cardápio"}</h1>
                <p className="text-xs text-muted-foreground">
                  {customerName} • Mesa {tableNumber}
                </p>
              </div>
            </div>
            <Button
              variant={callingWaiter ? "secondary" : "outline"}
              size="sm"
              onClick={() => callWaiter.mutate()}
              disabled={callingWaiter || callWaiter.isPending}
              className={callingWaiter ? "animate-pulse" : ""}
            >
              <HandPlatter className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto pb-20">
        {/* Menu Tab */}
        {mainTab === "menu" && (
          <div>
            {/* Category Filter */}
            <div className="sticky top-0 z-30 bg-background border-b">
              <ScrollArea className="w-full">
                <div className="px-4 py-2 flex gap-2">
                  <Button
                    variant={selectedCategory === null ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(null)}
                  >
                    Todos
                  </Button>
                  {categories.map((cat) => (
                    <Button
                      key={cat}
                      variant={selectedCategory === cat ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategory(cat)}
                      className="whitespace-nowrap"
                    >
                      {cat}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Menu Items */}
            <div className="px-4 py-4">
              {menuLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-6">
                  {(selectedCategory ? [selectedCategory] : categories).map((category) => (
                    <section key={category}>
                      <h2 className="text-lg font-bold mb-3">{category}</h2>
                      <div className="grid gap-3">
                        {menuByCategory[category]?.map((item) => {
                          const quantityInCart = getCartItemQuantity(item.id);
                          return (
                            <Card
                              key={item.id}
                              className={`overflow-hidden cursor-pointer active:scale-[0.98] transition-transform ${
                                quantityInCart > 0 ? "ring-2 ring-primary" : ""
                              }`}
                              onClick={() => openItemDialog(item)}
                            >
                              <div className="flex">
                                {item.recipes?.image_url ? (
                                  <div className="w-24 h-24 flex-shrink-0 relative">
                                    <img
                                      src={item.recipes.image_url}
                                      alt={item.recipes.name || "Item"}
                                      className="w-full h-full object-cover"
                                    />
                                    {quantityInCart > 0 && (
                                      <div className="absolute top-1 right-1 bg-primary text-primary-foreground text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                                        {quantityInCart}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="w-24 h-24 flex-shrink-0 bg-muted flex items-center justify-center relative">
                                    <UtensilsCrossed className="w-8 h-8 text-muted-foreground" />
                                    {quantityInCart > 0 && (
                                      <div className="absolute top-1 right-1 bg-primary text-primary-foreground text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                                        {quantityInCart}
                                      </div>
                                    )}
                                  </div>
                                )}
                                <CardContent className="flex-1 p-3">
                                  <h3 className="font-semibold text-sm">
                                    {item.recipes?.name || "Item"}
                                  </h3>
                                  {item.recipes?.description && (
                                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                                      {item.recipes.description}
                                    </p>
                                  )}
                                  <div className="flex items-center justify-between mt-2">
                                    <span className="text-base font-bold text-primary">
                                      {formatCurrency(item.sell_price)}
                                    </span>
                                    {item.recipes?.preparation_time && (
                                      <Badge variant="secondary" className="text-xs">
                                        <Clock className="w-3 h-3 mr-1" />
                                        {item.recipes.preparation_time}min
                                      </Badge>
                                    )}
                                  </div>
                                </CardContent>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>

            {/* Cart Button */}
            {cartCount > 0 && !showCart && (
              <div className="fixed bottom-20 left-4 right-4 z-40">
                <Button
                  className="w-full flex items-center justify-between py-6 shadow-xl"
                  onClick={() => setShowCart(true)}
                >
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5" />
                    <span className="font-bold">{cartCount} {cartCount === 1 ? "item" : "itens"}</span>
                  </div>
                  <span className="font-bold">{formatCurrency(cartTotal)}</span>
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Orders Tab */}
        {mainTab === "orders" && (
          <div className="px-4 py-4 space-y-4">
            {ordersLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : customerOrders.length === 0 ? (
              <div className="text-center py-12">
                <History className="mx-auto h-16 w-16 text-muted-foreground/50" />
                <p className="mt-4 text-muted-foreground">Nenhum pedido ainda</p>
                <Button className="mt-4" onClick={() => setMainTab("menu")}>
                  Ver Cardápio
                </Button>
              </div>
            ) : (
              <>
                {/* Active Orders */}
                {activeOrders.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="font-bold text-lg flex items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      Em andamento
                    </h2>
                    {activeOrders.map((order) => {
                      const status = statusLabels[order.status] || statusLabels.pending;
                      const StatusIcon = status.icon;
                      return (
                        <Card key={order.id} className={`border-2 ${order.status === "ready" ? "border-green-500 bg-green-50 dark:bg-green-950/30" : "border-primary/30"}`}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-full ${status.color} flex items-center justify-center ${order.status === "ready" ? "animate-pulse" : ""}`}>
                                  <StatusIcon className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                  <p className="text-2xl font-black">#{order.order_number}</p>
                                  <p className="text-sm text-muted-foreground">{formatTime(order.created_at)}</p>
                                </div>
                              </div>
                              <Badge variant={order.status === "ready" ? "default" : "secondary"} className="text-sm">
                                {status.label}
                              </Badge>
                            </div>
                            
                            {order.status === "ready" && (
                              <div className="bg-green-100 dark:bg-green-900/30 rounded-lg p-3 mb-3 text-center">
                                <Bell className="w-6 h-6 mx-auto text-green-600 animate-bounce" />
                                <p className="font-bold text-green-700 dark:text-green-400">Pronto para retirar!</p>
                              </div>
                            )}

                            <div className="space-y-1">
                              {order.order_items?.slice(0, 3).map((item) => (
                                <p key={item.id} className="text-sm">
                                  {item.quantity}x {item.menu_items?.recipes?.name || "Item"}
                                </p>
                              ))}
                              {(order.order_items?.length || 0) > 3 && (
                                <p className="text-xs text-muted-foreground">
                                  +{(order.order_items?.length || 0) - 3} mais itens
                                </p>
                              )}
                            </div>
                            
                            <div className="mt-3 pt-3 border-t flex justify-between items-center">
                              <span className="text-sm text-muted-foreground">Total</span>
                              <span className="font-bold text-primary">{formatCurrency(order.total || 0)}</span>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}

                {/* Delivered Orders (ready for billing) */}
                {customerOrders.filter((o) => o.status === "delivered").length > 0 && (
                  <div className="space-y-3">
                    <h2 className="font-bold text-lg flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      Entregues (na conta)
                    </h2>
                    {customerOrders
                      .filter((o) => o.status === "delivered")
                      .map((order) => (
                        <Card key={order.id} className="border-green-200 bg-green-50/50 dark:bg-green-950/20">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <p className="font-bold">#{order.order_number}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(order.created_at)} às {formatTime(order.created_at)}
                                </p>
                              </div>
                              <Badge variant="secondary" className="bg-green-100 text-green-700">
                                Entregue
                              </Badge>
                            </div>
                            
                            <div className="space-y-1">
                              {order.order_items?.map((item) => (
                                <p key={item.id} className="text-sm">
                                  {item.quantity}x {item.menu_items?.recipes?.name || "Item"}
                                </p>
                              ))}
                            </div>
                            
                            <div className="mt-2 pt-2 border-t flex justify-between items-center">
                              <span className="text-sm text-muted-foreground">Total</span>
                              <span className="font-bold">{formatCurrency(order.total || 0)}</span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Bill Tab */}
        {mainTab === "bill" && (
          <div className="px-4 py-4 space-y-4">
            {/* Bill Summary */}
            <Card className="border-2 border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="w-5 h-5" />
                  Resumo da Conta
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {openOrders.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    Nenhum pedido em aberto
                  </p>
                ) : (
                  <>
                    {openOrders.map((order) => (
                        <div key={order.id} className="border-b pb-3 last:border-0 last:pb-0">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-semibold">Pedido #{order.order_number}</span>
                            <Badge variant="outline" className="text-xs">
                              {formatTime(order.created_at)}
                            </Badge>
                          </div>
                          {order.order_items?.map((item) => (
                            <div key={item.id} className="flex justify-between text-sm text-muted-foreground">
                              <span>{item.quantity}x {item.menu_items?.recipes?.name || "Item"}</span>
                              <span>{formatCurrency(item.total_price)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between mt-2 font-medium">
                            <span>Subtotal</span>
                            <span>{formatCurrency(order.total || 0)}</span>
                          </div>
                        </div>
                      ))}

                    <Separator />

                    <div className="flex justify-between items-center pt-2">
                      <span className="text-xl font-bold">Total a Pagar</span>
                      <span className="text-2xl font-black text-primary">{formatCurrency(billTotal)}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Payment Method Selection */}
            {billTotal > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wallet className="w-5 h-5" />
                    Forma de Pagamento
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: "pix", label: "PIX", icon: QrCode },
                      { id: "credit", label: "Crédito", icon: CreditCard },
                      { id: "debit", label: "Débito", icon: CreditCard },
                      { id: "cash", label: "Dinheiro", icon: Banknote },
                    ].map((method) => (
                      <Button
                        key={method.id}
                        variant={selectedPaymentMethod === method.id ? "default" : "outline"}
                        className={`h-16 flex flex-col gap-1 ${selectedPaymentMethod === method.id ? "" : ""}`}
                        onClick={() => setSelectedPaymentMethod(method.id)}
                      >
                        <method.icon className="w-5 h-5" />
                        <span className="text-sm">{method.label}</span>
                      </Button>
                    ))}
                  </div>

                  <Button
                    className="w-full h-14 mt-4 text-lg"
                    disabled={!selectedPaymentMethod || billRequested || requestBill.isPending}
                    onClick={() => requestBill.mutate()}
                  >
                    {billRequested ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Aguardando Garçom...
                      </>
                    ) : (
                      <>
                        <FileText className="w-5 h-5 mr-2" />
                        Solicitar Conta
                      </>
                    )}
                  </Button>

                  {billRequested && (
                    <p className="text-center text-sm text-muted-foreground mt-3">
                      O garçom foi notificado e está vindo!
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-background border-t z-50">
        <div className="grid grid-cols-3 h-16">
          <Button
            variant="ghost"
            className={`h-full rounded-none flex flex-col gap-1 ${mainTab === "menu" ? "text-primary bg-primary/5" : ""}`}
            onClick={() => { setMainTab("menu"); setShowCart(false); }}
          >
            <UtensilsCrossed className="w-5 h-5" />
            <span className="text-xs">Cardápio</span>
          </Button>
          <Button
            variant="ghost"
            className={`h-full rounded-none flex flex-col gap-1 relative ${mainTab === "orders" ? "text-primary bg-primary/5" : ""}`}
            onClick={() => setMainTab("orders")}
          >
            <History className="w-5 h-5" />
            <span className="text-xs">Pedidos</span>
            {activeOrders.length > 0 && (
              <div className="absolute top-2 right-1/4 w-5 h-5 bg-primary text-primary-foreground text-xs font-bold rounded-full flex items-center justify-center">
                {activeOrders.length}
              </div>
            )}
          </Button>
          <Button
            variant="ghost"
            className={`h-full rounded-none flex flex-col gap-1 ${mainTab === "bill" ? "text-primary bg-primary/5" : ""}`}
            onClick={() => setMainTab("bill")}
          >
            <Receipt className="w-5 h-5" />
            <span className="text-xs">Conta</span>
          </Button>
        </div>
      </nav>

      {/* Cart Sheet */}
      <Dialog open={showCart} onOpenChange={setShowCart}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Carrinho ({cartCount})
            </DialogTitle>
          </DialogHeader>

          {cart.length === 0 ? (
            <div className="text-center py-8">
              <ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-2 text-muted-foreground">Carrinho vazio</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map((item) => (
                <div key={item.menuItemId} className="flex gap-3 pb-3 border-b">
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <h4 className="font-semibold">{item.name}</h4>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeFromCart(item.menuItemId)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-primary font-bold">{formatCurrency(item.price * item.quantity)}</p>
                    
                    <div className="flex items-center gap-2 mt-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateQuantity(item.menuItemId, -1)}
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <span className="font-medium w-8 text-center">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateQuantity(item.menuItemId, 1)}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs ml-auto"
                        onClick={() => setEditingCartItem(editingCartItem === item.menuItemId ? null : item.menuItemId)}
                      >
                        <Pencil className="w-3 h-3 mr-1" />
                        Obs.
                      </Button>
                    </div>

                    {editingCartItem === item.menuItemId && (
                      <Input
                        placeholder="Observações..."
                        value={item.notes}
                        onChange={(e) => updateItemNotes(item.menuItemId, e.target.value)}
                        className="mt-2 text-sm"
                      />
                    )}

                    {item.notes && editingCartItem !== item.menuItemId && (
                      <p className="text-xs text-muted-foreground mt-1 italic">"{item.notes}"</p>
                    )}
                  </div>
                </div>
              ))}

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Observações do pedido
                </Label>
                <Textarea
                  placeholder="Observações gerais..."
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  rows={2}
                />
              </div>

              <Separator />

              <div className="flex justify-between items-center text-lg">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-primary">{formatCurrency(cartTotal)}</span>
              </div>

              <Button
                className="w-full h-14 text-lg"
                onClick={() => createOrder.mutate()}
                disabled={createOrder.isPending}
              >
                {createOrder.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5 mr-2" />
                    Enviar Pedido
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Item Detail Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          {selectedItem?.recipes && (
            <>
              {selectedItem.recipes.image_url ? (
                <div className="relative">
                  <img
                    src={selectedItem.recipes.image_url}
                    alt={selectedItem.recipes.name}
                    className="w-full h-48 object-cover"
                  />
                  {selectedItem.recipes.preparation_time && (
                    <Badge className="absolute bottom-3 left-3">
                      <Clock className="w-3 h-3 mr-1" />
                      {selectedItem.recipes.preparation_time} min
                    </Badge>
                  )}
                </div>
              ) : (
                <div className="w-full h-24 bg-muted flex items-center justify-center">
                  <UtensilsCrossed className="w-10 h-10 text-muted-foreground" />
                </div>
              )}
              
              <div className="p-5 space-y-4">
                <DialogHeader>
                  <DialogTitle className="text-xl">{selectedItem.recipes.name}</DialogTitle>
                  {selectedItem.recipes.description && (
                    <DialogDescription className="text-base">
                      {selectedItem.recipes.description}
                    </DialogDescription>
                  )}
                </DialogHeader>

                <div className="text-2xl font-bold text-primary">
                  {formatCurrency(selectedItem.sell_price)}
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Observações
                  </Label>
                  <Textarea
                    placeholder="Ex: sem cebola, bem passado..."
                    value={itemNotes}
                    onChange={(e) => setItemNotes(e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="flex items-center justify-center gap-6 py-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 rounded-full"
                    onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))}
                  >
                    <Minus className="w-5 h-5" />
                  </Button>
                  <span className="text-2xl font-bold w-10 text-center">{itemQuantity}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 rounded-full"
                    onClick={() => setItemQuantity(itemQuantity + 1)}
                  >
                    <Plus className="w-5 h-5" />
                  </Button>
                </div>

                <Button className="w-full h-12 text-lg" onClick={addToCartFromDialog}>
                  {cart.some((c) => c.menuItemId === selectedItem.id) ? (
                    <>Atualizar • {formatCurrency(selectedItem.sell_price * itemQuantity)}</>
                  ) : (
                    <>Adicionar • {formatCurrency(selectedItem.sell_price * itemQuantity)}</>
                  )}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
