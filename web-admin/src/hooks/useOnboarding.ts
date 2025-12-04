import { useState, useCallback } from 'react';

export interface OnboardingState {
  onboarding_completed: boolean;
  onboarding_completed_at: string | null;
  onboarding_steps_completed: string[];
  sample_data_loaded: boolean;
  tooltips_dismissed: string[];
  setup_steps_dismissed: boolean;
  current_step: number;
  wizard_started: boolean;
}

const DEFAULT_STATE: OnboardingState = {
  onboarding_completed: false,
  onboarding_completed_at: null,
  onboarding_steps_completed: [],
  sample_data_loaded: false,
  tooltips_dismissed: [],
  setup_steps_dismissed: false,
  current_step: 0,
  wizard_started: false,
};

const STORAGE_KEY = 'sproutify_onboarding';

export const useOnboarding = () => {
  const [state, setState] = useState<OnboardingState>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_STATE, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('Error loading onboarding state:', error);
    }
    return DEFAULT_STATE;
  });

  const updateState = useCallback((updates: Partial<OnboardingState>) => {
    setState((prev) => {
      const newState = { ...prev, ...updates };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
      } catch (error) {
        console.error('Error saving onboarding state:', error);
      }
      return newState;
    });
  }, []);

  const completeStep = useCallback((stepName: string) => {
    setState((prev) => {
      const newSteps = prev.onboarding_steps_completed.includes(stepName)
        ? prev.onboarding_steps_completed
        : [...prev.onboarding_steps_completed, stepName];
      
      const newState = {
        ...prev,
        onboarding_steps_completed: newSteps,
      };
      
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
      } catch (error) {
        console.error('Error saving onboarding state:', error);
      }
      
      return newState;
    });
  }, []);

  const completeOnboarding = useCallback(() => {
    updateState({
      onboarding_completed: true,
      onboarding_completed_at: new Date().toISOString(),
    });
  }, [updateState]);

  const startWizard = useCallback(() => {
    updateState({
      wizard_started: true,
      current_step: 0,
    });
  }, [updateState]);

  const startWizardAtStep = useCallback(
    (step: number) => {
      updateState({
        wizard_started: true,
        current_step: step,
      });
    },
    [updateState]
  );

  const setCurrentStep = useCallback((step: number) => {
    updateState({ current_step: step });
  }, [updateState]);

  const dismissTooltip = useCallback((tooltipId: string) => {
    setState((prev) => {
      const newDismissed = prev.tooltips_dismissed.includes(tooltipId)
        ? prev.tooltips_dismissed
        : [...prev.tooltips_dismissed, tooltipId];
      
      const newState = {
        ...prev,
        tooltips_dismissed: newDismissed,
      };
      
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
      } catch (error) {
        console.error('Error saving onboarding state:', error);
      }
      
      return newState;
    });
  }, []);

  const setSampleDataLoaded = useCallback((loaded: boolean) => {
    updateState({ sample_data_loaded: loaded });
  }, [updateState]);

  const dismissSetupSteps = useCallback(() => {
    updateState({ setup_steps_dismissed: true });
  }, [updateState]);

  const resetOnboarding = useCallback(() => {
    const resetState = DEFAULT_STATE;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(resetState));
    } catch (error) {
      console.error('Error resetting onboarding state:', error);
    }
    setState(resetState);
  }, []);

  return {
    state,
    completeStep,
    completeOnboarding,
    startWizard,
    startWizardAtStep,
    setCurrentStep,
    dismissTooltip,
    setSampleDataLoaded,
    dismissSetupSteps,
    resetOnboarding,
    updateState,
  };
};

