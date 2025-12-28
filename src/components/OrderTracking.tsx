import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  CheckCircle,
  ChefHat,
  UtensilsCrossed,
  XCircle,
  Loader2,
  ArrowLeft,
  Bell,
} from "lucide-react";

interface OrderTrackingProps {
  orderNumber: number;
  onNewOrder: () => void;
  onBack: () => void;
  customerName: string;
  tableNumber: string;
}

interface OrderData {
  id: string;
  order_number: number;
  status: string;
  total: number | null;
  notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  confirmed_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  order_items?: {
    id: string;
    quantity: number;
    notes: string | null;
    menu_items?: {
      recipes?: {
        name: string;
      } | null;
    } | null;
  }[];
}

const statusSteps = [
  { key: "pending", label: "Aguardando", description: "Pedido recebido", icon: Clock },
  { key: "confirmed", label: "Confirmado", description: "Cozinha aceitou", icon: CheckCircle },
  { key: "preparing", label: "Preparando", description: "Em preparo", icon: ChefHat },
  { key: "ready", label: "Pronto!", description: "Aguarde o garçom", icon: Bell },
  { key: "delivered", label: "Entregue", description: "Bom apetite!", icon: UtensilsCrossed },
];

export function OrderTracking({
  orderNumber,
  onNewOrder,
  onBack,
  customerName,
  tableNumber,
}: OrderTrackingProps) {
  const [currentStatus, setCurrentStatus] = useState<string>("pending");

  // Fetch order
  const { data: order, isLoading } = useQuery({
    queryKey: ["order-tracking", orderNumber],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          order_items (
            id, quantity, notes,
            menu_items (recipes (name))
          )
        `)
        .eq("order_number", orderNumber)
        .single();
      if (error) throw error;
      return data as OrderData;
    },
    refetchInterval: 5000, // Poll every 5 seconds as backup
  });

  // Realtime subscription
  useEffect(() => {
    if (!order) return;

    const channel = supabase
      .channel(`order-tracking-${order.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${order.id}`,
        },
        (payload) => {
          const newOrder = payload.new as OrderData;
          setCurrentStatus(newOrder.status);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [order?.id]);

  // Update current status from order data
  useEffect(() => {
    if (order) {
      setCurrentStatus(order.status);
    }
  }, [order]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const formatTime = (dateStr: string | null) =>
    dateStr ? new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;

  const getStepIndex = (status: string) => {
    const index = statusSteps.findIndex((s) => s.key === status);
    return index >= 0 ? index : 0;
  };

  const currentStepIndex = getStepIndex(currentStatus);
  const isCancelled = currentStatus === "cancelled";

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-12">
            <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
            <p className="mt-4 text-muted-foreground">Carregando pedido...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-12">
            <XCircle className="h-12 w-12 mx-auto text-destructive" />
            <p className="mt-4 text-muted-foreground">Pedido não encontrado</p>
            <Button className="mt-4" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background border-b">
        <div className="container max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="font-bold text-lg">Acompanhamento</h1>
              <p className="text-xs text-muted-foreground">
                {customerName} {tableNumber && `• Mesa ${tableNumber}`}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Order Number Card */}
        <Card className={`border-2 ${isCancelled ? "border-destructive bg-destructive/5" : currentStatus === "ready" ? "border-green-500 bg-green-50 dark:bg-green-950/30" : "border-primary/20"}`}>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground mb-1">Pedido</p>
            <p className={`text-5xl font-black ${isCancelled ? "text-destructive" : currentStatus === "ready" ? "text-green-600" : "text-primary"}`}>
              #{order.order_number}
            </p>
            {isCancelled && order.rejection_reason && (
              <div className="mt-4 p-3 bg-destructive/10 rounded-lg">
                <p className="text-sm font-medium text-destructive">Motivo: {order.rejection_reason}</p>
              </div>
            )}
            {currentStatus === "ready" && (
              <div className="mt-4 p-4 bg-green-100 rounded-xl animate-pulse">
                <Bell className="h-8 w-8 mx-auto text-green-600 animate-bounce" />
                <p className="text-lg font-bold text-green-700 mt-2">Seu pedido está pronto!</p>
                <p className="text-sm text-green-600">O garçom está levando até você</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Progress */}
        {!isCancelled && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status do Pedido</CardTitle>
            </CardHeader>
            <CardContent className="pb-8">
              <div className="relative">
                {/* Progress Line */}
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-muted" />
                <div
                  className="absolute left-6 top-0 w-0.5 bg-primary transition-all duration-500"
                  style={{ height: `${(currentStepIndex / (statusSteps.length - 1)) * 100}%` }}
                />

                {/* Steps */}
                <div className="space-y-6">
                  {statusSteps.map((step, index) => {
                    const isComplete = index <= currentStepIndex;
                    const isCurrent = index === currentStepIndex;
                    const Icon = step.icon;

                    // Get timestamp for this step
                    let timestamp: string | null = null;
                    if (index === 0 && order.created_at) timestamp = formatTime(order.created_at);
                    if (index === 1 && order.confirmed_at) timestamp = formatTime(order.confirmed_at);
                    if (index === 2 && order.preparing_at) timestamp = formatTime(order.preparing_at);
                    if (index === 3 && order.ready_at) timestamp = formatTime(order.ready_at);
                    if (index === 4 && order.delivered_at) timestamp = formatTime(order.delivered_at);

                    return (
                      <div key={step.key} className="relative flex items-start gap-4">
                        <div
                          className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                            isCurrent
                              ? "border-primary bg-primary text-primary-foreground scale-110 shadow-lg shadow-primary/30"
                              : isComplete
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted bg-background text-muted-foreground"
                          }`}
                        >
                          {isCurrent && isComplete && index < statusSteps.length - 1 ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <Icon className="h-5 w-5" />
                          )}
                        </div>
                        <div className="flex-1 pt-2">
                          <div className="flex items-center justify-between">
                            <p
                              className={`font-semibold ${
                                isCurrent ? "text-primary" : isComplete ? "text-foreground" : "text-muted-foreground"
                              }`}
                            >
                              {step.label}
                            </p>
                            {timestamp && (
                              <Badge variant="secondary" className="text-xs">
                                {timestamp}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{step.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Order Items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Itens do Pedido</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {order.order_items?.map((item) => (
              <div key={item.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">
                      {item.quantity}x {item.menu_items?.recipes?.name || "Item"}
                    </p>
                    {item.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5">Obs: {item.notes}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Total */}
        <Card>
          <CardContent className="p-4 flex justify-between items-center">
            <span className="font-medium">Total</span>
            <span className="text-xl font-bold text-primary">{formatCurrency(order.total || 0)}</span>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="space-y-3 pb-6">
          {currentStatus === "delivered" && (
            <Button className="w-full h-12" onClick={onNewOrder}>
              <UtensilsCrossed className="w-5 h-5 mr-2" />
              Fazer Novo Pedido
            </Button>
          )}
          {isCancelled && (
            <Button className="w-full h-12" onClick={onNewOrder}>
              Tentar Novamente
            </Button>
          )}
          <Button variant="outline" className="w-full" onClick={onBack}>
            Voltar ao Cardápio
          </Button>
        </div>
      </main>
    </div>
  );
}
