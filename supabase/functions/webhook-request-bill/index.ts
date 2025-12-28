import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { 
      order_id,
      order_number,
      table_number,
      customer_phone,
      payment_method // "cash", "credit", "debit", "pix", "split"
    } = body;

    console.log("Webhook request bill:", body);

    // Find order
    let query = supabase
      .from("orders")
      .select(`
        id,
        order_number,
        table_number,
        subtotal,
        discount,
        total,
        order_items (
          quantity,
          total_price,
          menu_items:menu_item_id (
            recipes:recipe_id (name)
          )
        )
      `);

    if (order_id) {
      query = query.eq("id", order_id);
    } else if (order_number) {
      query = query.eq("order_number", order_number);
    } else if (table_number) {
      query = query.eq("table_number", table_number).eq("status", "delivered").order("created_at", { ascending: false }).limit(1);
    } else {
      throw new Error("order_id, order_number or table_number is required");
    }

    const { data: orders, error } = await query;
    if (error) throw error;

    const order = orders?.[0];
    if (!order) {
      throw new Error("Order not found");
    }

    // Format bill
    const items = order.order_items?.map((item: any) => ({
      name: item.menu_items?.recipes?.name || "Item",
      quantity: item.quantity,
      total: item.total_price
    }));

    // Notify waiter
    await supabase
      .from("notifications")
      .insert({
        type: "request_bill",
        title: `Mesa ${order.table_number} - Conta solicitada`,
        message: payment_method ? `Pagamento: ${getPaymentMethod(payment_method)}` : "Aguardando forma de pagamento",
        data: {
          order_id: order.id,
          order_number: order.order_number,
          table_number: order.table_number,
          customer_phone,
          payment_method,
          total: order.total
        },
        target_roles: ["garcom", "admin"],
        is_read: false
      });

    return new Response(
      JSON.stringify({
        success: true,
        bill: {
          order_number: order.order_number,
          table: order.table_number,
          items,
          subtotal: order.subtotal,
          discount: order.discount,
          total: order.total
        },
        message: "Conta solicitada! O garçom está a caminho."
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in webhook-request-bill:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getPaymentMethod(method: string): string {
  const methods: Record<string, string> = {
    cash: "Dinheiro",
    credit: "Cartão de Crédito",
    debit: "Cartão de Débito",
    pix: "PIX",
    split: "Dividir conta"
  };
  return methods[method] || method;
}
