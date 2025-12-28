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
    const { order_id, order_number, items } = body;

    console.log("Webhook order add items request:", body);

    if (!items || items.length === 0) {
      throw new Error("Items are required");
    }

    // Find order
    let query = supabase.from("orders").select("id, subtotal, total, status");
    
    if (order_id) {
      query = query.eq("id", order_id);
    } else if (order_number) {
      query = query.eq("order_number", order_number);
    } else {
      throw new Error("order_id or order_number is required");
    }

    const { data: orders, error: orderError } = await query.single();
    if (orderError) throw orderError;

    const order = orders;

    if (order.status === "delivered" || order.status === "cancelled") {
      throw new Error("Cannot add items to a delivered or cancelled order");
    }

    // Get menu items prices
    const menuItemIds = items.map((item: any) => item.menu_item_id);
    const { data: menuItems, error: menuError } = await supabase
      .from("menu_items")
      .select("id, sell_price")
      .in("id", menuItemIds);

    if (menuError) throw menuError;

    // Calculate new items
    const priceMap = new Map(menuItems?.map(m => [m.id, m.sell_price]) || []);
    let additionalTotal = 0;
    const orderItems = items.map((item: any) => {
      const unitPrice = priceMap.get(item.menu_item_id) || 0;
      const totalPrice = unitPrice * item.quantity;
      additionalTotal += totalPrice;
      return {
        order_id: order.id,
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
        notes: item.notes || null,
        status: "pending"
      };
    });

    // Insert new items
    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems);

    if (itemsError) throw itemsError;

    // Update order totals
    const newSubtotal = (order.subtotal || 0) + additionalTotal;
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        subtotal: newSubtotal,
        total: newSubtotal
      })
      .eq("id", order.id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({
        success: true,
        order_id: order.id,
        items_added: items.length,
        additional_total: additionalTotal,
        new_total: newSubtotal,
        message: `${items.length} item(s) adicionado(s) ao pedido!`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in webhook-order-add-items:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
