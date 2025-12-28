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
      customer_phone,
      reason, // "assistance", "bill", "question", "other"
      message
    } = body;

    console.log("Webhook call waiter request:", body);

    if (!table_number) {
      throw new Error("Table number is required");
    }

    // Create notification for waiter
    const { data: notification, error } = await supabase
      .from("notifications")
      .insert({
        type: "call_waiter",
        title: `Mesa ${table_number} chamando`,
        message: message || getReasonMessage(reason),
        data: {
          table_number,
          customer_phone,
          reason
        },
        target_roles: ["garcom", "admin"],
        is_read: false
      })
      .select()
      .single();

    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        notification_id: notification.id,
        message: "Garçom notificado! Aguarde um momento."
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in webhook-call-waiter:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getReasonMessage(reason: string): string {
  const reasons: Record<string, string> = {
    assistance: "Precisa de assistência",
    bill: "Solicita a conta",
    question: "Tem uma dúvida",
    other: "Chamando garçom"
  };
  return reasons[reason] || reasons.other;
}
