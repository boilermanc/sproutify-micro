-- Create email_broadcasts table to store broadcast history
CREATE TABLE IF NOT EXISTS email_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  target_table TEXT,                    -- 'profile' or 'pre_registrations', null for test emails
  trial_status_filter TEXT,             -- 'all', 'none', 'active', 'converted', 'expired'
  recipient_count INTEGER NOT NULL,
  emails_sent INTEGER DEFAULT 0,        -- actual number sent (updated after sending)
  is_test BOOLEAN DEFAULT FALSE,
  test_email TEXT,                      -- the test email address if is_test is true
  sent_by UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed', 'partial_failure')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_email_broadcasts_campaign_id ON email_broadcasts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_broadcasts_created_at ON email_broadcasts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_broadcasts_status ON email_broadcasts(status);
CREATE INDEX IF NOT EXISTS idx_email_broadcasts_sent_by ON email_broadcasts(sent_by);

-- Enable RLS
ALTER TABLE email_broadcasts ENABLE ROW LEVEL SECURITY;

-- Admin read policy - only admins can view broadcast history
CREATE POLICY "Admins can view email broadcasts"
  ON email_broadcasts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profile
      WHERE profile.id = auth.uid()
      AND profile.is_admin = true
    )
  );

-- Service role can insert/update (for Edge Functions)
CREATE POLICY "Service role can manage email broadcasts"
  ON email_broadcasts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Add comment for documentation
COMMENT ON TABLE email_broadcasts IS 'Stores history of all email broadcasts sent from admin portal';
COMMENT ON COLUMN email_broadcasts.status IS 'sending = in progress, sent = all succeeded, failed = all failed, partial_failure = some batches failed';
