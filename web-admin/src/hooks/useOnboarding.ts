import { useState, useCallback, useEffect, useRef } from 'react';
import { getSupabaseClient } from '@/integrations/supabase/client';

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

type SyncedOnboardingState = Pick<
  OnboardingState,
  | 'wizard_started'
  | 'current_step'
  | 'onboarding_completed'
  | 'onboarding_completed_at'
  | 'onboarding_steps_completed'
>;

const getSyncedPayload = (source: OnboardingState): SyncedOnboardingState => ({
  wizard_started: source.wizard_started,
  current_step: source.current_step,
  onboarding_completed: source.onboarding_completed,
  onboarding_completed_at: source.onboarding_completed_at,
  onboarding_steps_completed: source.onboarding_steps_completed,
});

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
  const [isLoading, setIsLoading] = useState(true);
  const farmUuidRef = useRef<string | null>(null);

  const syncOnboardingToDb = useCallback(
    async (payload: SyncedOnboardingState, targetFarmUuid?: string | null) => {
      const uuid = targetFarmUuid ?? farmUuidRef.current;
      if (!uuid) return;

      try {
        await getSupabaseClient()
          .from('farms')
          .update({ onboarding_status: payload })
          .eq('farm_uuid', uuid);
      } catch (error) {
        console.error('Error syncing onboarding status to Supabase:', error);
      }
    },
    []
  );

  const persistState = useCallback(
    (nextState: OnboardingState) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
      } catch (error) {
        console.error('Error saving onboarding state:', error);
      }

      void syncOnboardingToDb(getSyncedPayload(nextState));
      return nextState;
    },
    [syncOnboardingToDb]
  );

  useEffect(() => {
    let isCancelled = false;

    const hydrateFromDatabase = async () => {
      setIsLoading(true);
      try {
        const client = getSupabaseClient();
        const { data: { session } } = await client.auth.getSession();
        let userId = session?.user?.id ?? null;

        if (!userId) {
          const storedSession = localStorage.getItem('sproutify_session');
          if (storedSession) {
            try {
              const parsed = JSON.parse(storedSession);
              userId = parsed?.userId ?? userId;
            } catch (error) {
              console.error('Error parsing stored session:', error);
            }
          }
        }

        if (!userId) return;

        const { data: profile } = await client
          .from('profile')
          .select('farm_uuid')
          .eq('id', userId)
          .maybeSingle();

        const farmUuid = profile?.farm_uuid ?? null;
        if (!farmUuid) return;

        farmUuidRef.current = farmUuid;

        const { data: farmStatus } = await client
          .from('farms')
          .select('onboarding_status')
          .eq('farm_uuid', farmUuid)
          .maybeSingle();

        if (isCancelled) return;

        const remoteStatus = farmStatus?.onboarding_status as Partial<OnboardingState> | null;
        if (remoteStatus && typeof remoteStatus === 'object') {
          setState((prev) => {
            if (isCancelled) return prev;
            const merged: OnboardingState = {
              ...prev,
              ...remoteStatus,
              onboarding_steps_completed: remoteStatus.onboarding_steps_completed ?? prev.onboarding_steps_completed,
              tooltips_dismissed: prev.tooltips_dismissed,
              sample_data_loaded: prev.sample_data_loaded,
              setup_steps_dismissed: prev.setup_steps_dismissed,
            };
            return persistState(merged);
          });
        } else {
          setState((prev) => {
            if (isCancelled) return prev;
            return persistState(prev);
          });
        }
      } catch (error) {
        console.error('Error loading onboarding state from Supabase:', error);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    hydrateFromDatabase();

    return () => {
      isCancelled = true;
    };
  }, [persistState]);

  const updateState = useCallback(
    (updates: Partial<OnboardingState>) => {
      setState((prev) => {
        const newState = { ...prev, ...updates };
        return persistState(newState);
      });
    },
    [persistState]
  );

  const completeStep = useCallback(
    (stepName: string) => {
      setState((prev) => {
        const newSteps = prev.onboarding_steps_completed.includes(stepName)
          ? prev.onboarding_steps_completed
          : [...prev.onboarding_steps_completed, stepName];

        return persistState({ ...prev, onboarding_steps_completed: newSteps });
      });
    },
    [persistState]
  );

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

  const dismissTooltip = useCallback(
    (tooltipId: string) => {
      setState((prev) => {
        const newDismissed = prev.tooltips_dismissed.includes(tooltipId)
          ? prev.tooltips_dismissed
          : [...prev.tooltips_dismissed, tooltipId];

        return persistState({ ...prev, tooltips_dismissed: newDismissed });
      });
    },
    [persistState]
  );

  const setSampleDataLoaded = useCallback((loaded: boolean) => {
    updateState({ sample_data_loaded: loaded });
  }, [updateState]);

  const dismissSetupSteps = useCallback(() => {
    updateState({ setup_steps_dismissed: true });
  }, [updateState]);

  const resetOnboarding = useCallback(() => {
    setState(() => persistState(DEFAULT_STATE));
  }, [persistState]);

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
    isLoading,
  };
};

