import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const { trayIds, email } = await req.json()

    if (!trayIds || trayIds.length === 0) {
      throw new Error('No trays provided')
    }

    // Get tray information
    const { data: trays, error: traysError } = await supabaseClient
      .from('trays')
      .select(`
        tray_unique_id,
        sow_date,
        harvest_date,
        recipes (
          recipe_name,
          variety_name
        ),
        customers (
          customer_name
        )
      `)
      .in('tray_id', trayIds)

    if (traysError) throw traysError

    // Call n8n webhook to generate labels
    const n8nWebhookUrl = Deno.env.get('N8N_LABEL_WEBHOOK_URL') ??
      'https://n8n.sproutify.app/webhook/generate-labels'

    const n8nResponse = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trays: trays.map(t => ({
          trayId: t.tray_unique_id,
          variety: t.recipes?.variety_name,
          recipe: t.recipes?.recipe_name,
          customer: t.customers?.customer_name,
          sowDate: t.sow_date,
          harvestDate: t.harvest_date,
        })),
        email,
      }),
    })

    if (!n8nResponse.ok) {
      throw new Error('Failed to trigger label generation')
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Labels will be sent to ${email}`,
        trayCount: trays.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
