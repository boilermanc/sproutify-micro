import { ReactNode } from 'react';

interface OnboardingStepProps {
  children: ReactNode;
  title: string;
  description?: string;
  isExiting?: boolean;
}

const OnboardingStep = ({ children, title, description, isExiting }: OnboardingStepProps) => {
  return (
    <div className={`space-y-6 ${isExiting ? 'opacity-0 transition-opacity duration-200' : 'opacity-100 transition-opacity duration-200'}`}>
      <div>
        <h2 className="text-2xl font-bold tracking-tight mb-2">
          {title}
        </h2>
        {description && (
          <p className="text-muted-foreground text-base leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  );
};

export default OnboardingStep;
