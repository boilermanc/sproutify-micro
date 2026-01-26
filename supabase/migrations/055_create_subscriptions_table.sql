-- Migration 055: Create subscriptions table
-- Stores detailed subscription information synced from Stripe

CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    farm_uuid UUID NOT NULL REFERENCES farms(farm_uuid) ON DELETE CASCADE,
    stripe_subscription_id TEXT UNIQUE NOT NULL,
    stripe_price_id TEXT NOT NULL,
    tier TEXT NOT NULL CHECK (tier IN ('starter', 'growth', 'pro')),
    status TEXT NOT NULL CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete', 'trialing')),
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    canceled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_farm_uuid ON subscriptions(farm_uuid);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- Enable Row Level Security
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own farm's subscriptions
CREATE POLICY "Users can view their farm subscriptions" ON subscriptions
    FOR SELECT
    USING (farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid()));

-- RLS Policy: Admin can view all subscriptions
CREATE POLICY "Admin can view all subscriptions" ON subscriptions
    FOR SELECT
    USING (is_admin_user());

-- Add comments for documentation
COMMENT ON TABLE subscriptions IS 'Stripe subscription records synced via webhooks';
COMMENT ON COLUMN subscriptions.tier IS 'Subscription tier: starter, growth, pro';
COMMENT ON COLUMN subscriptions.status IS 'Stripe subscription status';
COMMENT ON COLUMN subscriptions.current_period_end IS 'When the current billing period ends (renewal date)';
COMMENT ON COLUMN subscriptions.cancel_at_period_end IS 'True if subscription will cancel at period end';
