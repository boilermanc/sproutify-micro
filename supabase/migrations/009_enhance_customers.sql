-- Enhance customers table with delivery and payment information
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS delivery_instructions TEXT,
ADD COLUMN IF NOT EXISTS payment_instructions TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS preferred_delivery_days TEXT[], -- Array of days: ['Monday', 'Wednesday']
ADD COLUMN IF NOT EXISTS delivery_address TEXT; -- Separate from billing address

-- Add comment for documentation
COMMENT ON COLUMN customers.delivery_instructions IS 'Special instructions for delivery';
COMMENT ON COLUMN customers.payment_instructions IS 'Payment preferences and instructions';
COMMENT ON COLUMN customers.notes IS 'General notes about the customer';
COMMENT ON COLUMN customers.preferred_delivery_days IS 'Array of preferred delivery days of the week';
COMMENT ON COLUMN customers.delivery_address IS 'Delivery address (may differ from billing address)';

-- Add index for preferred_delivery_days queries (using GIN index for array)
CREATE INDEX IF NOT EXISTS idx_customers_preferred_delivery_days ON customers USING GIN(preferred_delivery_days);

