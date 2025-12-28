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
      order_id,
      category, // "menu", "allergens", "ingredients", "preparation", "availability", "other"
      question
    } = body;

    console.log("Webhook question request:", body);

    if (!question) {
      throw new Error("Question is required");
    }

    // Create question record
    const { data: questionRecord, error } = await supabase
      .from("customer_questions")
      .insert({
        customer_phone,
        customer_name,
        table_number,
        order_id,
        category: category || "other",
        question,
        status: "pending"
      })
      .select()
      .single();

    if (error) throw error;

    // Notify appropriate staff
    const targetRoles = category === "menu" || category === "ingredients" || category === "preparation"
      ? ["cozinha", "admin"]
      : ["garcom", "admin"];

    await supabase
      .from("notifications")
      .insert({
        type: "customer_question",
        title: `Dúvida${table_number ? ` - Mesa ${table_number}` : ""}`,
        message: question.substring(0, 100) + (question.length > 100 ? "..." : ""),
        data: {
          question_id: questionRecord.id,
          customer_phone,
          table_number,
          category
        },
        target_roles: targetRoles,
        is_read: false
      });

    return new Response(
      JSON.stringify({
        success: true,
        question_id: questionRecord.id,
        message: "Sua pergunta foi enviada! Responderemos em breve."
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in webhook-question:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
