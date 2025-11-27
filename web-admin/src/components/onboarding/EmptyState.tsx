import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding } from '../../hooks/useOnboarding';
import './onboarding.css';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  actionPath?: string;
  onAction?: () => void;
  showOnboardingLink?: boolean;
}

const EmptyState = ({
  icon,
  title,
  description,
  actionLabel,
  actionPath,
  onAction,
  showOnboardingLink = false,
}: EmptyStateProps) => {
  const navigate = useNavigate();
  const { state, startWizard } = useOnboarding();

  const handleAction = () => {
    if (onAction) {
      onAction();
    } else if (actionPath) {
      navigate(actionPath);
    }
  };

  const handleStartOnboarding = () => {
    startWizard();
  };

  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      <h3>{title}</h3>
      <p>{description}</p>
      {actionLabel && (
        <button className="btn-modern btn-primary-modern" onClick={handleAction}>
          {actionLabel}
        </button>
      )}
      {showOnboardingLink && !state.onboarding_completed && (
        <div style={{ marginTop: '1rem' }}>
          <button
            className="wizard-btn-skip"
            onClick={handleStartOnboarding}
            style={{ fontSize: '0.875rem' }}
          >
            Need help? Start the setup wizard →
          </button>
        </div>
      )}
    </div>
  );
};

export default EmptyState;


