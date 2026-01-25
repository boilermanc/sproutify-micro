import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Loader2, Sparkles, Zap, Crown, ArrowLeft } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { useSubscription, TIER_INFO } from '@/hooks/useSubscription';

const TIER_ORDER = ['starter', 'growth', 'pro'] as const;

const TIER_ICONS: Record<string, React.ReactNode> = {
  starter: <Sparkles className="h-6 w-6" />,
  growth: <Zap className="h-6 w-6" />,
  pro: <Crown className="h-6 w-6" />,
};

const PricingPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const { subscription, isLoading, openCheckout } = useSubscription();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  // Handle checkout result from URL params
  useEffect(() => {
    const checkoutStatus = searchParams.get('checkout');
    if (checkoutStatus === 'canceled') {
      addToast({
        type: 'info',
        title: 'Checkout Canceled',
        description: 'Your checkout was canceled. No charges were made.',
      });
      // Clear the URL param
      navigate('/pricing', { replace: true });
    }
  }, [searchParams, addToast, navigate]);

  const handleSelectPlan = async (tier: string) => {
    // Don't allow selecting current plan
    if (subscription.tier === tier && subscription.status === 'active') {
      addToast({
        type: 'info',
        title: 'Current Plan',
        description: 'You are already subscribed to this plan.',
      });
      return;
    }

    setCheckoutLoading(tier);
    try {
      await openCheckout(tier);
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Error',
        description: 'Failed to start checkout. Please try again.',
      });
    } finally {
      setCheckoutLoading(null);
    }
  };

  const isCurrentPlan = (tier: string): boolean => {
    return subscription.tier === tier && subscription.status === 'active';
  };

  const isTrialPlan = (tier: string): boolean => {
    return subscription.status === 'trial' && tier === 'starter';
  };

  const getButtonText = (tier: string): string => {
    if (isCurrentPlan(tier)) return 'Current Plan';
    if (subscription.status === 'trial') return 'Start Subscription';
    if (subscription.status === 'active') {
      const currentIndex = TIER_ORDER.indexOf(subscription.tier as typeof TIER_ORDER[number]);
      const targetIndex = TIER_ORDER.indexOf(tier as typeof TIER_ORDER[number]);
      return targetIndex > currentIndex ? 'Upgrade' : 'Downgrade';
    }
    return 'Subscribe';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h1 className="text-3xl font-bold">Choose Your Plan</h1>
        <p className="text-muted-foreground mt-2">
          Select the plan that best fits your growing operation. All plans include full access to Sage AI assistant and mobile app.
        </p>
        {subscription.status === 'trial' && (
          <Badge variant="warning" className="mt-3">
            You're currently on a free trial
          </Badge>
        )}
      </div>

      {/* Pricing Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        {TIER_ORDER.map((tierKey) => {
          const tier = TIER_INFO[tierKey];
          const isCurrent = isCurrentPlan(tierKey);
          const isTrial = isTrialPlan(tierKey);
          const isPopular = tierKey === 'growth';

          return (
            <Card
              key={tierKey}
              className={`relative flex flex-col ${
                isPopular ? 'border-primary shadow-lg' : ''
              } ${isCurrent ? 'ring-2 ring-primary' : ''}`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge variant="default" className="px-3">
                    Most Popular
                  </Badge>
                </div>
              )}

              <CardHeader className="text-center pb-2">
                <div className="mx-auto mb-2 p-3 rounded-full bg-muted w-fit">
                  {TIER_ICONS[tierKey]}
                </div>
                <CardTitle className="text-xl">{tier.displayName}</CardTitle>
                <CardDescription>{tier.description}</CardDescription>
              </CardHeader>

              <CardContent className="flex-1">
                {/* Price */}
                <div className="text-center mb-6">
                  <span className="text-4xl font-bold">${tier.price}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>

                {/* Tray Limit */}
                <div className="text-center mb-6 p-3 bg-muted rounded-lg">
                  <span className="text-2xl font-semibold">
                    {tier.trayLimit ? tier.trayLimit : 'Unlimited'}
                  </span>
                  <span className="text-muted-foreground block text-sm">
                    active trays
                  </span>
                </div>

                {/* Features */}
                <ul className="space-y-3">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                <Button
                  className="w-full"
                  variant={isCurrent ? 'secondary' : isPopular ? 'default' : 'outline'}
                  disabled={isCurrent || checkoutLoading !== null}
                  onClick={() => handleSelectPlan(tierKey)}
                >
                  {checkoutLoading === tierKey ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    getButtonText(tierKey)
                  )}
                </Button>
              </CardFooter>

              {isCurrent && (
                <div className="absolute top-3 right-3">
                  <Badge variant="secondary">Current</Badge>
                </div>
              )}
              {isTrial && (
                <div className="absolute top-3 right-3">
                  <Badge variant="outline">Trial Limits</Badge>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* FAQ / Additional Info */}
      <div className="mt-12 text-center text-sm text-muted-foreground">
        <p>All plans are billed monthly. Cancel anytime from your account settings.</p>
        <p className="mt-2">
          Need help choosing?{' '}
          <a href="mailto:support@sproutify.app" className="text-primary hover:underline">
            Contact us
          </a>
        </p>
      </div>
    </div>
  );
};

export default PricingPage;
