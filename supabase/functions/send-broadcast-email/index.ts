import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create client with user's auth token
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Create admin client for database operations
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

    // Parse request body
    const { subject, htmlBody, testEmail, targetTable, trialStatus } = await req.json()

    // Validate required fields
    if (!subject || !htmlBody) {
      return new Response(
        JSON.stringify({ error: 'Subject and htmlBody are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate Resend API key
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({
          error: 'RESEND_API_KEY not configured',
          hint: 'Set the secret in Supabase Dashboard → Edge Functions → Secrets, then redeploy.'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get authenticated user for sent_by field
    let sentByUserId: string | null = null
    try {
      const { data: { user } } = await supabaseClient.auth.getUser()
      sentByUserId = user?.id ?? null
    } catch (authError) {
      console.warn('Could not get authenticated user:', authError)
    }

    // Determine recipients
    let recipients: Array<{ email: string }> = []

    if (testEmail) {
      // Test mode - send to single email
      recipients = [{ email: testEmail }]
    } else {
      // Broadcast mode - fetch users from database
      const table = targetTable || 'profile'

      let query = supabaseAdmin
        .from(table)
        .select('email')
        .not('email', 'is', null)

      // Apply filters for profile table
      if (table === 'profile') {
        query = query.eq('is_active', true)

        if (trialStatus && trialStatus !== 'all') {
          query = query.eq('trial_status', trialStatus)
        }
      }

      const { data: users, error: usersError } = await query

      if (usersError) {
        console.error(`Error fetching users from ${table}:`, usersError)
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

    // Save broadcast details BEFORE sending emails
    let broadcastRecordId: string | null = null
    try {
      const { data: broadcastRecord, error: broadcastInsertError } = await supabaseAdmin
        .from('email_broadcasts')
        .insert({
          campaign_id: campaignId,
          subject: subject,
          html_body: htmlBody,
          target_table: testEmail ? null : (targetTable || 'profile'),
          trial_status_filter: testEmail ? null : (trialStatus || null),
          recipient_count: recipients.length,
          emails_sent: 0,
          is_test: !!testEmail,
          test_email: testEmail || null,
          sent_by: sentByUserId,
          status: 'sending'
        })
        .select('id')
        .single()

      if (broadcastInsertError) {
        console.error('Error saving broadcast record:', broadcastInsertError)
      } else {
        broadcastRecordId = broadcastRecord?.id ?? null
        console.log(`Saved broadcast record: ${broadcastRecordId}`)
      }
    } catch (broadcastSaveError) {
      console.error('Exception saving broadcast record:', broadcastSaveError)
      // Continue with sending - don't block on DB error
    }

    // Send emails via Resend batch API
    const results: Array<{ id: string; to: string }> = []
    const batchSize = 100
    const allSentEvents: Array<{
      email_id: string
      event_type: string
      recipient_email: string
      subject: string
      campaign_id: string
      clicked_link: null
    }> = []

    // Track batch success/failure
    let batchesSent = 0
    let batchesFailed = 0
    const totalBatches = Math.ceil(recipients.length / batchSize)
    let sendError: Error | null = null

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize)

      const emails = batch.map(recipient => ({
        from: 'Team Sproutify <team@sproutify.app>',
        to: recipient.email,
        subject: subject,
        html: htmlBody,
        headers: {
          'X-Entity-Ref-ID': campaignId
        },
        tags: [
          { name: 'campaign', value: campaignId },
          { name: 'type', value: testEmail ? 'test' : 'broadcast' }
        ],
        tracking: {
          opens: true,
          clicks: true
        }
      }))

      try {
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
        const batchResults = resendData.data || []
        results.push(...batchResults)
        batchesSent++

        // Log sent events
        batchResults.forEach((result: any, index: number) => {
          const recipientEmail = batch[index]?.email || result.to || 'unknown'
          const emailId = result.id || `temp-${Date.now()}-${Math.random()}`
          allSentEvents.push({
            email_id: emailId,
            event_type: 'email.sent',
            recipient_email: recipientEmail,
            subject: subject,
            campaign_id: campaignId,
            clicked_link: null,
          })
        })
      } catch (batchError) {
        console.error(`Batch ${Math.floor(i / batchSize) + 1} failed:`, batchError)
        batchesFailed++
        sendError = batchError instanceof Error ? batchError : new Error(String(batchError))
        // Continue with remaining batches
      }
    }

    // Update broadcast record status
    if (broadcastRecordId) {
      let finalStatus: string
      if (batchesFailed === 0) {
        finalStatus = 'sent'
      } else if (batchesSent === 0) {
        finalStatus = 'failed'
      } else {
        finalStatus = 'partial_failure'
      }

      try {
        const { error: statusUpdateError } = await supabaseAdmin
          .from('email_broadcasts')
          .update({
            status: finalStatus,
            emails_sent: allSentEvents.length
          })
          .eq('id', broadcastRecordId)

        if (statusUpdateError) {
          console.error('Error updating broadcast status:', statusUpdateError)
        } else {
          console.log(`Updated broadcast ${broadcastRecordId} status to: ${finalStatus}`)
        }
      } catch (statusError) {
        console.error('Exception updating broadcast status:', statusError)
      }
    }

    // If all batches failed, throw error
    if (batchesSent === 0 && sendError) {
      throw sendError
    }

    // Insert sent events into email_events table
    if (allSentEvents.length > 0) {
      try {
        const { error: insertError } = await supabaseAdmin
          .from('email_events')
          .insert(allSentEvents)

        if (insertError) {
          console.error('Error logging sent events:', insertError)
        }
      } catch (logError) {
        console.error('Exception inserting sent events:', logError)
      }
    }

    return new Response(
      JSON.stringify({
        success: batchesFailed === 0,
        partialFailure: batchesFailed > 0 && batchesSent > 0,
        emailsSent: allSentEvents.length,
        recipientCount: recipients.length,
        testMode: !!testEmail,
        campaignId: campaignId,
        broadcastId: broadcastRecordId,
        results: results,
        eventsLogged: allSentEvents.length,
        batchStats: {
          total: totalBatches,
          sent: batchesSent,
          failed: batchesFailed
        }
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
