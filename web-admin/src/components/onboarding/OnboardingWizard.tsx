import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useOnboarding } from '../../hooks/useOnboarding';
import OnboardingStep from './OnboardingStep';
import EducationStep from './steps/EducationStep';
import VarietyStep from './steps/VarietyStep';
import RecipeStep from './steps/RecipeStep';
import BatchStep from './steps/BatchStep';
import TrayStep from './steps/TrayStep';
import DashboardTourStep from './steps/DashboardTourStep';
import CompletionStep from './steps/CompletionStep';
import './onboarding.css';

interface OnboardingWizardProps {
  onComplete: () => void;
  onClose: () => void;
}

const TOTAL_STEPS = 7;

const OnboardingWizard = ({ onComplete, onClose }: OnboardingWizardProps) => {
  const { state, setCurrentStep, completeStep } = useOnboarding();
  const [currentStepIndex, setCurrentStepIndex] = useState(state.current_step || 0);
  const [isExiting, setIsExiting] = useState(false);
  const [createdData, setCreatedData] = useState<{
    varietyId?: number;
    recipeId?: number;
    batchId?: number;
    trayId?: number;
  }>({});

  useEffect(() => {
    if (state.current_step !== currentStepIndex) {
      setCurrentStep(currentStepIndex);
    }
  }, [currentStepIndex, state.current_step, setCurrentStep]);

  useEffect(() => {
    if (typeof state.current_step === 'number' && state.current_step !== currentStepIndex) {
      setCurrentStepIndex(state.current_step);
    }
  }, [state.current_step, currentStepIndex]);

  const progress = ((currentStepIndex + 1) / TOTAL_STEPS) * 100;

  const handleNext = () => {
    if (currentStepIndex < TOTAL_STEPS - 1) {
      setIsExiting(true);
      setTimeout(() => {
        setCurrentStepIndex(currentStepIndex + 1);
        setIsExiting(false);
      }, 200);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setIsExiting(true);
      setTimeout(() => {
        setCurrentStepIndex(currentStepIndex - 1);
        setIsExiting(false);
      }, 200);
    }
  };

  const handleComplete = () => {
    completeStep('wizard_completed');
    onComplete();
  };

  const handleDataCreated = (type: string, id: number) => {
    setCreatedData((prev) => ({ ...prev, [type]: id }));
    completeStep(type);
  };

  const stepTitles = [
    'How Sproutify Works',
    'Add Your First Variety',
    'Create Your First Recipe',
    'Add a Seed Batch',
    'Create Your First Tray',
    'Understanding the Dashboard',
    "You're All Set!",
  ];

  const stepDescriptions = [
    'Let\'s understand how the system works',
    'Varieties are the types of microgreens you grow',
    'Recipes define how to grow each variety',
    'Track your seed purchases (optional)',
    'Trays are what you\'re actually growing',
    'Learn about your dashboard',
    'Start tracking your microgreens!',
  ];

  const renderStep = () => {
    switch (currentStepIndex) {
      case 0:
        return <EducationStep onNext={handleNext} />;
      case 1:
        return (
          <VarietyStep
            onNext={handleNext}
            onDataCreated={(id) => handleDataCreated('varietyId', id)}
          />
        );
      case 2:
        return (
          <RecipeStep
            onNext={handleNext}
            onBack={handleBack}
            varietyId={createdData.varietyId}
            onDataCreated={(id) => handleDataCreated('recipeId', id)}
          />
        );
      case 3:
        return (
          <BatchStep
            onNext={handleNext}
            onBack={handleBack}
            onSkip={handleNext}
            varietyId={createdData.varietyId}
            onDataCreated={(id) => handleDataCreated('batchId', id)}
          />
        );
      case 4:
        return (
          <TrayStep
            onNext={handleNext}
            onBack={handleBack}
            recipeId={createdData.recipeId}
            batchId={createdData.batchId}
            onDataCreated={(id) => handleDataCreated('trayId', id)}
          />
        );
      case 5:
        return <DashboardTourStep onNext={handleNext} onBack={handleBack} />;
      case 6:
        return <CompletionStep onComplete={handleComplete} onBack={handleBack} />;
      default:
        return null;
    }
  };

  return (
    <div className="onboarding-wizard-overlay" onClick={onClose}>
      <div className="onboarding-wizard" onClick={(e) => e.stopPropagation()}>
        <div className="wizard-header">
          <button className="wizard-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
          <div className="wizard-header-content">
            <h2>Setup Wizard</h2>
            <p style={{ opacity: 0.9, marginTop: '0.5rem' }}>
              Step {currentStepIndex + 1} of {TOTAL_STEPS}
            </p>
            <div className="wizard-progress-bar">
              <div
                className="wizard-progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="wizard-content">
          <OnboardingStep
            title={stepTitles[currentStepIndex]}
            description={stepDescriptions[currentStepIndex]}
            isExiting={isExiting}
          >
            {renderStep()}
          </OnboardingStep>
        </div>

        <div className="wizard-footer">
          {currentStepIndex > 0 && (
            <button className="wizard-nav-btn wizard-btn-back" onClick={handleBack}>
              ← Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          {currentStepIndex < TOTAL_STEPS - 1 ? (
            <button className="wizard-nav-btn wizard-btn-next" onClick={handleNext}>
              Next →
            </button>
          ) : (
            <button className="wizard-nav-btn wizard-btn-next" onClick={handleComplete}>
              Complete Setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;

