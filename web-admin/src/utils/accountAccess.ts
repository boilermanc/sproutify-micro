import { getSupabaseClient } from '../lib/supabaseClient';

/** Server registry is authority; browser storage is never an authorization source. */
export async function verifyPlatformAdmin(): Promise<boolean> {
  const client = getSupabaseClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return false;
  const result = await client.rpc('is_admin_user');
  return !result.error && result.data === true;
}

export async function completeFarmSignup(name: string, farmName: string): Promise<void> {
  const { data, error } = await getSupabaseClient().functions.invoke('signup', { body: { name, farmName } });
  if (error || data?.success !== true || !data?.user?.id || !data?.user?.farmUuid) {
    throw new Error(data?.error || error?.message || 'Farm setup was not confirmed. Please try signing in again.');
  }
}

export function hasActiveFarmMembership(profile: { farm_uuid?: unknown; is_active?: unknown } | null | undefined): boolean {
  return profile?.is_active === true && typeof profile.farm_uuid === 'string' && profile.farm_uuid.trim().length > 0;
}
