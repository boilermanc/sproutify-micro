-- Migration 057: Create subscription helper functions
-- Functions for tray limits and tier management

-- Function to get active tray count for a farm
-- Active trays are those with status 'active' (not harvested or lost)
CREATE OR REPLACE FUNCTION get_active_tray_count(p_farm_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN COALESCE((
        SELECT COUNT(*)::INTEGER
        FROM trays
        WHERE farm_uuid = p_farm_uuid
          AND status = 'active'
    ), 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get farm's effective tier
-- Returns the tier based on subscription status (trial users get 'starter' limits)
CREATE OR REPLACE FUNCTION get_farm_tier(p_farm_uuid UUID)
RETURNS TEXT AS $$
DECLARE
    v_tier TEXT;
    v_status TEXT;
BEGIN
    SELECT subscription_plan, subscription_status
    INTO v_tier, v_status
    FROM farms
    WHERE farm_uuid = p_farm_uuid;

    -- Trial users get starter tier limits
    IF v_status = 'trial' THEN
        RETURN 'starter';
    END IF;

    -- Expired/cancelled users get no tier (blocked)
    IF v_status IN ('expired', 'cancelled') THEN
        RETURN NULL;
    END IF;

    -- Return subscription plan or default to starter
    RETURN COALESCE(v_tier, 'starter');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get tray limit for a tier
CREATE OR REPLACE FUNCTION get_tier_tray_limit(p_tier TEXT)
RETURNS INTEGER AS $$
BEGIN
    RETURN CASE p_tier
        WHEN 'starter' THEN 50
        WHEN 'growth' THEN 150
        WHEN 'pro' THEN 999999  -- Effectively unlimited
        ELSE 0  -- No subscription = no trays allowed
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check if a farm can create more trays
CREATE OR REPLACE FUNCTION can_create_tray(p_farm_uuid UUID, p_quantity INTEGER DEFAULT 1)
RETURNS BOOLEAN AS $$
DECLARE
    v_tier TEXT;
    v_limit INTEGER;
    v_current INTEGER;
    v_status TEXT;
BEGIN
    -- Check subscription status first
    SELECT subscription_status INTO v_status
    FROM farms
    WHERE farm_uuid = p_farm_uuid;

    -- Expired or cancelled subscriptions cannot create trays
    IF v_status IN ('expired', 'cancelled') THEN
        RETURN FALSE;
    END IF;

    -- Get tier and limits
    v_tier := get_farm_tier(p_farm_uuid);

    -- No tier means no access
    IF v_tier IS NULL THEN
        RETURN FALSE;
    END IF;

    v_limit := get_tier_tray_limit(v_tier);
    v_current := get_active_tray_count(p_farm_uuid);

    RETURN (v_current + p_quantity) <= v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get remaining tray capacity
CREATE OR REPLACE FUNCTION get_remaining_tray_capacity(p_farm_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
    v_tier TEXT;
    v_limit INTEGER;
    v_current INTEGER;
BEGIN
    v_tier := get_farm_tier(p_farm_uuid);

    IF v_tier IS NULL THEN
        RETURN 0;
    END IF;

    v_limit := get_tier_tray_limit(v_tier);
    v_current := get_active_tray_count(p_farm_uuid);

    RETURN GREATEST(v_limit - v_current, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a view for farm subscription status (useful for frontend queries)
CREATE OR REPLACE VIEW farm_subscription_status AS
SELECT
    f.farm_uuid,
    f.farm_name,
    f.subscription_status,
    f.subscription_plan,
    f.stripe_customer_id,
    f.trial_start_date,
    f.trial_end_date,
    get_farm_tier(f.farm_uuid) AS effective_tier,
    get_active_tray_count(f.farm_uuid) AS active_tray_count,
    get_tier_tray_limit(get_farm_tier(f.farm_uuid)) AS tray_limit,
    get_remaining_tray_capacity(f.farm_uuid) AS trays_remaining,
    can_create_tray(f.farm_uuid, 1) AS can_create_trays,
    s.stripe_subscription_id,
    s.current_period_start,
    s.current_period_end,
    s.cancel_at_period_end
FROM farms f
LEFT JOIN subscriptions s ON f.farm_uuid = s.farm_uuid AND s.status = 'active';

-- Grant access to the view
GRANT SELECT ON farm_subscription_status TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION get_active_tray_count(UUID) IS 'Returns count of active (non-harvested, non-lost) trays for a farm';
COMMENT ON FUNCTION get_farm_tier(UUID) IS 'Returns effective subscription tier for a farm (trial users get starter)';
COMMENT ON FUNCTION get_tier_tray_limit(TEXT) IS 'Returns tray limit for a subscription tier';
COMMENT ON FUNCTION can_create_tray(UUID, INTEGER) IS 'Checks if farm can create specified number of trays';
COMMENT ON FUNCTION get_remaining_tray_capacity(UUID) IS 'Returns number of trays farm can still create';
COMMENT ON VIEW farm_subscription_status IS 'Comprehensive view of farm subscription and tray usage status';
