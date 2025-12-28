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
      customer_name,
      food_rating, // 1-5
      service_rating, // 1-5
      ambiance_rating, // 1-5
      overall_rating, // 1-5
      comment
    } = body;

    console.log("Webhook rating request:", body);

    if (!overall_rating || overall_rating < 1 || overall_rating > 5) {
      throw new Error("Overall rating (1-5) is required");
    }

    // Create rating record
    const { data: rating, error } = await supabase
      .from("ratings")
      .insert({
        order_id,
        order_number,
        customer_phone,
        customer_name,
        food_rating: food_rating || null,
        service_rating: service_rating || null,
        ambiance_rating: ambiance_rating || null,
        overall_rating,
        comment
      })
      .select()
      .single();

    if (error) throw error;

    // Notify admin for low ratings
    if (overall_rating <= 2) {
      await supabase
        .from("notifications")
        .insert({
          type: "low_rating",
          title: `Avaliação baixa: ${overall_rating} estrelas`,
          message: comment?.substring(0, 100) || "Cliente insatisfeito",
          data: {
            rating_id: rating.id,
            order_id,
            order_number,
            customer_phone,
            overall_rating
          },
          target_roles: ["admin"],
          is_read: false,
          priority: "urgent"
        });
    }

    return new Response(
      JSON.stringify({
        success: true,
        rating_id: rating.id,
        message: "Obrigado pela sua avaliação!"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in webhook-rating:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
