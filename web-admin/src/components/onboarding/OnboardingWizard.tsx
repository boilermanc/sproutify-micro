import { useState } from 'react';
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
import { Card, CardContent, CardHeader } from '@/components/ui/card';

interface OnboardingWizardProps {
  onComplete: () => void;
  onClose: () => void;
}

const TOTAL_STEPS = 7;

const OnboardingWizard = ({ onComplete, onClose }: OnboardingWizardProps) => {
  const { state, completeStep } = useOnboarding();
  // Use local state only - no bidirectional sync to avoid race conditions
  const [currentStepIndex, setCurrentStepIndex] = useState(state.current_step || 0);
  const [createdData, setCreatedData] = useState<{
    varietyId?: number;
    recipeId?: number;
    batchId?: number;
    trayId?: number;
  }>({});

  const progress = ((currentStepIndex + 1) / TOTAL_STEPS) * 100;

  const handleNext = () => {
    if (currentStepIndex < TOTAL_STEPS - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
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
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-hidden flex flex-col p-0 [&>button]:hidden">
        <Card className="border-0 shadow-none flex flex-col h-full min-h-0 overflow-hidden">
          <CardHeader className="border-b pb-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <DialogTitle className="text-2xl">Setup Wizard</DialogTitle>
                <DialogDescription className="mt-2">
                  Step {currentStepIndex + 1} of {TOTAL_STEPS}
                </DialogDescription>
              </div>
              <Button
                type="button"
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

          <CardContent className="flex-1 p-6">
            <OnboardingStep
              title={stepTitles[currentStepIndex]}
              description={stepDescriptions[currentStepIndex]}
            >
              {renderStep()}
            </OnboardingStep>
          </CardContent>

          <div className="border-t p-4 flex items-center justify-between gap-4 flex-shrink-0">
            {currentStepIndex > 0 ? (
              <Button type="button" variant="outline" onClick={handleBack}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            ) : (
              <div />
            )}
            <div className="flex-1" />
            {currentStepIndex < TOTAL_STEPS - 1 ? (
              <Button type="button" onClick={handleNext}>
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" onClick={handleComplete}>
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
