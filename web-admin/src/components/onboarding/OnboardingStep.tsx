import { ReactNode } from 'react';
import './onboarding.css';

interface OnboardingStepProps {
  children: ReactNode;
  title: string;
  description?: string;
  isExiting?: boolean;
}

const OnboardingStep = ({ children, title, description, isExiting }: OnboardingStepProps) => {
  return (
    <div className={`wizard-step ${isExiting ? 'exiting' : ''}`}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#2A3744', marginBottom: '0.5rem' }}>
          {title}
        </h2>
        {description && (
          <p style={{ color: '#5A6673', fontSize: '1rem', lineHeight: 1.6 }}>
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  );
};

export default OnboardingStep;


