import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useOnboarding } from '../../hooks/useOnboarding';
import OnboardingStep from './OnboardingStep';
import EducationStep from './steps/EducationStep';
import VarietyStep from './steps/VarietyStep';
import RecipeStep from './steps/RecipeStep';
import BatchStep from './steps/BatchStep';
import TrayStep from './steps/TrayStep';
import DashboardTourStep from './steps/DashboardTourStep';
import CompletionStep from './steps/CompletionStep';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

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
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col p-0 [&>button]:hidden">
        <Card className="border-0 shadow-none flex flex-col h-full">
          <CardHeader className="border-b pb-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <DialogTitle className="text-2xl">Setup Wizard</DialogTitle>
                <DialogDescription className="mt-2">
                  Step {currentStepIndex + 1} of {TOTAL_STEPS}
                </DialogDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-4">
              <Progress value={progress} className="h-2" />
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto p-6">
            <OnboardingStep
              title={stepTitles[currentStepIndex]}
              description={stepDescriptions[currentStepIndex]}
              isExiting={isExiting}
            >
              {renderStep()}
            </OnboardingStep>
          </CardContent>

          <div className="border-t p-4 flex items-center justify-between gap-4">
            {currentStepIndex > 0 ? (
              <Button variant="outline" onClick={handleBack}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            ) : (
              <div />
            )}
            <div className="flex-1" />
            {currentStepIndex < TOTAL_STEPS - 1 ? (
              <Button onClick={handleNext}>
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleComplete}>
                Complete Setup
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </Card>
      </DialogContent>
    </Dialog>
  );
};

export default OnboardingWizard;
