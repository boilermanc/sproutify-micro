import { useState, useCallback, useEffect, useRef } from 'react';
import { getSupabaseClient } from '@/integrations/supabase/client';

export type SubscriptionTier = 'starter' | 'growth' | 'pro' | null;
export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'cancelled' | 'past_due' | null;

export interface SubscriptionInfo {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  trayLimit: number;
  activeTrayCount: number;
  canCreateTrays: boolean;
  traysRemaining: number;
  trialEndDate: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
}

export interface TierInfo {
  name: string;
  displayName: string;
  price: number;
  trayLimit: number | null; // null = unlimited
  description: string;
  features: string[];
}

export const TIER_INFO: Record<string, TierInfo> = {
  starter: {
    name: 'starter',
    displayName: 'Starter',
    price: 12.99,
    trayLimit: 50,
    description: 'Perfect for small growers',
    features: [
      'Up to 50 active trays',
      'Sage AI assistant',
      'Mobile app access',
      'Seeding schedules',
      'Harvest tracking',
      'Customer order management',
    ],
  },
  growth: {
    name: 'growth',
    displayName: 'Growth',
    price: 24.99,
    trayLimit: 150,
    description: 'For growing operations',
    features: [
      'Up to 150 active trays',
      'All Starter features',
      'Inventory forecasting',
      'Standing orders',
      'Advanced reporting',
    ],
  },
  pro: {
    name: 'pro',
    displayName: 'Pro',
    price: 39.99,
    trayLimit: null,
    description: 'Unlimited trays for established farms',
    features: [
      'Unlimited trays',
      'All Growth features',
      'Advanced analytics',
      'Priority support',
      'All future features',
    ],
  },
};

const DEFAULT_SUBSCRIPTION: SubscriptionInfo = {
  tier: null,
  status: null,
  trayLimit: 0,
  activeTrayCount: 0,
  canCreateTrays: false,
  traysRemaining: 0,
  trialEndDate: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  stripeCustomerId: null,
};

export const useSubscription = () => {
  const [subscription, setSubscription] = useState<SubscriptionInfo>(DEFAULT_SUBSCRIPTION);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const farmUuidRef = useRef<string | null>(null);

  const fetchSubscriptionData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const client = getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();
      let userId = session?.user?.id ?? null;

      // Fallback to stored session
      if (!userId) {
        const storedSession = localStorage.getItem('sproutify_session');
        if (storedSession) {
          try {
            const parsed = JSON.parse(storedSession);
            userId = parsed?.userId ?? userId;
          } catch (e) {
            console.error('Error parsing stored session:', e);
          }
        }
      }

      if (!userId) {
        setSubscription(DEFAULT_SUBSCRIPTION);
        return;
      }

      // Get profile and farm_uuid
      const { data: profile } = await client
        .from('profile')
        .select('farm_uuid')
        .eq('id', userId)
        .maybeSingle();

      const farmUuid = profile?.farm_uuid ?? null;
      if (!farmUuid) {
        setSubscription(DEFAULT_SUBSCRIPTION);
        return;
      }

      farmUuidRef.current = farmUuid;

      // Fetch subscription status from the view
      const { data: subStatus, error: subError } = await client
        .from('farm_subscription_status')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .maybeSingle();

      if (subError) {
        // View might not exist yet (pre-migration), fallback to farms table
        console.warn('farm_subscription_status view not available, using farms table');

        const { data: farmData } = await client
          .from('farms')
          .select('subscription_status, subscription_plan, trial_end_date, stripe_customer_id')
          .eq('farm_uuid', farmUuid)
          .maybeSingle();

        if (farmData) {
          const tier = (farmData.subscription_plan as SubscriptionTier) ||
                      (farmData.subscription_status === 'trial' ? 'starter' : null);
          const trayLimit = tier ? (TIER_INFO[tier]?.trayLimit ?? 999999) : 0;

          // Get active tray count
          const { count } = await client
            .from('trays')
            .select('*', { count: 'exact', head: true })
            .eq('farm_uuid', farmUuid)
            .eq('status', 'active');

          const activeTrayCount = count || 0;
          const traysRemaining = Math.max(trayLimit - activeTrayCount, 0);
          const canCreateTrays = farmData.subscription_status !== 'expired' &&
                                farmData.subscription_status !== 'cancelled' &&
                                activeTrayCount < trayLimit;

          setSubscription({
            tier,
            status: farmData.subscription_status as SubscriptionStatus,
            trayLimit,
            activeTrayCount,
            canCreateTrays,
            traysRemaining,
            trialEndDate: farmData.trial_end_date,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            stripeCustomerId: farmData.stripe_customer_id,
          });
        }
        return;
      }

      if (subStatus) {
        setSubscription({
          tier: subStatus.effective_tier as SubscriptionTier,
          status: subStatus.subscription_status as SubscriptionStatus,
          trayLimit: subStatus.tray_limit || 0,
          activeTrayCount: subStatus.active_tray_count || 0,
          canCreateTrays: subStatus.can_create_trays ?? false,
          traysRemaining: subStatus.trays_remaining || 0,
          trialEndDate: subStatus.trial_end_date,
          currentPeriodEnd: subStatus.current_period_end,
          cancelAtPeriodEnd: subStatus.cancel_at_period_end ?? false,
          stripeCustomerId: subStatus.stripe_customer_id,
        });
      }
    } catch (err) {
      console.error('Error fetching subscription data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch subscription');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchSubscriptionData();
  }, [fetchSubscriptionData]);

  // Open Stripe Checkout for subscription
  const openCheckout = useCallback(async (tier: string): Promise<string | null> => {
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.functions.invoke('stripe-checkout', {
        body: {
          tier,
          successUrl: `${window.location.origin}/admin/checkout-success?tier=${tier}`,
          cancelUrl: `${window.location.origin}/admin/pricing?checkout=canceled`,
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
        return data.url;
      }

      throw new Error('No checkout URL returned');
    } catch (err) {
      console.error('Checkout error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create checkout session');
      return null;
    }
  }, []);

  // Open Stripe Customer Portal
  const openPortal = useCallback(async (): Promise<string | null> => {
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.functions.invoke('stripe-portal', {
        body: {
          returnUrl: `${window.location.origin}/admin/settings`,
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
        return data.url;
      }

      throw new Error('No portal URL returned');
    } catch (err) {
      console.error('Portal error:', err);
      setError(err instanceof Error ? err.message : 'Failed to open billing portal');
      return null;
    }
  }, []);

  // Check if can create specific number of trays
  const canCreateTrays = useCallback((quantity: number = 1): boolean => {
    if (subscription.status === 'expired' || subscription.status === 'cancelled') {
      return false;
    }
    return subscription.activeTrayCount + quantity <= subscription.trayLimit;
  }, [subscription]);

  // Get usage percentage
  const getUsagePercentage = useCallback((): number => {
    if (subscription.trayLimit === 0 || subscription.trayLimit >= 999999) {
      return 0;
    }
    return Math.round((subscription.activeTrayCount / subscription.trayLimit) * 100);
  }, [subscription]);

  // Check if approaching limit (80%+)
  const isApproachingLimit = useCallback((): boolean => {
    return getUsagePercentage() >= 80;
  }, [getUsagePercentage]);

  // Get days remaining in trial
  const getTrialDaysRemaining = useCallback((): number | null => {
    if (subscription.status !== 'trial' || !subscription.trialEndDate) {
      return null;
    }
    const endDate = new Date(subscription.trialEndDate);
    const now = new Date();
    const diff = endDate.getTime() - now.getTime();
    return Math.max(Math.ceil(diff / (1000 * 60 * 60 * 24)), 0);
  }, [subscription]);

  return {
    subscription,
    isLoading,
    error,
    refresh: fetchSubscriptionData,
    openCheckout,
    openPortal,
    canCreateTrays,
    getUsagePercentage,
    isApproachingLimit,
    getTrialDaysRemaining,
    tierInfo: TIER_INFO,
  };
};
