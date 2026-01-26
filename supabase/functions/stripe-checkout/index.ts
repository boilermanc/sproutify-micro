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

// Price ID mapping for each tier
const PRICE_IDS: Record<string, string> = {
  starter: "price_1StChSGuzWBS3QKLS7DYpH0Q",
  growth: "price_1StChmGuzWBS3QKLJlNQooWz",
  pro: "price_1StCi7GuzWBS3QKLgDTM2gaY",
};

// Create Stripe customer using fetch
async function createStripeCustomer(params: {
  email: string;
  name: string;
  metadata: Record<string, string>;
}): Promise<{ id: string }> {
  const body = new URLSearchParams({
    email: params.email,
    name: params.name,
  });

  // Add metadata
  Object.entries(params.metadata).forEach(([key, value]) => {
    body.append(`metadata[${key}]`, value);
  });

  const response = await fetch("https://api.stripe.com/v1/customers", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Bearer ${stripeSecretKey}`,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[stripe-checkout] Stripe API error:", response.status, errorText);
    throw new Error(`Stripe API error (${response.status}): ${errorText}`);
  }

  return await response.json();
}

// Create Stripe Checkout Session using fetch
async function createStripeCheckoutSession(params: {
  customer: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}): Promise<{ id: string; url: string }> {
  const body = new URLSearchParams({
    customer: params.customer,
    mode: "subscription",
    "payment_method_types[0]": "card",
    "line_items[0][price]": params.priceId,
    "line_items[0][quantity]": "1",
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    allow_promotion_codes: "true",
    billing_address_collection: "auto",
  });

  // Add metadata
  Object.entries(params.metadata).forEach(([key, value]) => {
    body.append(`metadata[${key}]`, value);
    body.append(`subscription_data[metadata][${key}]`, value);
  });

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Bearer ${stripeSecretKey}`,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[stripe-checkout] Stripe API error:", response.status, errorText);
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

    const { tier, successUrl, cancelUrl } = await req.json();

    // Validate tier
    if (!tier || !PRICE_IDS[tier]) {
      throw new Error(
        `Invalid subscription tier: ${tier}. Must be one of: starter, growth, pro`
      );
    }

    // Get user's profile and farm data
    const { data: profile, error: profileError } = await supabaseClient
      .from("profile")
      .select("farm_uuid, farms(farm_uuid, farmname, stripe_customer_id)")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.farms) {
      console.error("Profile error:", profileError);
      throw new Error("Farm not found for user");
    }

    const farm = profile.farms as {
      farm_uuid: string;
      farmname: string;
      stripe_customer_id: string | null;
    };

    let customerId = farm.stripe_customer_id;

    // Create Stripe customer if one doesn't exist
    if (!customerId) {
      console.log(`Creating new Stripe customer for farm ${farm.farm_uuid}`);

      const customer = await createStripeCustomer({
        email: user.email || "",
        name: farm.farmname,
        metadata: {
          farm_uuid: farm.farm_uuid,
          farm_name: farm.farmname,
          user_id: user.id,
        },
      });

      customerId = customer.id;

      // Save customer ID to farm using admin client
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      const { error: updateError } = await supabaseAdmin
        .from("farms")
        .update({ stripe_customer_id: customerId })
        .eq("farm_uuid", farm.farm_uuid);

      if (updateError) {
        console.error("Failed to save Stripe customer ID:", updateError);
        // Don't throw - we can still proceed with checkout
      }
    }

    // Determine URLs
    const origin = req.headers.get("origin") || "https://app.sproutify.app";
    const finalSuccessUrl =
      successUrl || `${origin}/settings?checkout=success&tier=${tier}`;
    const finalCancelUrl =
      cancelUrl || `${origin}/pricing?checkout=canceled`;

    // Create Checkout session
    const session = await createStripeCheckoutSession({
      customer: customerId,
      priceId: PRICE_IDS[tier],
      successUrl: finalSuccessUrl,
      cancelUrl: finalCancelUrl,
      metadata: {
        farm_uuid: farm.farm_uuid,
        tier: tier,
      },
    });

    console.log(
      `Checkout session created for farm ${farm.farm_uuid}: ${session.id}`
    );

    return new Response(
      JSON.stringify({
        sessionId: session.id,
        url: session.url,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Checkout error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
