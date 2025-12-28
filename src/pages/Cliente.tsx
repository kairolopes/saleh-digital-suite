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
  ArrowLeft,
  MessageSquare,
  HandPlatter,
  Eye,
  Pencil
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { OrderTracking } from "@/components/OrderTracking";

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

type Step = "register" | "menu" | "cart" | "success" | "tracking";

export default function Cliente() {
  const [searchParams] = useSearchParams();
  const tableNumber = searchParams.get("mesa") || "";
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("register");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemNotes, setItemNotes] = useState("");
  const [callingWaiter, setCallingWaiter] = useState(false);
  const [editingCartItem, setEditingCartItem] = useState<string | null>(null);

  // Check if user already registered (localStorage)
  useEffect(() => {
    const savedName = localStorage.getItem(`customer_name_${tableNumber}`);
    const savedPhone = localStorage.getItem(`customer_phone_${tableNumber}`);
    if (savedName && savedPhone) {
      setCustomerName(savedName);
      setCustomerPhone(savedPhone);
      setStep("menu");
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

  // Fetch menu items with recipes
  const { data: menuItems = [], isLoading } = useQuery({
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
          recipes (
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

  // Create order mutation
  const createOrder = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Carrinho vazio");
      if (!customerPhone) throw new Error("Telefone é obrigatório");

      const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

      // Create order
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

      // Create order items
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
      setOrderNumber(order.order_number);
      setOrderId(order.id);
      setStep("tracking");
      setCart([]);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
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
      toast.success("Garçom chamado! Aguarde um momento.");
      setTimeout(() => setCallingWaiter(false), 30000);
    },
    onError: () => {
      toast.error("Erro ao chamar garçom. Tente novamente.");
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

  const handleRegister = () => {
    if (!customerName.trim()) {
      toast.error("Por favor, informe seu nome");
      return;
    }
    if (!customerPhone.trim() || customerPhone.length < 10) {
      toast.error("Por favor, informe um telefone válido com DDD");
      return;
    }
    
    localStorage.setItem(`customer_name_${tableNumber}`, customerName);
    localStorage.setItem(`customer_phone_${tableNumber}`, customerPhone);
    
    setStep("menu");
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
      toast.success(`${selectedItem.recipes.name} atualizado no carrinho`);
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
      toast.success(`${selectedItem.recipes.name} adicionado ao carrinho`);
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

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

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

  // Step: Register
  if (step === "register") {
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
              Para começar seu pedido, por favor informe seus dados:
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
                  className="h-12"
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
                  className="h-12"
                  maxLength={15}
                />
              </div>
            </div>

            <Button 
              className="w-full h-12 text-lg" 
              onClick={handleRegister}
            >
              Ver Cardápio
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step: Tracking
  if (step === "tracking" && orderNumber) {
    return (
      <OrderTracking
        orderNumber={orderNumber}
        customerName={customerName}
        tableNumber={tableNumber}
        onNewOrder={() => {
          setStep("menu");
          setOrderNumber(null);
          setOrderId(null);
          setOrderNotes("");
        }}
        onBack={() => setStep("menu")}
      />
    );
  }

  // Step: Success (fallback)
  if (step === "success") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4 animate-pulse">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Pedido Enviado!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Seu pedido foi recebido e está sendo analisado pela cozinha.
            </p>
            <div className="bg-muted p-6 rounded-lg">
              <p className="text-sm text-muted-foreground">Número do Pedido</p>
              <p className="text-4xl font-bold text-primary">#{orderNumber}</p>
            </div>
            {tableNumber && (
              <p className="text-sm text-muted-foreground">
                Mesa: <span className="font-semibold">{tableNumber}</span>
              </p>
            )}
            <div className="flex flex-col gap-2">
              <Button
                className="w-full"
                onClick={() => setStep("tracking")}
              >
                <Eye className="w-4 h-4 mr-2" />
                Acompanhar Pedido
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setStep("menu");
                  setOrderNumber(null);
                  setOrderNotes("");
                }}
              >
                Fazer Novo Pedido
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step: Cart
  if (step === "cart") {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-background border-b">
          <div className="container max-w-2xl mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setStep("menu")}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="font-bold text-lg">Resumo do Pedido</h1>
                <p className="text-xs text-muted-foreground">{customerName} - Mesa {tableNumber}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="container max-w-2xl mx-auto px-4 py-6 pb-32">
          {cart.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingCart className="mx-auto h-16 w-16 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">Seu carrinho está vazio</p>
              <Button className="mt-4" onClick={() => setStep("menu")}>
                Ver Cardápio
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map((item) => (
                <Card key={item.menuItemId} className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="flex">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-24 h-24 object-cover"
                        />
                      ) : (
                        <div className="w-24 h-24 bg-muted flex items-center justify-center">
                          <UtensilsCrossed className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 p-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-semibold">{item.name}</h3>
                            <p className="text-primary font-bold">
                              {formatCurrency(item.price * item.quantity)}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => removeFromCart(item.menuItemId)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-2">
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
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => setEditingCartItem(editingCartItem === item.menuItemId ? null : item.menuItemId)}
                          >
                            <Pencil className="w-3 h-3 mr-1" />
                            {item.notes ? "Editar obs." : "Adicionar obs."}
                          </Button>
                        </div>

                        {editingCartItem === item.menuItemId && (
                          <div className="mt-2">
                            <Input
                              placeholder="Ex: sem cebola, bem passado..."
                              value={item.notes}
                              onChange={(e) => updateItemNotes(item.menuItemId, e.target.value)}
                              className="text-sm"
                            />
                          </div>
                        )}

                        {item.notes && editingCartItem !== item.menuItemId && (
                          <p className="text-xs text-muted-foreground mt-2 italic">
                            "{item.notes}"
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              <Separator />

              <div className="space-y-2">
                <Label>Observações gerais do pedido</Label>
                <Textarea
                  placeholder="Alguma observação adicional?"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
        </main>

        {/* Fixed Bottom */}
        {cart.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 shadow-lg">
            <div className="container max-w-2xl mx-auto">
              <div className="flex justify-between items-center mb-4">
                <span className="text-lg font-semibold">Total</span>
                <span className="text-2xl font-bold text-primary">{formatCurrency(cartTotal)}</span>
              </div>
              <Button
                className="w-full h-14 text-lg"
                onClick={() => createOrder.mutate()}
                disabled={createOrder.isPending}
              >
                {createOrder.isPending ? (
                  "Enviando..."
                ) : (
                  <>
                    <Send className="mr-2 w-5 h-5" />
                    Enviar Pedido
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Step: Menu
  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background border-b shadow-sm">
        <div className="container max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt={settings.name} className="h-10 w-10 object-contain rounded" />
              ) : (
                <UtensilsCrossed className="w-6 h-6 text-primary" />
              )}
              <div>
                <h1 className="font-bold text-lg">{settings?.name || "Cardápio"}</h1>
                <p className="text-xs text-muted-foreground">
                  {customerName} {tableNumber && `• Mesa ${tableNumber}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={callingWaiter ? "secondary" : "outline"}
                size="sm"
                onClick={() => callWaiter.mutate()}
                disabled={callingWaiter || callWaiter.isPending}
                className={callingWaiter ? "animate-pulse" : ""}
              >
                <HandPlatter className="w-4 h-4 mr-1" />
                {callingWaiter ? "Chamando..." : "Garçom"}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Category Filter */}
      <div className="sticky top-[73px] z-30 bg-background border-b">
        <ScrollArea className="w-full">
          <div className="container max-w-2xl mx-auto px-4 py-2 flex gap-2">
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
      <main className="container max-w-2xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : menuItems.length === 0 ? (
          <div className="text-center py-12">
            <UtensilsCrossed className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">
              Nenhum item disponível no cardápio no momento.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {(selectedCategory ? [selectedCategory] : categories).map((category) => (
              <section key={category}>
                <h2 className="text-xl font-bold mb-4 text-foreground">
                  {category}
                </h2>
                <div className="grid gap-3">
                  {menuByCategory[category]?.map((item) => {
                    const quantityInCart = getCartItemQuantity(item.id);
                    return (
                      <Card
                        key={item.id}
                        className={`overflow-hidden transition-all cursor-pointer hover:shadow-md ${
                          quantityInCart > 0 ? "ring-2 ring-primary" : ""
                        }`}
                        onClick={() => openItemDialog(item)}
                      >
                        <div className="flex">
                          {item.recipes?.image_url ? (
                            <div className="w-28 h-28 flex-shrink-0 relative">
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
                            <div className="w-28 h-28 flex-shrink-0 bg-muted flex items-center justify-center relative">
                              <UtensilsCrossed className="w-8 h-8 text-muted-foreground" />
                              {quantityInCart > 0 && (
                                <div className="absolute top-1 right-1 bg-primary text-primary-foreground text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                                  {quantityInCart}
                                </div>
                              )}
                            </div>
                          )}
                          <CardContent className="flex-1 p-4 flex flex-col justify-between">
                            <div>
                              <h3 className="font-semibold text-foreground">
                                {item.recipes?.name || "Item sem nome"}
                              </h3>
                              {item.recipes?.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                  {item.recipes.description}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-lg font-bold text-primary">
                                {formatCurrency(item.sell_price)}
                              </span>
                              {item.recipes?.preparation_time && (
                                <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                                  <Clock className="w-3 h-3" />
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
      </main>

      {/* Fixed Cart Button */}
      {cartCount > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-50">
          <Button
            className="w-full max-w-2xl mx-auto flex items-center justify-between py-6 shadow-xl"
            onClick={() => setStep("cart")}
          >
            <div className="flex items-center gap-2">
              <div className="bg-primary-foreground/20 rounded-full px-3 py-1">
                <span className="font-bold">{cartCount}</span>
              </div>
              <span>Ver Carrinho</span>
            </div>
            <span className="font-bold text-lg">{formatCurrency(cartTotal)}</span>
          </Button>
        </div>
      )}

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
                    className="w-full h-56 object-cover"
                  />
                  {selectedItem.recipes.preparation_time && (
                    <Badge className="absolute bottom-3 left-3 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {selectedItem.recipes.preparation_time} min
                    </Badge>
                  )}
                </div>
              ) : (
                <div className="w-full h-32 bg-muted flex items-center justify-center">
                  <UtensilsCrossed className="w-12 h-12 text-muted-foreground" />
                </div>
              )}
              
              <div className="p-6 space-y-4">
                <DialogHeader>
                  <DialogTitle className="text-2xl">{selectedItem.recipes.name}</DialogTitle>
                  {selectedItem.recipes.description && (
                    <DialogDescription className="text-base text-muted-foreground">
                      {selectedItem.recipes.description}
                    </DialogDescription>
                  )}
                </DialogHeader>

                <div className="text-3xl font-bold text-primary">
                  {formatCurrency(selectedItem.sell_price)}
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Observações
                  </Label>
                  <Textarea
                    placeholder="Ex: sem cebola, bem passado, ponto da carne..."
                    value={itemNotes}
                    onChange={(e) => setItemNotes(e.target.value)}
                    rows={2}
                    className="resize-none"
                  />
                </div>

                <div className="flex items-center justify-center gap-6 py-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-14 w-14 rounded-full"
                    onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))}
                  >
                    <Minus className="w-6 h-6" />
                  </Button>
                  <span className="text-3xl font-bold w-12 text-center">{itemQuantity}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-14 w-14 rounded-full"
                    onClick={() => setItemQuantity(itemQuantity + 1)}
                  >
                    <Plus className="w-6 h-6" />
                  </Button>
                </div>

                <Button className="w-full h-14 text-lg" onClick={addToCartFromDialog}>
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
