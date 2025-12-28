import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  Phone
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
  notes?: string;
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

const CATEGORY_LABELS: Record<string, string> = {
  entrada: "Entradas",
  prato_principal: "Pratos Principais",
  sobremesa: "Sobremesas",
  bebida: "Bebidas",
  acompanhamento: "Acompanhamentos",
};

export default function Cliente() {
  const [searchParams] = useSearchParams();
  const tableNumber = searchParams.get("mesa") || "";
  const queryClient = useQueryClient();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isOrderComplete, setIsOrderComplete] = useState(false);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Fetch menu items
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
      setIsOrderComplete(true);
      setCart([]);
      setIsCartOpen(false);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar pedido");
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

  const addToCart = (item: MenuItem) => {
    if (!item.recipes) return;

    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id);
      if (existing) {
        return prev.map((c) =>
          c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [
        ...prev,
        {
          menuItemId: item.id,
          name: item.recipes!.name,
          price: item.sell_price,
          quantity: 1,
        },
      ];
    });
    toast.success(`${item.recipes.name} adicionado ao carrinho`);
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

  const removeFromCart = (menuItemId: string) => {
    setCart((prev) => prev.filter((item) => item.menuItemId !== menuItemId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (isOrderComplete) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Pedido Enviado!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Seu pedido foi recebido e está sendo preparado.
            </p>
            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">Número do Pedido</p>
              <p className="text-3xl font-bold">#{orderNumber}</p>
            </div>
            {tableNumber && (
              <p className="text-sm text-muted-foreground">
                Mesa: <span className="font-semibold">{tableNumber}</span>
              </p>
            )}
            <Button
              className="w-full"
              onClick={() => {
                setIsOrderComplete(false);
                setOrderNumber(null);
                setCustomerName("");
                setCustomerPhone("");
                setOrderNotes("");
              }}
            >
              Fazer Novo Pedido
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background border-b">
        <div className="container max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="w-6 h-6 text-primary" />
              <div>
                <h1 className="font-bold text-lg">Cardápio</h1>
                {tableNumber && (
                  <p className="text-xs text-muted-foreground">Mesa {tableNumber}</p>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="relative"
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingCart className="w-5 h-5" />
              {cartCount > 0 && (
                <Badge
                  className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
                >
                  {cartCount}
                </Badge>
              )}
            </Button>
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
                {CATEGORY_LABELS[cat] || cat}
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
        ) : (
          <div className="space-y-8">
            {(selectedCategory ? [selectedCategory] : categories).map((category) => (
              <section key={category}>
                <h2 className="text-lg font-semibold mb-4">
                  {CATEGORY_LABELS[category] || category}
                </h2>
                <div className="grid gap-4">
                  {menuByCategory[category]?.map((item) => (
                    <Card
                      key={item.id}
                      className="overflow-hidden hover:shadow-md transition-shadow"
                    >
                      <div className="flex">
                        {item.recipes?.image_url && (
                          <div className="w-24 h-24 flex-shrink-0">
                            <img
                              src={item.recipes.image_url}
                              alt={item.recipes.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <CardContent className="flex-1 p-3 flex flex-col justify-between">
                          <div>
                            <h3 className="font-medium text-sm">
                              {item.recipes?.name}
                            </h3>
                            {item.recipes?.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                                {item.recipes.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-primary">
                                {formatCurrency(item.sell_price)}
                              </span>
                              {item.recipes?.preparation_time && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {item.recipes.preparation_time}min
                                </span>
                              )}
                            </div>
                            <Button size="sm" onClick={() => addToCart(item)}>
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </div>
                    </Card>
                  ))}
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
            className="w-full max-w-2xl mx-auto flex items-center justify-between py-6"
            onClick={() => setIsCartOpen(true)}
          >
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              <span>{cartCount} {cartCount === 1 ? "item" : "itens"}</span>
            </div>
            <span className="font-semibold">{formatCurrency(cartTotal)}</span>
          </Button>
        </div>
      )}

      {/* Cart Dialog */}
      <Dialog open={isCartOpen} onOpenChange={setIsCartOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Seu Pedido
            </DialogTitle>
            <DialogDescription>
              {tableNumber ? `Mesa ${tableNumber}` : "Revise seu pedido"}
            </DialogDescription>
          </DialogHeader>

          {cart.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              Seu carrinho está vazio
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1 max-h-[40vh]">
                <div className="space-y-4 pr-4">
                  {cart.map((item) => (
                    <div key={item.menuItemId} className="flex items-center gap-3">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{item.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatCurrency(item.price)} cada
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateQuantity(item.menuItemId, -1)}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-6 text-center font-medium">
                          {item.quantity}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateQuantity(item.menuItemId, 1)}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => removeFromCart(item.menuItemId)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <Separator />

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    placeholder="Seu nome"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Telefone *"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="pl-9"
                      required
                    />
                  </div>
                </div>
                <Textarea
                  placeholder="Observações do pedido..."
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  rows={2}
                />

                <div className="flex items-center justify-between text-lg font-semibold">
                  <span>Total</span>
                  <span className="text-primary">{formatCurrency(cartTotal)}</span>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => createOrder.mutate()}
                  disabled={createOrder.isPending || !customerPhone}
                >
                  {createOrder.isPending ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Enviar Pedido
                    </>
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
