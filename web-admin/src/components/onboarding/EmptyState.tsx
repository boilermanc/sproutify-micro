import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding } from '../../hooks/useOnboarding';
import { Button } from '@/components/ui/button';

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
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-4">
      {icon && (
        <div className="flex items-center justify-center mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-xl font-semibold text-foreground">{title}</h3>
      <p className="text-muted-foreground max-w-md">{description}</p>
      {actionLabel && (
        <Button onClick={handleAction} className="mt-4">
          {actionLabel}
        </Button>
      )}
      {showOnboardingLink && !state.onboarding_completed && (
        <div className="mt-4">
          <Button
            variant="ghost"
            onClick={handleStartOnboarding}
            className="text-sm"
          >
            Need help? Start the setup wizard →
          </Button>
        </div>
      )}
    </div>
  );
};

export default EmptyState;
