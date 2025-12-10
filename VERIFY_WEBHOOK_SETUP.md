# Verify Resend Webhook Setup

## Quick Checklist

### ✅ 1. Webhook Function Deployed
- [ ] Go to Supabase Dashboard → Edge Functions
- [ ] Verify `resend-webhook` function exists and is deployed
- [ ] If not, deploy it: `supabase functions deploy resend-webhook`

### ✅ 2. Webhook Secret Configured
- [ ] Go to Supabase Dashboard → Edge Functions → Settings → Secrets
- [ ] Verify `RESEND_WEBHOOK_SECRET` exists
- [ ] Value should be: `whsec_fAVZgC4HiKgTSZnwsTpC47dkzHxDvJxH`
- [ ] If missing, add it and redeploy the function

### ✅ 3. Webhook Configured in Resend
- [ ] Go to https://resend.com → Webhooks
- [ ] Verify webhook exists with URL: `https://rmjyfdmwnmaerthcoosq.supabase.co/functions/v1/resend-webhook?apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtanlmZG13bm1hZXJ0aGNvb3NxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDk0ODgxNTMsImV4cCI6MjAyNTA2NDE1M30.qqErJJQlxHpwZWRHWLDouGWLHIaYn09R-EZdot8ZqDg`
- [ ] **Important**: The `apikey` query parameter is required for Supabase authentication
- [ ] Verify it's **enabled** (not paused)
- [ ] Verify it's subscribed to these events:
  - `email.sent`
  - `email.delivered`
  - `email.delivery_delayed`
  - `email.complained`
  - `email.bounced`
  - `email.opened`
  - `email.clicked`

### ✅ 4. Email Events Table & RLS
- [ ] Run migration `034_create_email_events_table.sql`
- [ ] Run migration `033_add_admin_rls_policies.sql` (includes email_events admin policy)
- [ ] Verify `email_events` table exists in Supabase Dashboard → Table Editor

## Testing Webhook

### Step 1: Send a Test Email
1. Go to `/admin-portal/email-broadcast`
2. Use "Test Mode"
3. Enter your email address
4. Send a test email

### Step 2: Check Webhook Logs
1. Go to Supabase Dashboard → Edge Functions → `resend-webhook` → Logs
2. Look for:
   - "Webhook received" log entries
   - "Event successfully inserted" messages
   - Any error messages

### Step 3: Check Email Events Page
1. Go to `/admin-portal/email-events`
2. Wait 10-30 seconds after sending email
3. You should see events like:
   - `email.sent` (immediate)
   - `email.delivered` (within seconds)
   - `email.opened` (when recipient opens email)
   - `email.clicked` (when recipient clicks links)

## Troubleshooting

### No Events Appearing

**Check 1: Webhook URL in Resend**
- Verify the webhook URL is exactly: `https://rmjyfdmwnmaerthcoosq.supabase.co/functions/v1/resend-webhook`
- No trailing slashes or typos

**Check 2: Webhook Status in Resend**
- Go to Resend Dashboard → Webhooks
- Click on your webhook
- Check "Recent Events" tab
- Look for failed deliveries (red status)
- Check error messages

**Check 3: Function Logs**
- Supabase Dashboard → Edge Functions → `resend-webhook` → Logs
- Look for:
  - "Invalid webhook signature" → Secret mismatch
  - "Missing svix-signature" → Webhook not configured correctly
  - "Error inserting email event" → Database/RLS issue

**Check 4: RLS Policies**
- Make sure migration `033_add_admin_rls_policies.sql` has been run
- This adds admin access to `email_events` table
- The webhook uses service role, so RLS shouldn't block it, but verify

### Historical Emails Not Tracked

**This is expected!** 
- Emails sent **before** webhook setup will NOT be tracked
- Only emails sent **after** webhook is configured will generate events
- Resend doesn't retroactively send webhooks for past emails

### Webhook Signature Errors

If you see "Invalid webhook signature":
1. Verify `RESEND_WEBHOOK_SECRET` in Supabase matches the secret in Resend
2. In Resend Dashboard → Webhooks → Your webhook → Settings
3. Copy the "Signing Secret" (starts with `whsec_`)
4. Make sure it matches exactly in Supabase Edge Functions secrets
5. Redeploy the function after updating the secret

## Expected Flow

1. **Send Email** → `send-broadcast-email` function sends via Resend API
2. **Resend Processes** → Resend queues and sends the email
3. **Resend Sends Webhook** → Resend POSTs event to `resend-webhook` function
4. **Webhook Receives** → Function verifies signature and parses event
5. **Event Stored** → Function inserts event into `email_events` table
6. **Events Visible** → Admin Email Events page shows the events

## Timeline

- **email.sent**: Appears immediately after Resend accepts the email
- **email.delivered**: Appears within 1-5 seconds after sending
- **email.opened**: Appears when recipient opens email (can be minutes/hours later)
- **email.clicked**: Appears when recipient clicks a link in the email

## Next Steps

After verifying webhook setup:
1. Send a new test email
2. Check Email Events page within 30 seconds
3. You should see `email.sent` and `email.delivered` events
4. If you open the email, you should see `email.opened` event
5. If you click a link, you should see `email.clicked` event

