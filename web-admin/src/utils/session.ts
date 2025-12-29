import { getSupabaseClient } from '../lib/supabaseClient';

type ProfileRecord = {
  id?: string;
  email?: string;
  farm_uuid?: string;
  role?: string;
  farms?: {
    farmname?: string | null;
    trial_end_date?: string | null;
  } | null;
  farmname?: string | null;
};

export interface SproutifySession {
  email: string | null;
  farmUuid: string;
  role: string | null;
  userId: string | null;
  farmName: string;
  trialEndDate: string | null;
}

const getFarmNameFromProfile = (profile: ProfileRecord) =>
  profile.farms?.farmname ??
  profile.farmname ??
  null;

/**
 * Normalizes profile data into the session structure that the dashboard expects.
 * Falls back to querying the farm directly when the relation isn't hydrated.
 */
export const buildSessionPayload = async (
  profile: ProfileRecord,
  overrides?: { email?: string | null; userId?: string | null }
): Promise<SproutifySession> => {
  const farmUuid = profile.farm_uuid ?? '';
  let farmName = getFarmNameFromProfile(profile);
  let trialEndDate = profile.farms?.trial_end_date ?? null;

  if ((!farmName || !farmName.trim()) && farmUuid && getSupabaseClient()) {
    const { data: farm } = await getSupabaseClient()
      .from('farms')
      .select('farmname, trial_end_date')
      .eq('farm_uuid', farmUuid)
      .single();

    if (farm) {
      farmName = farm.farmname ?? farmName;
      trialEndDate = trialEndDate ?? farm.trial_end_date ?? null;
    }
  }

  return {
    email: overrides?.email ?? profile.email ?? null,
    farmUuid,
    role: profile.role ?? null,
    userId: overrides?.userId ?? profile.id ?? null,
    farmName: farmName?.trim() || 'My Farm',
    trialEndDate,
  };
};




