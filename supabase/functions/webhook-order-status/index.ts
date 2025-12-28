import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const statusMessages: Record<string, string> = {
  pending: "Aguardando confirmação",
  confirmed: "Pedido confirmado",
  preparing: "Em preparação",
  ready: "Pronto para entrega",
  delivered: "Entregue",
  cancelled: "Cancelado"
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
    const { order_id, order_number, customer_phone } = body;

    console.log("Webhook order status request:", body);

    // Find order by id, number, or phone
    let query = supabase
      .from("orders")
      .select(`
        id,
        order_number,
        status,
        total,
        table_number,
        customer_name,
        notes,
        created_at,
        updated_at,
        order_items (
          id,
          quantity,
          unit_price,
          total_price,
          notes,
          status,
          menu_items:menu_item_id (
            recipes:recipe_id (
              name
            )
          )
        )
      `);

    if (order_id) {
      query = query.eq("id", order_id);
    } else if (order_number) {
      query = query.eq("order_number", order_number);
    } else if (customer_phone) {
      query = query.eq("customer_phone", customer_phone).order("created_at", { ascending: false }).limit(1);
    } else {
      throw new Error("order_id, order_number or customer_phone is required");
    }

    const { data: orders, error } = await query;

    if (error) throw error;

    const order = orders?.[0];

    if (!order) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Pedido não encontrado"
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate estimated time
    const createdAt = new Date(order.created_at);
    const now = new Date();
    const waitingMinutes = Math.floor((now.getTime() - createdAt.getTime()) / 60000);

    // Format items
    const items = order.order_items?.map((item: any) => ({
      name: item.menu_items?.recipes?.name || "Item",
      quantity: item.quantity,
      price: item.total_price,
      status: item.status
    }));

    return new Response(
      JSON.stringify({
        success: true,
        order: {
          id: order.id,
          number: order.order_number,
          status: order.status,
          status_message: statusMessages[order.status] || order.status,
          total: order.total,
          table: order.table_number,
          customer: order.customer_name,
          items,
          waiting_minutes: waitingMinutes,
          created_at: order.created_at
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in webhook-order-status:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
