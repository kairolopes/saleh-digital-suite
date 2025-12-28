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
    const { table_number } = body;

    console.log("Webhook table status request:", body);

    if (!table_number) {
      throw new Error("Table number is required");
    }

    // Get active orders for this table
    const { data: orders, error } = await supabase
      .from("orders")
      .select(`
        id,
        order_number,
        status,
        total,
        created_at,
        order_items (
          id,
          quantity,
          status,
          menu_items:menu_item_id (
            recipes:recipe_id (name)
          )
        )
      `)
      .eq("table_number", table_number)
      .in("status", ["pending", "confirmed", "preparing", "ready"])
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Format orders
    const activeOrders = orders?.map((order: any) => {
      const items = order.order_items?.map((item: any) => ({
        name: item.menu_items?.recipes?.name || "Item",
        quantity: item.quantity,
        status: item.status
      }));

      const totalItems = order.order_items?.length || 0;
      const readyItems = order.order_items?.filter((i: any) => i.status === "done").length || 0;

      return {
        order_number: order.order_number,
        status: order.status,
        total: order.total,
        items,
        progress: `${readyItems}/${totalItems}`,
        created_at: order.created_at
      };
    });

    const hasActiveOrders = activeOrders && activeOrders.length > 0;

    return new Response(
      JSON.stringify({
        success: true,
        table_number,
        has_active_orders: hasActiveOrders,
        orders: activeOrders,
        total_orders: activeOrders?.length || 0
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in webhook-table-status:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
