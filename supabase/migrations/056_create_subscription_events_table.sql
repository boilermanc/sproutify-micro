-- Migration 056: Create subscription_events table
-- Audit log for all Stripe webhook events processed

CREATE TABLE IF NOT EXISTS subscription_events (
    id SERIAL PRIMARY KEY,
    stripe_event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    farm_uuid UUID REFERENCES farms(farm_uuid) ON DELETE SET NULL,
    stripe_subscription_id TEXT,
    stripe_customer_id TEXT,
    payload JSONB,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    error_message TEXT
);

-- Indexes for querying events
CREATE INDEX IF NOT EXISTS idx_subscription_events_farm_uuid ON subscription_events(farm_uuid);
CREATE INDEX IF NOT EXISTS idx_subscription_events_event_type ON subscription_events(event_type);
CREATE INDEX IF NOT EXISTS idx_subscription_events_stripe_event_id ON subscription_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_processed_at ON subscription_events(processed_at);

-- No RLS needed - this table is only accessed by service role in webhooks
-- But enable it with admin-only access for security
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

-- Only admin can view subscription events
CREATE POLICY "Admin can view subscription events" ON subscription_events
    FOR SELECT
    USING (is_admin_user());

-- Add comments for documentation
COMMENT ON TABLE subscription_events IS 'Audit log of all Stripe webhook events for debugging and compliance';
COMMENT ON COLUMN subscription_events.stripe_event_id IS 'Unique Stripe event ID for idempotency';
COMMENT ON COLUMN subscription_events.event_type IS 'Stripe event type (e.g., customer.subscription.created)';
COMMENT ON COLUMN subscription_events.payload IS 'Full Stripe event data object';
COMMENT ON COLUMN subscription_events.error_message IS 'Error message if event processing failed';
