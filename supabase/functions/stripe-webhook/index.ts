import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Determine Stripe mode (test or live)
const stripeMode = Deno.env.get("STRIPE_MODE") || "test";
const stripeWebhookSecret = stripeMode === "live"
  ? Deno.env.get("STRIPE_WEBHOOK_SECRET_LIVE")
  : Deno.env.get("STRIPE_WEBHOOK_SECRET_TEST");

// Map Stripe price IDs to tier names
const PRICE_TO_TIER: Record<string, string> = {
  "price_1StChSGuzWBS3QKLS7DYpH0Q": "starter",
  "price_1StChmGuzWBS3QKLJlNQooWz": "growth",
  "price_1StCi7GuzWBS3QKLgDTM2gaY": "pro",
};

// Tier display names and prices
const TIER_INFO: Record<string, { displayName: string; price: string }> = {
  starter: { displayName: "Starter", price: "12.99" },
  growth: { displayName: "Growth", price: "24.99" },
  pro: { displayName: "Pro", price: "39.99" },
};

// Verify Stripe webhook signature manually
async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();

    // Parse the signature header
    const elements = signature.split(",");
    let timestamp = "";
    let v1Signature = "";

    for (const element of elements) {
      const [key, value] = element.split("=");
      if (key === "t") timestamp = value;
      if (key === "v1") v1Signature = value;
    }

    if (!timestamp || !v1Signature) {
      console.error("[stripe-webhook] Missing timestamp or v1 signature");
      return false;
    }

    // Check timestamp is within tolerance (5 minutes)
    const now = Math.floor(Date.now() / 1000);
    const webhookTimestamp = parseInt(timestamp, 10);
    if (Math.abs(now - webhookTimestamp) > 300) {
      console.error("[stripe-webhook] Timestamp outside tolerance");
      return false;
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signedPayload)
    );

    // Convert to hex
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    // Compare signatures (constant-time comparison)
    if (expectedSignature.length !== v1Signature.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < expectedSignature.length; i++) {
      result |= expectedSignature.charCodeAt(i) ^ v1Signature.charCodeAt(i);
    }

    return result === 0;
  } catch (err) {
    console.error("[stripe-webhook] Signature verification error:", err);
    return false;
  }
}

serve(async (req) => {
  console.log("[stripe-webhook] Request received");

  try {
    // Verify Stripe signature
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      console.error("[stripe-webhook] Missing stripe-signature header");
      return new Response("Missing signature", { status: 400 });
    }

    const body = await req.text();
    console.log("[stripe-webhook] Body received, length:", body.length);

    if (!stripeWebhookSecret) {
      console.error("[stripe-webhook] Webhook secret not configured for mode:", stripeMode);
      return new Response("Webhook secret not configured", { status: 500 });
    }

    const isValid = await verifyStripeSignature(body, signature, stripeWebhookSecret);
    if (!isValid) {
      console.error("[stripe-webhook] Invalid signature");
      return new Response("Invalid signature", { status: 400 });
    }

    const event = JSON.parse(body);
    console.log("[stripe-webhook] Event type:", event.type);

    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Helper function to log events
    const logEvent = async (
      farmUuid: string | null,
      errorMessage?: string
    ) => {
      const eventObject = event.data.object;
      try {
        await supabaseAdmin.from("subscription_events").insert({
          stripe_event_id: event.id,
          event_type: event.type,
          farm_uuid: farmUuid,
          stripe_subscription_id: eventObject.id || null,
          stripe_customer_id: eventObject.customer || null,
          payload: eventObject,
          error_message: errorMessage,
        });
      } catch (logError) {
        console.error("[stripe-webhook] Failed to log event:", logError);
      }
    };

    // Helper function to get farm_uuid from Stripe customer ID
    const getFarmUuid = async (customerId: string): Promise<string | null> => {
      const { data } = await supabaseAdmin
        .from("farms")
        .select("farm_uuid")
        .eq("stripe_customer_id", customerId)
        .single();
      return data?.farm_uuid || null;
    };

    // Helper function to get farm details
    const getFarmDetails = async (farmUuid: string): Promise<{ farmName: string; email: string | null } | null> => {
      // Get farm name
      const { data: farm } = await supabaseAdmin
        .from("farms")
        .select("farmname")
        .eq("farm_uuid", farmUuid)
        .single();

      // Get user email from profile
      const { data: profile } = await supabaseAdmin
        .from("profile")
        .select("id")
        .eq("farm_uuid", farmUuid)
        .limit(1)
        .single();

      if (!profile) return { farmName: farm?.farmname || "Your Farm", email: null };

      // Get email from auth.users
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(profile.id);

      return {
        farmName: farm?.farmname || "Your Farm",
        email: authUser?.user?.email || null,
      };
    };

    // Helper function to send email via send-email edge function
    const sendEmail = async (
      to: string,
      template: "welcome" | "subscription_confirmed" | "subscription_cancelled" | "payment_failed",
      data: Record<string, string>
    ) => {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

        const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({ to, template, data }),
        });

        if (!response.ok) {
          const error = await response.json();
          console.error("[stripe-webhook] Failed to send email:", error);
        } else {
          console.log(`[stripe-webhook] Sent ${template} email to ${to}`);
        }
      } catch (err) {
        console.error("[stripe-webhook] Error sending email:", err);
      }
    };

    console.log(`[stripe-webhook] Processing event: ${event.type}`);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const farmUuid = session.metadata?.farm_uuid;
        const tier = session.metadata?.tier;

        if (farmUuid && tier) {
          // Update farm subscription status
          const { error: updateError } = await supabaseAdmin
            .from("farms")
            .update({
              subscription_status: "active",
              subscription_plan: tier,
              subscription_start_date: new Date().toISOString(),
              subscription_end_date: null, // Will be set by subscription webhook
            })
            .eq("farm_uuid", farmUuid);

          if (updateError) {
            console.error("[stripe-webhook] Failed to update farm:", updateError);
            await logEvent(farmUuid, updateError.message);
          } else {
            console.log(`[stripe-webhook] Farm ${farmUuid} upgraded to ${tier}`);
            await logEvent(farmUuid);

            // Send welcome email
            const farmDetails = await getFarmDetails(farmUuid);
            if (farmDetails?.email) {
              const tierInfo = TIER_INFO[tier] || { displayName: "Starter", price: "12.99" };
              await sendEmail(farmDetails.email, "welcome", {
                farmName: farmDetails.farmName,
                tierName: tierInfo.displayName,
                tierPrice: tierInfo.price,
              });
            }
          }
        } else {
          console.warn("[stripe-webhook] Checkout completed but missing farm_uuid or tier in metadata");
          await logEvent(null, "Missing farm_uuid or tier in metadata");
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const farmUuid = await getFarmUuid(customerId);

        if (!farmUuid) {
          console.warn(`[stripe-webhook] No farm found for customer ${customerId}`);
          await logEvent(null, `Farm not found for customer ${customerId}`);
          break;
        }

        const priceId = subscription.items?.data?.[0]?.price?.id;
        const tier = PRICE_TO_TIER[priceId] || "starter";

        // Upsert subscription record
        const { error: upsertError } = await supabaseAdmin
          .from("subscriptions")
          .upsert(
            {
              farm_uuid: farmUuid,
              stripe_subscription_id: subscription.id,
              stripe_price_id: priceId,
              tier: tier,
              status: subscription.status,
              current_period_start: new Date(
                subscription.current_period_start * 1000
              ).toISOString(),
              current_period_end: new Date(
                subscription.current_period_end * 1000
              ).toISOString(),
              cancel_at_period_end: subscription.cancel_at_period_end,
              canceled_at: subscription.canceled_at
                ? new Date(subscription.canceled_at * 1000).toISOString()
                : null,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: "stripe_subscription_id",
            }
          );

        if (upsertError) {
          console.error("[stripe-webhook] Failed to upsert subscription:", upsertError);
          await logEvent(farmUuid, upsertError.message);
          break;
        }

        // Update farm status
        const newStatus = subscription.status === "active" ? "active" :
                         subscription.status === "past_due" ? "active" : // Keep active for grace period
                         subscription.status;

        const { error: farmError } = await supabaseAdmin
          .from("farms")
          .update({
            subscription_status: newStatus,
            subscription_plan: tier,
            subscription_end_date: new Date(
              subscription.current_period_end * 1000
            ).toISOString(),
          })
          .eq("farm_uuid", farmUuid);

        if (farmError) {
          console.error("[stripe-webhook] Failed to update farm:", farmError);
        }

        console.log(`[stripe-webhook] Subscription ${event.type} for farm ${farmUuid}: tier=${tier}, status=${subscription.status}`);
        await logEvent(farmUuid);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const farmUuid = await getFarmUuid(customerId);

        if (farmUuid) {
          // Update subscription record
          await supabaseAdmin
            .from("subscriptions")
            .update({
              status: "canceled",
              canceled_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_subscription_id", subscription.id);

          // Downgrade farm to expired
          await supabaseAdmin
            .from("farms")
            .update({
              subscription_status: "expired",
            })
            .eq("farm_uuid", farmUuid);

          console.log(`[stripe-webhook] Subscription canceled for farm ${farmUuid}`);

          // Send cancellation email
          const farmDetails = await getFarmDetails(farmUuid);
          if (farmDetails?.email) {
            await sendEmail(farmDetails.email, "subscription_cancelled", {
              farmName: farmDetails.farmName,
            });
          }
        }

        await logEvent(farmUuid || null);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const farmUuid = await getFarmUuid(customerId);

        if (farmUuid) {
          // Update subscription status to past_due
          if (invoice.subscription) {
            await supabaseAdmin
              .from("subscriptions")
              .update({
                status: "past_due",
                updated_at: new Date().toISOString(),
              })
              .eq("stripe_subscription_id", invoice.subscription);
          }

          // Note: We keep farm status as 'active' to give grace period
          // but the subscription status in the subscriptions table shows past_due
          console.log(`[stripe-webhook] Payment failed for farm ${farmUuid}`);

          // Send payment failed email
          const farmDetails = await getFarmDetails(farmUuid);
          if (farmDetails?.email) {
            await sendEmail(farmDetails.email, "payment_failed", {
              farmName: farmDetails.farmName,
            });
          }
        }

        await logEvent(farmUuid || null);
        break;
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[stripe-webhook] Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
