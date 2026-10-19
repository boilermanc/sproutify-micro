import { FarmWorkRejectedError, getFarmWorkCapabilities } from './farmWorkBackend';
import { getSupabaseClient } from '@/lib/supabaseClient';

export type LegacyFarmWork = 'seed' | 'soak' | 'care' | 'leftover';
const unavailable = (message: string) => Object.assign(new FarmWorkRejectedError(), {message});

// Detailed screens remain useful as records. Once the new write contract is
// installed, they must not fall back to its older inventory/completion writers.
export async function assertLegacyFarmWorkAvailable(kind: LegacyFarmWork): Promise<void> {
  let caps;
  try { caps = await getFarmWorkCapabilities(); }
  catch { throw unavailable('Available farm work could not be verified. Refresh before recording anything.'); }
  const replaced = kind === 'care' ? caps.care : kind === 'leftover' ? caps.seed || caps.soak : caps[kind];
  if (replaced) throw unavailable('Record this work in Today or Growing. This detailed screen uses an older save method that is no longer available.');
  // The composed rollout keeps this marker during an operational pause. Missing
  // write APIs must never reactivate the old writers after their retirement.
  let response;
  try { response = await getSupabaseClient().rpc('legacy_farm_work_retired'); }
  catch { throw unavailable('Available farm work could not be verified. Refresh before recording anything.'); }
  const { data, error } = response;
  if (error) {
    if (['PGRST202', '42883'].includes(error.code)) return;
    throw unavailable('Available farm work could not be verified. Refresh before recording anything.');
  }
  if (data === true) throw unavailable('Farm work recording is paused. Ask an owner to review it before recording more work; the older save methods remain unavailable.');
  if (data !== false) throw unavailable('Available farm work returned an unrecognized version. Refresh before recording anything.');
}
