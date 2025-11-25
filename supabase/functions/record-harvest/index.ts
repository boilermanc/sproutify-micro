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

    const { trayIds, yield: harvestYield, notes } = await req.json()

    if (!trayIds || trayIds.length === 0) {
      throw new Error('No trays provided')
    }

    // Update trays with harvest information
    const { data, error } = await supabaseClient
      .from('trays')
      .update({
        harvest_date: new Date().toISOString(),
        yield: harvestYield,
      })
      .in('tray_id', trayIds)
      .select()

    if (error) throw error

    // Mark all tray steps as completed
    const { error: stepsError } = await supabaseClient
      .from('tray_steps')
      .update({
        completed: true,
        completed_at: new Date().toISOString(),
      })
      .in('tray_id', trayIds)

    if (stepsError) throw stepsError

    return new Response(
      JSON.stringify({
        success: true,
        harvestedTrays: data.length,
        message: `Successfully harvested ${data.length} trays`,
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
