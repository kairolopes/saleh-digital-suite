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
      preference, // "popular", "quick", "vegetarian", "deals", "chef_special"
      category,
      max_price,
      max_preparation_time
    } = body;

    console.log("Webhook menu recommendations request:", body);

    // Base query
    let query = supabase
      .from("menu_items")
      .select(`
        id,
        sell_price,
        category,
        recipes:recipe_id (
          id,
          name,
          description,
          image_url,
          preparation_time
        )
      `)
      .eq("is_available", true);

    if (category) {
      query = query.eq("category", category);
    }

    if (max_price) {
      query = query.lte("sell_price", max_price);
    }

    const { data: menuItems, error } = await query;
    if (error) throw error;

    let recommendations = menuItems || [];

    // Filter by preparation time if specified
    if (max_preparation_time) {
      recommendations = recommendations.filter(
        (item: any) => item.recipes?.preparation_time <= max_preparation_time
      );
    }

    // Apply preference filter/sort
    switch (preference) {
      case "quick":
        recommendations = recommendations
          .filter((item: any) => item.recipes?.preparation_time <= 20)
          .sort((a: any, b: any) => 
            (a.recipes?.preparation_time || 0) - (b.recipes?.preparation_time || 0)
          );
        break;
      case "deals":
        recommendations = recommendations.sort((a: any, b: any) => 
          a.sell_price - b.sell_price
        ).slice(0, 5);
        break;
      default:
        // Popular/chef_special - just return top items by display_order
        recommendations = recommendations.slice(0, 5);
    }

    // Format response
    const formattedRecommendations = recommendations.map((item: any) => ({
      id: item.id,
      name: item.recipes?.name || "Item",
      description: item.recipes?.description || "",
      price: item.sell_price,
      category: item.category,
      preparation_time: item.recipes?.preparation_time || 0,
      image_url: item.recipes?.image_url || null
    }));

    return new Response(
      JSON.stringify({
        success: true,
        preference,
        recommendations: formattedRecommendations,
        total: formattedRecommendations.length
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in webhook-menu-recommendations:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
