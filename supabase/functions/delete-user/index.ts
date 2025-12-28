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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    // Create client with user's token to verify they are admin
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get the calling user
    const { data: { user: callingUser }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !callingUser) {
      throw new Error("Unauthorized");
    }

    // Check if calling user is admin
    const { data: isAdmin } = await supabaseClient.rpc("has_role", {
      _user_id: callingUser.id,
      _role: "admin",
    });

    if (!isAdmin) {
      throw new Error("Only admins can delete users");
    }

    const { user_id } = await req.json();
    if (!user_id) {
      throw new Error("user_id is required");
    }

    // Prevent self-deletion
    if (user_id === callingUser.id) {
      throw new Error("Cannot delete your own account");
    }

    console.log(`Admin ${callingUser.id} deleting user ${user_id}`);

    // Use service role to delete user
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Delete user from auth (this will cascade to profiles and user_roles)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);

    if (deleteError) {
      throw deleteError;
    }

    console.log(`User ${user_id} deleted successfully`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error deleting user:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
