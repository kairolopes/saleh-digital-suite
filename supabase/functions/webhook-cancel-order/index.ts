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
      customer_phone,
      reason
    } = body;

    console.log("Webhook cancel order request:", body);

    // Find order
    let query = supabase.from("orders").select("id, order_number, status, table_number");
    
    if (order_id) {
      query = query.eq("id", order_id);
    } else if (order_number) {
      query = query.eq("order_number", order_number);
    } else {
      throw new Error("order_id or order_number is required");
    }

    const { data: orders, error: findError } = await query;
    if (findError) throw findError;

    const order = orders?.[0];
    if (!order) {
      throw new Error("Order not found");
    }

    // Check if can be cancelled
    if (order.status === "preparing" || order.status === "ready" || order.status === "delivered") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Pedido já está em preparação ou foi entregue. Entre em contato com o garçom.",
          requires_approval: true
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cancel the order
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: "cancelled",
        notes: `Cancelado pelo cliente. Motivo: ${reason || "Não informado"}`
      })
      .eq("id", order.id);

    if (updateError) throw updateError;

    // Notify staff
    await supabase
      .from("notifications")
      .insert({
        type: "order_cancelled",
        title: `Pedido #${order.order_number} cancelado`,
        message: reason || "Cancelado pelo cliente",
        data: {
          order_id: order.id,
          order_number: order.order_number,
          table_number: order.table_number,
          customer_phone,
          reason
        },
        target_roles: ["garcom", "cozinha", "admin"],
        is_read: false
      });

    return new Response(
      JSON.stringify({
        success: true,
        order_id: order.id,
        order_number: order.order_number,
        message: "Pedido cancelado com sucesso."
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in webhook-cancel-order:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
