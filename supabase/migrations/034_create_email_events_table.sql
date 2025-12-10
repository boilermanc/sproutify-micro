-- Migration: Create email_events table
-- Description: Track email events from Resend webhooks (sent, delivered, opened, clicked, bounced, complained)

CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'email.sent',
    'email.delivered',
    'email.delivery_delayed',
    'email.complained',
    'email.bounced',
    'email.opened',
    'email.clicked'
  )),
  recipient_email TEXT NOT NULL,
  subject TEXT,
  campaign_id TEXT,
  clicked_link TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_email_events_email_id ON email_events(email_id);
CREATE INDEX IF NOT EXISTS idx_email_events_event_type ON email_events(event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_recipient_email ON email_events(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_events_campaign_id ON email_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_created_at ON email_events(created_at DESC);

-- Enable Row Level Security
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

-- Policy: Admin users can view all email events
-- This will be updated by migration 033_add_admin_rls_policies.sql to use is_admin_user()
-- For now, create a basic policy that will be replaced
DROP POLICY IF EXISTS "Admin can view all email events" ON email_events;
CREATE POLICY "Admin can view all email events" ON email_events
  FOR SELECT
  USING (false); -- Will be replaced by admin policies migration

-- Policy: Allow webhook to insert events (via service role)
-- This will be handled by the edge function using service role key
-- For now, we'll allow authenticated inserts (webhook will use service role)
CREATE POLICY "Service role can insert email events" ON email_events
  FOR INSERT
  WITH CHECK (true);

