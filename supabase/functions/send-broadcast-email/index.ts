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

    const { subject, htmlBody, testEmail, targetTable, trialStatus } = await req.json()

    if (!subject || !htmlBody) {
      return new Response(
        JSON.stringify({ error: 'Subject and htmlBody are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Debug: Log all environment variables (for troubleshooting)
    const allEnvKeys = Object.keys(Deno.env.toObject())
    console.log('=== DEBUG: All environment variables ===')
    console.log('Total env vars:', allEnvKeys.length)
    console.log('All keys:', allEnvKeys)
    const resendKeys = allEnvKeys.filter(k => k.toUpperCase().includes('RESEND'))
    console.log('RESEND-related keys:', resendKeys)
    console.log('RESEND_API_KEY value:', Deno.env.get('RESEND_API_KEY') ? '***SET***' : 'NOT SET')
    console.log('========================================')
    
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      
      return new Response(
        JSON.stringify({ 
          error: 'RESEND_API_KEY not configured',
          hint: 'Make sure the secret is set in Supabase Dashboard → Edge Functions → Settings → Secrets, and the function is redeployed after adding the secret.',
          debug: {
            availableResendKeys: resendKeys,
            totalEnvKeys: allEnvKeys.length
          }
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let recipients: Array<{ email: string }> = []

    if (testEmail) {
      // Test mode - send to single email
      recipients = [{ email: testEmail }]
    } else {
      // Broadcast mode - fetch users from database
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      )

      // Determine which table to query (default to profile)
      const table = targetTable || 'profile'
      
      let query = supabaseAdmin
        .from(table)
        .select('email')
        .not('email', 'is', null)

      // Only apply is_active filter for profile table
      if (table === 'profile') {
        query = query.eq('is_active', true)
      }

      // Only apply trial_status filter for profile table
      if (table === 'profile' && trialStatus && trialStatus !== 'all') {
        // Note: This assumes trial_status column exists in profile
        // If not, remove this filter
        query = query.eq('trial_status', trialStatus)
      }

      const { data: users, error: usersError } = await query

      if (usersError) {
        console.error(`Error fetching users from ${table}:`, usersError)
        // Continue with empty list if error (might be missing column)
        recipients = []
      } else {
        recipients = (users || []).map(user => ({ email: user.email }))
      }
    }

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No recipients found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate campaign ID
    const campaignId = `campaign-${Date.now()}`

    // Log sent events immediately to email_events table
    // This ensures we track emails even if webhooks aren't configured
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Send emails via Resend API batch endpoint
    const results: Array<{ id: string; to: string }> = []
    const batchSize = 100
    const allSentEvents: Array<{
      email_id: string;
      event_type: string;
      recipient_email: string;
      subject: string;
      campaign_id: string;
      clicked_link: null;
    }> = []

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize)
      
      // Format emails for Resend batch API
      const emails = batch.map(recipient => ({
        from: 'Team Sproutify <team@sproutify.app>',
        to: recipient.email,
        subject: subject,
        html: htmlBody,
        headers: {
          'X-Entity-Ref-ID': campaignId
        },
        tags: [
          {
            name: 'campaign',
            value: campaignId
          },
          {
            name: 'type',
            value: testEmail ? 'test' : 'broadcast'
          }
        ],
        tracking: {
          opens: true,
          clicks: true
        }
      }))
      
      const resendResponse = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emails),
      })

      if (!resendResponse.ok) {
        const errorData = await resendResponse.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(`Resend API error: ${errorData.error || resendResponse.statusText}`)
      }

      const resendData = await resendResponse.json()
      console.log('Resend API response:', JSON.stringify(resendData, null, 2))
      const batchResults = resendData.data || []
      results.push(...batchResults)

      // Map Resend response to recipients and log sent events
      batchResults.forEach((result: any, index: number) => {
        const recipientEmail = batch[index]?.email || result.to || 'unknown'
        const emailId = result.id || `temp-${Date.now()}-${Math.random()}`
        console.log(`Mapping email: ${emailId} -> ${recipientEmail}`)
        allSentEvents.push({
          email_id: emailId,
          event_type: 'email.sent',
          recipient_email: recipientEmail,
          subject: subject,
          campaign_id: campaignId,
          clicked_link: null,
        })
      })
    }

    // Insert all sent events into database
    console.log(`Attempting to insert ${allSentEvents.length} sent events`)
    if (allSentEvents.length > 0) {
      try {
        const { data: insertedData, error: insertError } = await supabaseAdmin
          .from('email_events')
          .insert(allSentEvents)
          .select()

        if (insertError) {
          console.error('Error logging sent events:', JSON.stringify(insertError, null, 2))
          console.error('Insert error details:', {
            message: insertError.message,
            code: insertError.code,
            details: insertError.details,
            hint: insertError.hint
          })
          // Don't fail the request if logging fails
        } else {
          console.log(`Successfully logged ${insertedData?.length || 0} sent events to email_events table`)
          console.log('Inserted events:', JSON.stringify(insertedData, null, 2))
        }
      } catch (logError) {
        console.error('Exception inserting sent events:', logError)
        console.error('Exception details:', {
          message: logError instanceof Error ? logError.message : 'Unknown error',
          stack: logError instanceof Error ? logError.stack : undefined
        })
        // Don't fail the request if logging fails
      }
    } else {
      console.warn('No events to log - allSentEvents is empty')
    }

    return new Response(
      JSON.stringify({
        success: true,
        emailsSent: recipients.length,
        testMode: !!testEmail,
        campaignId: campaignId,
        results: results,
        eventsLogged: allSentEvents.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error sending broadcast email:', error)
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

