import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import './onboarding.css';

interface TrialBannerProps {
  trialEndDate?: string | null;
  onDismiss?: () => void;
}

const TrialBanner = ({ trialEndDate, onDismiss }: TrialBannerProps) => {
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!trialEndDate) {
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
  }, [trialEndDate]);

  const handleDismiss = () => {
    setIsVisible(false);
    setDismissed(true);
    if (onDismiss) {
      onDismiss();
    }
  };

  if (dismissed || !isVisible || daysRemaining === null) return null;

  const isExpiring = daysRemaining <= 3;
  const isExpired = daysRemaining <= 0;

  return (
    <div className="trial-banner" style={{ background: isExpired ? '#E57373' : isExpiring ? '#FFB74D' : undefined }}>
      <div className="trial-banner-content">
        {isExpired ? (
          <>
            <span>⚠️ Your trial has ended</span>
            <span style={{ marginLeft: '1rem', opacity: 0.9 }}>
              Upgrade to continue using Sproutify
            </span>
          </>
        ) : (
          <>
            <span>🎉 You're on a free trial</span>
            <span className="trial-countdown">
              {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining
            </span>
          </>
        )}
      </div>
      <button className="trial-banner-close" onClick={handleDismiss} aria-label="Dismiss">
        <X size={18} />
      </button>
    </div>
  );
};

export default TrialBanner;



