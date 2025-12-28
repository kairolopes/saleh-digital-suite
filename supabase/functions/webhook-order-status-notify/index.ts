import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const statusMessages: Record<string, string> = {
  confirmed: "✅ Seu pedido foi aceito e será preparado em breve!",
  preparing: "👨‍🍳 Seu pedido está sendo preparado!",
  ready: "🍽️ Seu pedido está PRONTO! Aguarde o garçom.",
  delivered: "✅ Pedido entregue! Bom apetite!",
  cancelled: "❌ Infelizmente seu pedido foi recusado.",
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

    const { order_id, status, rejection_reason } = await req.json();

    console.log("Notifying order status change:", { order_id, status, rejection_reason });

    if (!order_id || !status) {
      throw new Error("order_id and status are required");
    }

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*, order_items(*, menu_items(recipes(name)))")
      .eq("id", order_id)
      .single();

    if (orderError) throw orderError;

    // Get restaurant settings for webhook URL
    const { data: settings } = await supabase
      .from("restaurant_settings")
      .select("reservation_webhook_url, name")
      .single();

    const webhookUrl = settings?.reservation_webhook_url;
    const restaurantName = settings?.name || "Restaurante";

    if (!webhookUrl) {
      console.log("No webhook URL configured, skipping notification");
      return new Response(
        JSON.stringify({ success: true, message: "No webhook configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build message
    let message = statusMessages[status] || `Status do pedido atualizado: ${status}`;
    
    if (status === "cancelled" && rejection_reason) {
      message += `\n\n📝 Motivo: ${rejection_reason}`;
    }

    if (status === "ready") {
      message += `\n\n📍 Mesa: ${order.table_number || "N/A"}`;
      message += `\n👤 Cliente: ${order.customer_name || "N/A"}`;
    }

    // Format items list
    const itemsList = order.order_items?.map((item: any) => 
      `${item.quantity}x ${item.menu_items?.recipes?.name || "Item"}`
    ).join("\n") || "";

    const webhookPayload = {
      event: "order_status_update",
      order_id: order.id,
      order_number: order.order_number,
      status,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      table_number: order.table_number,
      message,
      items: itemsList,
      rejection_reason: rejection_reason || null,
      restaurant_name: restaurantName,
      timestamp: new Date().toISOString(),
    };

    console.log("Sending webhook:", webhookPayload);

    // Send webhook
    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookPayload),
    });

    console.log("Webhook response status:", webhookResponse.status);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Notification sent",
        webhook_status: webhookResponse.status,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in webhook-order-status-notify:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
