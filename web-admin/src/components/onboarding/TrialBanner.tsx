import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ArrowRight } from 'lucide-react';
import './onboarding.css';

interface TrialBannerProps {
  trialEndDate?: string | null;
  subscriptionStatus?: string | null;
  activeTrayCount?: number;
  trayLimit?: number;
  onDismiss?: () => void;
}

const TrialBanner = ({
  trialEndDate,
  subscriptionStatus,
  activeTrayCount = 0,
  trayLimit = 50,
  onDismiss,
}: TrialBannerProps) => {
  const navigate = useNavigate();
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  // Calculate days remaining for trial
  useEffect(() => {
    if (!trialEndDate || subscriptionStatus !== 'trial') {
      setDaysRemaining(null);
      return;
    }

    const updateDaysRemaining = () => {
      const endDate = new Date(trialEndDate);
      const now = new Date();
      const diff = endDate.getTime() - now.getTime();
      const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
      setDaysRemaining(days);
    };

    updateDaysRemaining();
    const interval = setInterval(updateDaysRemaining, 1000 * 60 * 60); // Update every hour

    return () => clearInterval(interval);
  }, [trialEndDate, subscriptionStatus]);

  const handleDismiss = () => {
    setIsVisible(false);
    setDismissed(true);
    if (onDismiss) {
      onDismiss();
    }
  };

  const handleUpgrade = () => {
    navigate('/pricing');
  };

  // Calculate usage percentage
  const usagePercentage = trayLimit > 0 && trayLimit < 999999
    ? Math.round((activeTrayCount / trayLimit) * 100)
    : 0;
  const isApproachingLimit = usagePercentage >= 80;
  const isAtLimit = trayLimit < 999999 && activeTrayCount >= trayLimit;

  // Determine if banner should show based on status
  const isTrial = subscriptionStatus === 'trial';
  const isExpired = subscriptionStatus === 'expired';
  const isCancelled = subscriptionStatus === 'cancelled';
  const isPastDue = subscriptionStatus === 'past_due';

  // For backward compatibility - if no subscriptionStatus, use legacy behavior
  const isLegacyMode = subscriptionStatus === undefined;

  // Hide banner if dismissed or not visible
  if (dismissed || !isVisible) return null;

  // Legacy mode: show only if trialEndDate is set
  if (isLegacyMode) {
    if (!trialEndDate) return null;

    const endDate = new Date(trialEndDate);
    const now = new Date();
    const diff = endDate.getTime() - now.getTime();
    const legacyDays = Math.ceil(diff / (1000 * 60 * 60 * 24));

    const legacyExpiring = legacyDays <= 3;
    const legacyExpired = legacyDays <= 0;

    return (
      <div className="trial-banner" style={{ background: legacyExpired ? '#E57373' : legacyExpiring ? '#FFB74D' : undefined }}>
        <div className="trial-banner-content">
          {legacyExpired ? (
            <>
              <span>Your trial has ended</span>
              <span style={{ marginLeft: '1rem', opacity: 0.9 }}>
                Upgrade to continue using Sproutify
              </span>
            </>
          ) : (
            <>
              <span>You're on a Starter trial</span>
              <span className="trial-countdown">
                {legacyDays} {legacyDays === 1 ? 'day' : 'days'} remaining
              </span>
            </>
          )}
        </div>
        <div className="trial-banner-actions">
          <button className="trial-banner-upgrade" onClick={handleUpgrade}>
            Upgrade
            <ArrowRight size={16} style={{ marginLeft: '0.5rem' }} />
          </button>
          {!legacyExpired && (
            <button className="trial-banner-close" onClick={handleDismiss} aria-label="Dismiss">
              <X size={18} />
            </button>
          )}
        </div>
      </div>
    );
  }

  // New behavior with subscriptionStatus
  // Show banner for: trial, expired, cancelled, past_due, or approaching limit
  const shouldShow = isTrial || isExpired || isCancelled || isPastDue || isApproachingLimit;
  if (!shouldShow) return null;

  // Determine banner style based on urgency
  const isExpiring = isTrial && daysRemaining !== null && daysRemaining <= 3;
  const isTrialExpired = isTrial && daysRemaining !== null && daysRemaining <= 0;

  let backgroundColor: string | undefined;
  if (isExpired || isCancelled || isTrialExpired) {
    backgroundColor = '#E57373'; // Red
  } else if (isPastDue || isExpiring || isAtLimit) {
    backgroundColor = '#FFB74D'; // Orange/Yellow
  } else if (isApproachingLimit) {
    backgroundColor = '#FFB74D'; // Orange/Yellow
  }

  // Determine banner content
  const renderContent = () => {
    if (isExpired || isCancelled) {
      return (
        <>
          <span>Your subscription has ended</span>
          <span style={{ marginLeft: '1rem', opacity: 0.9 }}>
            Subscribe to continue using Sproutify
          </span>
        </>
      );
    }

    if (isPastDue) {
      return (
        <>
          <span>Payment failed</span>
          <span style={{ marginLeft: '1rem', opacity: 0.9 }}>
            Please update your payment method
          </span>
        </>
      );
    }

    if (isTrial) {
      if (isTrialExpired) {
        return (
          <>
            <span>Your trial has ended</span>
            <span style={{ marginLeft: '1rem', opacity: 0.9 }}>
              Upgrade to continue using Sproutify
            </span>
          </>
        );
      }
      return (
        <>
          <span>You're on a Starter trial</span>
          {daysRemaining !== null && (
            <span className="trial-countdown">
              {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining
            </span>
          )}
          {trayLimit > 0 && trayLimit < 999999 && (
            <span className="trial-usage">
              {activeTrayCount} / {trayLimit} trays
            </span>
          )}
        </>
      );
    }

    if (isApproachingLimit || isAtLimit) {
      return (
        <>
          <span>{isAtLimit ? 'Tray limit reached' : 'Approaching tray limit'}</span>
          <span className="trial-usage">
            {activeTrayCount} / {trayLimit} trays ({usagePercentage}%)
          </span>
        </>
      );
    }

    return null;
  };

  // Don't allow dismissing if expired/cancelled/at limit
  const canDismiss = isTrial && !isTrialExpired && !isAtLimit;

  return (
    <div
      className="trial-banner"
      style={{ background: backgroundColor }}
    >
      <div className="trial-banner-content">
        {renderContent()}
      </div>
      <div className="trial-banner-actions">
        <button
          className="trial-banner-upgrade"
          onClick={handleUpgrade}
        >
          {isExpired || isCancelled ? 'Subscribe' : isApproachingLimit && !isTrial ? 'Upgrade Plan' : 'Upgrade'}
          <ArrowRight size={16} style={{ marginLeft: '0.5rem' }} />
        </button>
        {canDismiss && (
          <button
            className="trial-banner-close"
            onClick={handleDismiss}
            aria-label="Dismiss"
          >
            <X size={18} />
          </button>
        )}
      </div>
    </div>
  );
};

export default TrialBanner;
