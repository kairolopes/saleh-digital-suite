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
    const { action, table_id, category } = body;

    console.log("Webhook menu request:", { action, table_id, category });

    // Get menu items with recipe details
    let query = supabase
      .from("menu_items")
      .select(`
        id,
        sell_price,
        category,
        is_available,
        display_order,
        recipes:recipe_id (
          id,
          name,
          description,
          image_url,
          preparation_time
        )
      `)
      .eq("is_available", true)
      .order("display_order");

    if (category) {
      query = query.eq("category", category);
    }

    const { data: menuItems, error } = await query;

    if (error) throw error;

    // Format response for WhatsApp/external platform
    const formattedMenu = menuItems?.map((item: any) => ({
      id: item.id,
      name: item.recipes?.name || "Item",
      description: item.recipes?.description || "",
      price: item.sell_price,
      category: item.category,
      preparation_time: item.recipes?.preparation_time || 0,
      image_url: item.recipes?.image_url || null
    }));

    // Get unique categories
    const categories = [...new Set(menuItems?.map((item: any) => item.category) || [])];

    return new Response(
      JSON.stringify({
        success: true,
        table_id,
        categories,
        menu: formattedMenu,
        total_items: formattedMenu?.length || 0
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in webhook-menu:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
