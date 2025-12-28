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
      table_number,
      customer_phone,
      customer_name,
      type, // "delay", "quality", "service", "wrong_order", "other"
      message,
      urgency // "low", "medium", "high"
    } = body;

    console.log("Webhook complaint request:", body);

    if (!message) {
      throw new Error("Complaint message is required");
    }

    // Create complaint record
    const { data: complaint, error: complaintError } = await supabase
      .from("complaints")
      .insert({
        order_id,
        order_number,
        table_number,
        customer_phone,
        customer_name,
        type: type || "other",
        message,
        urgency: urgency || "medium",
        status: "pending"
      })
      .select()
      .single();

    if (complaintError) throw complaintError;

    // Create notification for admin
    const { error: notifError } = await supabase
      .from("notifications")
      .insert({
        type: "complaint",
        title: `Reclamação ${urgency === "high" ? "URGENTE" : ""}: ${getComplaintType(type)}`,
        message: message.substring(0, 100) + (message.length > 100 ? "..." : ""),
        data: {
          complaint_id: complaint.id,
          order_id,
          order_number,
          table_number,
          customer_phone,
          type,
          urgency
        },
        target_roles: ["admin"],
        is_read: false,
        priority: urgency === "high" ? "urgent" : "normal"
      });

    if (notifError) console.error("Notification error:", notifError);

    return new Response(
      JSON.stringify({
        success: true,
        complaint_id: complaint.id,
        message: "Sua reclamação foi registrada. Um responsável entrará em contato em breve."
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in webhook-complaint:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getComplaintType(type: string): string {
  const types: Record<string, string> = {
    delay: "Demora no atendimento",
    quality: "Qualidade do produto",
    service: "Atendimento",
    wrong_order: "Pedido errado",
    other: "Outra reclamação"
  };
  return types[type] || types.other;
}
