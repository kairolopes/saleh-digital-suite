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
      table_number,
      customer_name,
      customer_phone,
      order_type = "local",
      items, // Array of { menu_item_id, quantity, notes }
      notes
    } = body;

    console.log("Webhook order create request:", body);

    if (!items || items.length === 0) {
      throw new Error("Items are required");
    }

    if (!customer_phone) {
      throw new Error("Customer phone is required");
    }

    // Get menu items prices
    const menuItemIds = items.map((item: any) => item.menu_item_id);
    const { data: menuItems, error: menuError } = await supabase
      .from("menu_items")
      .select("id, sell_price")
      .in("id", menuItemIds);

    if (menuError) throw menuError;

    // Calculate totals
    const priceMap = new Map(menuItems?.map(m => [m.id, m.sell_price]) || []);
    let subtotal = 0;
    const orderItems = items.map((item: any) => {
      const unitPrice = priceMap.get(item.menu_item_id) || 0;
      const totalPrice = unitPrice * item.quantity;
      subtotal += totalPrice;
      return {
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
        notes: item.notes || null
      };
    });

    // Create order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        table_number,
        customer_name,
        customer_phone,
        order_type,
        notes,
        subtotal,
        total: subtotal,
        status: "pending"
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // Create order items
    const itemsToInsert = orderItems.map((item: any) => ({
      ...item,
      order_id: order.id
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(itemsToInsert);

    if (itemsError) throw itemsError;

    return new Response(
      JSON.stringify({
        success: true,
        order_id: order.id,
        order_number: order.order_number,
        status: order.status,
        total: order.total,
        message: `Pedido #${order.order_number} criado com sucesso!`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in webhook-order-create:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
