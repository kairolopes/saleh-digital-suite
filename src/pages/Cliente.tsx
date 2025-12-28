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
  MessageSquare
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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

const CATEGORY_LABELS: Record<string, string> = {
  entrada: "Entradas",
  prato_principal: "Pratos Principais",
  sobremesa: "Sobremesas",
  bebida: "Bebidas",
  acompanhamento: "Acompanhamentos",
};

type Step = "register" | "menu" | "cart" | "success";

export default function Cliente() {
  const [searchParams] = useSearchParams();
  const tableNumber = searchParams.get("mesa") || "";
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("register");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemNotes, setItemNotes] = useState("");

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
      setStep("success");
      setCart([]);
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

  const handleRegister = () => {
    if (!customerName.trim()) {
      toast.error("Por favor, informe seu nome");
      return;
    }
    if (!customerPhone.trim() || customerPhone.length < 10) {
      toast.error("Por favor, informe um telefone válido com DDD");
      return;
    }
    
    // Save to localStorage
    localStorage.setItem(`customer_name_${tableNumber}`, customerName);
    localStorage.setItem(`customer_phone_${tableNumber}`, customerPhone);
    
    setStep("menu");
  };

  const openItemDialog = (item: MenuItem) => {
    setSelectedItem(item);
    setItemQuantity(1);
    setItemNotes("");
  };

  const addToCartFromDialog = () => {
    if (!selectedItem?.recipes) return;

    const existingIndex = cart.findIndex((c) => c.menuItemId === selectedItem.id);
    
    if (existingIndex >= 0) {
      setCart((prev) =>
        prev.map((c, i) =>
          i === existingIndex
            ? { ...c, quantity: c.quantity + itemQuantity, notes: itemNotes || c.notes }
            : c
        )
      );
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
    }
    
    toast.success(`${selectedItem.recipes.name} adicionado ao carrinho`);
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
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <UtensilsCrossed className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Bem-vindo!</CardTitle>
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

  // Step: Success
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
            <p className="text-sm text-muted-foreground">
              Você receberá notificações sobre o status do seu pedido.
            </p>
            <Button
              className="w-full"
              onClick={() => {
                setStep("menu");
                setOrderNumber(null);
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
                <Card key={item.menuItemId}>
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-20 h-20 rounded-lg object-cover"
                        />
                      )}
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <h3 className="font-semibold">{item.name}</h3>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => removeFromCart(item.menuItemId)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <p className="text-primary font-semibold mt-1">
                          {formatCurrency(item.price * item.quantity)}
                        </p>
                        
                        <div className="flex items-center gap-3 mt-3">
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

                        <div className="mt-3">
                          <Input
                            placeholder="Observações (ex: sem cebola)"
                            value={item.notes}
                            onChange={(e) => updateItemNotes(item.menuItemId, e.target.value)}
                            className="text-sm"
                          />
                        </div>
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
          <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4">
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
      <header className="sticky top-0 z-40 bg-background border-b">
        <div className="container max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="w-6 h-6 text-primary" />
              <div>
                <h1 className="font-bold text-lg">Cardápio</h1>
                <p className="text-xs text-muted-foreground">
                  {customerName} {tableNumber && `• Mesa ${tableNumber}`}
                </p>
              </div>
            </div>
            {cartCount > 0 && (
              <Button
                variant="default"
                size="sm"
                className="relative"
                onClick={() => setStep("cart")}
              >
                <ShoppingCart className="w-5 h-5 mr-2" />
                {cartCount}
              </Button>
            )}
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
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  {CATEGORY_LABELS[category] || category}
                </h2>
                <div className="grid gap-4">
                  {menuByCategory[category]?.map((item) => (
                    <Card
                      key={item.id}
                      className="overflow-hidden hover:shadow-lg transition-all cursor-pointer"
                      onClick={() => openItemDialog(item)}
                    >
                      <div className="flex">
                        {item.recipes?.image_url ? (
                          <div className="w-28 h-28 flex-shrink-0">
                            <img
                              src={item.recipes.image_url}
                              alt={item.recipes.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-28 h-28 flex-shrink-0 bg-muted flex items-center justify-center">
                            <UtensilsCrossed className="w-8 h-8 text-muted-foreground" />
                          </div>
                        )}
                        <CardContent className="flex-1 p-4 flex flex-col justify-between">
                          <div>
                            <h3 className="font-semibold">{item.recipes?.name}</h3>
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
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {item.recipes.preparation_time}min
                              </span>
                            )}
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
            className="w-full max-w-2xl mx-auto flex items-center justify-between py-6 shadow-lg"
            onClick={() => setStep("cart")}
          >
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              <span>{cartCount} {cartCount === 1 ? "item" : "itens"}</span>
            </div>
            <span className="font-bold text-lg">{formatCurrency(cartTotal)}</span>
          </Button>
        </div>
      )}

      {/* Item Detail Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-w-md">
          {selectedItem?.recipes && (
            <>
              {selectedItem.recipes.image_url && (
                <div className="-mx-6 -mt-6 mb-4">
                  <img
                    src={selectedItem.recipes.image_url}
                    alt={selectedItem.recipes.name}
                    className="w-full h-48 object-cover rounded-t-lg"
                  />
                </div>
              )}
              <DialogHeader>
                <DialogTitle className="text-xl">{selectedItem.recipes.name}</DialogTitle>
                <DialogDescription className="text-base">
                  {selectedItem.recipes.description}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-primary">
                    {formatCurrency(selectedItem.sell_price)}
                  </span>
                  {selectedItem.recipes.preparation_time && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {selectedItem.recipes.preparation_time} min
                    </Badge>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Observações
                  </Label>
                  <Textarea
                    placeholder="Ex: sem cebola, bem passado, etc."
                    value={itemNotes}
                    onChange={(e) => setItemNotes(e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-12 w-12"
                    onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))}
                  >
                    <Minus className="w-5 h-5" />
                  </Button>
                  <span className="text-2xl font-bold w-12 text-center">{itemQuantity}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-12 w-12"
                    onClick={() => setItemQuantity(itemQuantity + 1)}
                  >
                    <Plus className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              <DialogFooter>
                <Button className="w-full h-12" onClick={addToCartFromDialog}>
                  <Plus className="w-5 h-5 mr-2" />
                  Adicionar {formatCurrency(selectedItem.sell_price * itemQuantity)}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
