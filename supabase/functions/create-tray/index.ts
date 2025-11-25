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

    const { recipeId, customerId, farmUuid, batchId } = await req.json()

    // Generate unique tray ID
    const trayUniqueId = `TRY-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`

    // Get authenticated user
    const { data: { user } } = await supabaseClient.auth.getUser()

    // Create tray
    const { data: tray, error: trayError } = await supabaseClient
      .from('trays')
      .insert({
        tray_unique_id: trayUniqueId,
        recipe_id: recipeId,
        customer_id: customerId,
        farm_uuid: farmUuid,
        batch_id: batchId,
        sow_date: new Date().toISOString(),
        created_by: user?.id,
      })
      .select()
      .single()

    if (trayError) throw trayError

    // Get recipe steps
    const { data: steps, error: stepsError } = await supabaseClient
      .from('steps')
      .select('*')
      .eq('recipe_id', recipeId)
      .order('step_order')

    if (stepsError) throw stepsError

    // Create tray steps
    if (steps && steps.length > 0) {
      const traySteps = steps.map(step => ({
        tray_id: tray.tray_id,
        step_id: step.step_id,
        completed: false,
      }))

      const { error: trayStepsError } = await supabaseClient
        .from('tray_steps')
        .insert(traySteps)

      if (trayStepsError) throw trayStepsError
    }

    return new Response(
      JSON.stringify({ success: true, tray, message: 'Tray created successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
