# Admin Portal Setup Guide

This guide covers setting up the complete admin portal functionality, including email features.

## Prerequisites

1. **Admin User**: Ensure `team@sproutify.app` exists in Supabase Auth
2. **Resend API Account**: Sign up at https://resend.com and get your API key

## Setup Steps

### 1. Run Database Migrations

```bash
# Apply admin RLS policies
supabase migration up 033_add_admin_rls_policies

# Create email_events table
supabase migration up 034_create_email_events_table
```

Or apply via Supabase Dashboard:
- Go to SQL Editor
- Run the SQL from `supabase/migrations/033_add_admin_rls_policies.sql`
- Run the SQL from `supabase/migrations/034_create_email_events_table.sql`

### 2. Set Up Resend API

1. **Get Resend API Key**:
   - Use the same Resend API key from Rejoice project
   - Or sign up at https://resend.com if new
   - Go to API Keys section
   - Copy the key (starts with `re_`)

2. **Add Domain** (if not already done):
   - Domain `sproutify.app` should already be verified for Rejoice
   - If not, add domain in Resend and verify DNS records
   - This allows sending from `team@sproutify.app`

### 3. Configure Supabase Edge Functions

#### Set Environment Variables

In Supabase Dashboard → Edge Functions → Settings:

Add these secrets:
- `RESEND_API_KEY`: Your Resend API key (e.g., `re_xxxxxxxxxxxxx`)
- `RESEND_WEBHOOK_SECRET`: Your Resend webhook signing secret (e.g., `whsec_fAVZgC4HiKgTSZnwsTpC47dkzHxDvJxH`) - **Required for webhook security**

These are already available:
- `SUPABASE_URL`: Auto-configured
- `SUPABASE_ANON_KEY`: Auto-configured  
- `SUPABASE_SERVICE_ROLE_KEY`: Auto-configured

#### Deploy Edge Functions

```bash
# Deploy send-broadcast-email function
supabase functions deploy send-broadcast-email

# Deploy resend-webhook function
supabase functions deploy resend-webhook
```

Or via Supabase Dashboard:
- Go to Edge Functions
- Create new function: `send-broadcast-email`
- Copy code from `supabase/functions/send-broadcast-email/index.ts`
- Create new function: `resend-webhook`
- Copy code from `supabase/functions/resend-webhook/index.ts`

### 4. Configure Resend Webhook

1. **Get Webhook URL**:
   - Your webhook URL (with apikey for authentication): 
   - `https://rmjyfdmwnmaerthcoosq.supabase.co/functions/v1/resend-webhook?apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtanlmZG13bm1hZXJ0aGNvb3NxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDk0ODgxNTMsImV4cCI6MjAyNTA2NDE1M30.qqErJJQlxHpwZWRHWLDouGWLHIaYn09R-EZdot8ZqDg`
   - **Important**: The `apikey` query parameter is required for Supabase Edge Functions to accept webhook requests without an Authorization header

2. **Set Up Webhook in Resend**:
   - Go to Resend Dashboard → Webhooks
   - Add new webhook (or edit existing)
   - URL: `https://rmjyfdmwnmaerthcoosq.supabase.co/functions/v1/resend-webhook?apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtanlmZG13bm1hZXJ0aGNvb3NxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDk0ODgxNTMsImV4cCI6MjAyNTA2NDE1M30.qqErJJQlxHpwZWRHWLDouGWLHIaYn09R-EZdot8ZqDg`
   - Events to subscribe:
     - `email.sent`
     - `email.delivered`
     - `email.delivery_delayed`
     - `email.complained`
     - `email.bounced`
     - `email.opened`
     - `email.clicked`

3. **Webhook Security** (required):
   - The webhook function verifies signatures using `RESEND_WEBHOOK_SECRET`
   - Set this secret in Supabase Edge Functions settings
   - Value: `whsec_fAVZgC4HiKgTSZnwsTpC47dkzHxDvJxH`
   - The webhook will reject requests with invalid signatures
   - This prevents unauthorized webhook calls

### 5. Install Frontend Dependencies

```bash
cd web-admin
npm install react-quill
```

This enables the rich text editor in the Email Broadcast page. The page will work with a plain textarea if this isn't installed.

### 6. Test the Setup

1. **Test Admin Login**:
   - Go to `/admin-portal/login`
   - Login with `team@sproutify.app`
   - Should redirect to admin dashboard

2. **Test Email Broadcast**:
   - Go to `/admin-portal/email-broadcast`
   - Use "Test Mode" to send a test email
   - Check your email inbox

3. **Test Email Events**:
   - Send a test email
   - Check `/admin-portal/email-events`
   - Events should appear after Resend processes them

## Environment Variables Summary

### Supabase Edge Functions
- `RESEND_API_KEY` - Required for sending emails (same as Rejoice - get from Resend dashboard)
- `SUPABASE_URL` - Auto-configured
- `SUPABASE_SERVICE_ROLE_KEY` - Auto-configured

**Note**: You can use the same Resend API key that's already configured for Rejoice. The API key is project-wide in Resend.

### Frontend (web-admin)
- `VITE_SUPABASE_URL` - Already configured
- `VITE_SUPABASE_ANON_KEY` - Already configured

## Troubleshooting

### Email Broadcast Not Working
- Check Resend API key is set correctly
- Verify domain is verified in Resend (for production)
- Check edge function logs in Supabase Dashboard

### Email Events Not Appearing
- Verify webhook is configured in Resend
- Check webhook URL is correct
- Check edge function logs for errors
- Ensure `email_events` table exists

### RLS Errors (400)
- Run migration `033_add_admin_rls_policies.sql`
- Verify `team@sproutify.app` user exists
- Check user has `app_metadata.role = 'admin'`

### React Quill Not Loading
- Run `npm install react-quill` in `web-admin` directory
- The page will work with textarea fallback if not installed

## Features Available

Once set up, the admin portal provides:

1. **Dashboard**: Overview metrics across all farms
2. **Farms & Users**: View and manage all farms and users
3. **Recipes & Varieties**: View all recipes and varieties
4. **Trays & Batches**: View all trays and seed batches
5. **Customers & Orders**: View all customers and orders
6. **Products**: View all products
7. **Notifications**: Send push notifications to users
8. **Email Broadcast**: Send HTML emails to users (test or broadcast mode)
9. **Email Events**: Track email delivery, opens, clicks, bounces

## Security Notes

- Admin access is restricted to `team@sproutify.app` only
- RLS policies ensure admin can view all data but regular users can only see their farm's data
- Service role key is only used in edge functions (server-side)
- Resend API key should be kept secret (stored in Supabase secrets)

