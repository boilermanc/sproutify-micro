import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const payload = await req.json();
    
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { type, data } = payload;

    // Handle tags - might be array or object depending on Resend's format
    let campaignId = null;
    if (Array.isArray(data.tags)) {
      const campaignTag = data.tags.find((t: any) => t.name === "campaign");
      campaignId = campaignTag?.value || null;
    } else if (data.tags && typeof data.tags === "object") {
      campaignId = data.tags.campaign || null;
    }

    // Also check headers for campaign ID
    if (!campaignId && data.headers) {
      const headerArray = Array.isArray(data.headers) ? data.headers : Object.entries(data.headers).map(([name, value]) => ({ name, value }));
      const entityRefHeader = headerArray.find((h: any) => h.name === "X-Entity-Ref-ID");
      campaignId = entityRefHeader?.value || null;
    }

    const { error } = await supabaseClient
      .from("email_events")
      .insert({
        email_id: data.email_id || null,
        event_type: type,
        recipient_email: Array.isArray(data.to) ? data.to[0] : data.to || null,
        subject: data.subject || null,
        campaign_id: campaignId,
        clicked_link: data.click?.link || null,
      });

    if (error) {
      console.error("Failed to insert event:", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
