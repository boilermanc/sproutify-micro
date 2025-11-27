import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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
    );

    const {
      farm_uuid,
      report_type,
      start_date,
      end_date,
      filters = {},
      user_id,
    } = await req.json();

    // Validate inputs
    if (!farm_uuid || !report_type || !start_date || !end_date) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get n8n webhook URL from environment
    const n8nWebhookUrl = Deno.env.get('N8N_REPORT_WEBHOOK_URL');
    if (!n8nWebhookUrl) {
      console.warn('N8N_REPORT_WEBHOOK_URL not configured, skipping n8n call');
    }

    // Prepare report data based on type
    let reportData: any = {};

    switch (report_type) {
      case 'harvest':
        // Fetch harvest data
        const { data: harvestData } = await supabaseClient
          .from('trays')
          .select(`
            harvest_date,
            yield,
            recipes(recipe_name, variety_name),
            order_items(
              products(product_name),
              product_variants(variant_name, size, unit)
            )
          `)
          .eq('farm_uuid', farm_uuid)
          .not('harvest_date', 'is', null)
          .gte('harvest_date', start_date)
          .lte('harvest_date', end_date);
        reportData = harvestData;
        break;

      case 'delivery':
        // Fetch delivery data
        const { data: deliveryData } = await supabaseClient
          .from('orders')
          .select(`
            delivery_date,
            customers(name, delivery_address),
            order_items(
              quantity,
              unit_price,
              total_price,
              products(product_name),
              product_variants(variant_name, size)
            )
          `)
          .eq('farm_uuid', farm_uuid)
          .not('delivery_date', 'is', null)
          .gte('delivery_date', start_date)
          .lte('delivery_date', end_date);
        reportData = deliveryData;
        break;

      case 'sales':
        // Fetch sales data
        const { data: salesData } = await supabaseClient
          .from('orders')
          .select(`
            order_date,
            total_amount,
            customers(name),
            order_items(
              quantity,
              total_price,
              products(product_name),
              product_variants(variant_name, size)
            )
          `)
          .eq('farm_uuid', farm_uuid)
          .gte('order_date', start_date)
          .lte('order_date', end_date);
        reportData = salesData;
        break;

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid report type' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Call n8n webhook if configured
    let reportUrl: string | null = null;
    if (n8nWebhookUrl) {
      try {
        const n8nResponse = await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            report_type,
            farm_uuid,
            start_date,
            end_date,
            data: reportData,
            filters,
          }),
        });

        if (n8nResponse.ok) {
          const n8nResult = await n8nResponse.json();
          reportUrl = n8nResult.reportUrl || n8nResult.url || null;
        }
      } catch (error) {
        console.error('Error calling n8n webhook:', error);
        // Continue even if n8n call fails
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Report generated successfully',
        reportUrl,
        data: reportData,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error generating report:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

