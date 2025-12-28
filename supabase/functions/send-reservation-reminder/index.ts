import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if this is a forced test run
    let forceRun = false;
    try {
      const body = await req.json();
      forceRun = body?.forceRun === true;
    } catch {
      // No body or invalid JSON, that's fine
    }

    console.log(`Starting reservation reminder check... (forceRun: ${forceRun})`);


    // Get restaurant settings first to check the configured reminder hour
    const { data: settings, error: settingsError } = await supabase
      .from("restaurant_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      console.error("Error fetching settings:", settingsError);
      throw settingsError;
    }

    // Check if current hour matches the configured reminder hour
    const currentHour = new Date().getUTCHours();
    const reminderHour = settings?.reminder_hour ?? 10;

    console.log(`Current hour (UTC): ${currentHour}, Configured reminder hour: ${reminderHour}`);

    if (!forceRun && currentHour !== reminderHour) {
      console.log(`Not the right time for reminders. Current: ${currentHour}, Expected: ${reminderHour}`);
      return new Response(
        JSON.stringify({ 
          message: "Not reminder time", 
          currentHour, 
          reminderHour 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (forceRun) {
      console.log("Force run mode - skipping time check");
    }

    // Get tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // Get all confirmed reservations for tomorrow
    const { data: reservations, error: reservationsError } = await supabase
      .from("reservations")
      .select("*")
      .eq("reservation_date", tomorrowStr)
      .eq("status", "confirmed");

    if (reservationsError) {
      console.error("Error fetching reservations:", reservationsError);
      throw reservationsError;
    }

    if (!reservations || reservations.length === 0) {
      console.log("No confirmed reservations found for tomorrow");
      return new Response(
        JSON.stringify({ message: "No reservations to remind", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${reservations.length} reservations for tomorrow`);

    const webhookUrl = settings?.reservation_webhook_url;

    if (!webhookUrl) {
      console.log("No webhook URL configured, skipping reminders");
      return new Response(
        JSON.stringify({ message: "No webhook URL configured", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending reminders to webhook: ${webhookUrl}`);

    let successCount = 0;
    let errorCount = 0;

    // Send webhook for each reservation
    for (const reservation of reservations) {
      try {
        const payload = {
          action: "reminder",
          reservation_id: reservation.id,
          customer_name: reservation.customer_name,
          customer_phone: reservation.customer_phone,
          customer_email: reservation.customer_email,
          table_number: reservation.table_number,
          party_size: reservation.party_size,
          reservation_date: reservation.reservation_date,
          reservation_time: reservation.reservation_time,
          notes: reservation.notes,
          restaurant_name: settings?.name || "Restaurante",
          restaurant_phone: settings?.phone,
          restaurant_address: settings?.address,
          reminder_message: `Olá ${reservation.customer_name}! Lembrando que você tem uma reserva amanhã às ${reservation.reservation_time} para ${reservation.party_size} pessoa(s). Mesa ${reservation.table_number}. Esperamos você!`,
        };

        console.log(`Sending reminder for reservation ${reservation.id}`);

        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          console.log(`Reminder sent successfully for reservation ${reservation.id}`);
          successCount++;
        } else {
          console.error(`Failed to send reminder for reservation ${reservation.id}: ${response.status}`);
          errorCount++;
        }
      } catch (error) {
        console.error(`Error sending reminder for reservation ${reservation.id}:`, error);
        errorCount++;
      }
    }

    console.log(`Reminders completed: ${successCount} success, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        message: "Reminders processed",
        total: reservations.length,
        success: successCount,
        errors: errorCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-reservation-reminder function:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
