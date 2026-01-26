-- Migration 053: Add Stripe Customer ID to farms table
-- This links farms to Stripe customers for subscription management

-- Add stripe_customer_id column to farms table
ALTER TABLE farms
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;

-- Create index for fast lookups by Stripe customer ID
CREATE INDEX IF NOT EXISTS idx_farms_stripe_customer_id ON farms(stripe_customer_id);

-- Add comment for documentation
COMMENT ON COLUMN farms.stripe_customer_id IS 'Stripe customer ID (cus_xxx) for subscription billing';
