import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Determine Stripe mode (test or live)
const stripeMode = Deno.env.get("STRIPE_MODE") || "test";
const stripeSecretKey = stripeMode === "live"
  ? Deno.env.get("STRIPE_SECRET_KEY_LIVE")
  : Deno.env.get("STRIPE_SECRET_KEY_TEST");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Create Stripe Billing Portal Session using fetch
async function createBillingPortalSession(params: {
  customer: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  const body = new URLSearchParams({
    customer: params.customer,
    return_url: params.returnUrl,
  });

  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Bearer ${stripeSecretKey}`,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[stripe-portal] Stripe API error:", response.status, errorText);
    throw new Error(`Stripe API error (${response.status}): ${errorText}`);
  }

  return await response.json();
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Create Supabase client with user's auth
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // Verify user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { returnUrl } = await req.json();

    // Get user's farm's Stripe customer ID
    const { data: profile, error: profileError } = await supabaseClient
      .from("profile")
      .select("farms(stripe_customer_id)")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("Profile error:", profileError);
      throw new Error("Failed to fetch profile");
    }

    const stripeCustomerId = (profile?.farms as { stripe_customer_id: string | null })?.stripe_customer_id;

    if (!stripeCustomerId) {
      throw new Error(
        "No subscription found. Please subscribe first to manage your billing."
      );
    }

    // Determine return URL
    const origin = req.headers.get("origin") || "https://app.sproutify.app";
    const finalReturnUrl = returnUrl || `${origin}/settings`;

    // Create Stripe Customer Portal session
    const session = await createBillingPortalSession({
      customer: stripeCustomerId,
      returnUrl: finalReturnUrl,
    });

    console.log(`Portal session created for customer ${stripeCustomerId}`);

    return new Response(
      JSON.stringify({
        url: session.url,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Portal error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
