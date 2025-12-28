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
      customer_phone,
      customer_name,
      table_number,
      type, // "menu", "service", "ambiance", "other"
      message
    } = body;

    console.log("Webhook suggestion request:", body);

    if (!message) {
      throw new Error("Suggestion message is required");
    }

    // Create suggestion record
    const { data: suggestion, error } = await supabase
      .from("suggestions")
      .insert({
        customer_phone,
        customer_name,
        table_number,
        type: type || "other",
        message,
        status: "pending"
      })
      .select()
      .single();

    if (error) throw error;

    // Notify admin
    await supabase
      .from("notifications")
      .insert({
        type: "suggestion",
        title: `Nova sugestão: ${getSuggestionType(type)}`,
        message: message.substring(0, 100) + (message.length > 100 ? "..." : ""),
        data: {
          suggestion_id: suggestion.id,
          customer_phone,
          table_number,
          type
        },
        target_roles: ["admin"],
        is_read: false
      });

    return new Response(
      JSON.stringify({
        success: true,
        suggestion_id: suggestion.id,
        message: "Obrigado pela sua sugestão! Valorizamos seu feedback."
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in webhook-suggestion:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getSuggestionType(type: string): string {
  const types: Record<string, string> = {
    menu: "Cardápio",
    service: "Atendimento",
    ambiance: "Ambiente",
    other: "Geral"
  };
  return types[type] || types.other;
}
