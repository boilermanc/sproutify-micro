import { getSupabaseClient } from '@/lib/supabaseClient';

export class SeedReconciliationError extends Error {
  constructor() {
    super('Seeding could not be reconciled. Trays may already exist. Ask an owner to check the request and trays before trying again.');
    this.name = 'SeedReconciliationError';
  }
}

// The deployed invoker RPC cannot update requests as Farm Hand. Do not let its
// tray insert commit while its request update silently affects zero rows.
export async function completeSeedRequestSafely(requestId: number, quantity: number, batchId: number | null): Promise<number> {
  const client = getSupabaseClient();
  const {data: {user}, error: authError} = await client.auth.getUser();
  if (authError || !user) throw new Error('Sign in again before recording seeding.');
  const {data: profile, error: profileError} = await client.from('profile')
    .select('farm_uuid, role, is_active').eq('id', user.id).single();
  if (profileError || !profile?.farm_uuid || !profile.is_active || !['Owner','Editor'].includes(profile.role)) {
    throw new Error('Only an active owner or editor can record seeding. Ask an owner to complete the request.');
  }
  const readRequest = () => client.from('tray_creation_requests').select('quantity, quantity_completed, status')
    .eq('farm_uuid', profile.farm_uuid).eq('request_id', requestId).single();
  const {data: before, error: beforeError} = await readRequest();
  if (beforeError || !before) throw new Error('The seeding request could not be verified.');
  if (!['pending','approved','in_progress'].includes(before.status) || !Number.isInteger(quantity) || quantity <= 0 || quantity > before.quantity - before.quantity_completed) {
    throw new Error('The requested quantity is no longer available. Reload the seeding schedule.');
  }
  let result;
  try {
    result = await client.rpc('complete_seed_task', {p_request_id:requestId,p_quantity_completed:quantity,p_seedbatch_id:batchId,p_user_id:user.id});
  } catch { throw new SeedReconciliationError(); }
  if (result.error || result.data !== quantity) throw new SeedReconciliationError();
  try {
    const {data: after, error: afterError} = await readRequest();
    const expected = before.quantity_completed + quantity;
    if (afterError || !after || after.quantity_completed !== expected || after.status !== (expected === before.quantity ? 'completed' : 'in_progress')) throw new SeedReconciliationError();
  } catch { throw new SeedReconciliationError(); }
  return quantity;
}
