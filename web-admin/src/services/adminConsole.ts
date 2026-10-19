import { getSupabaseClient } from '../lib/supabaseClient';

export interface AdminPage<T> { rows: T[]; total: number; page: number; page_size: number }
// Invalidate outstanding responses when an admin screen or its page changes.
export function cancelAdminRead(request: { current: number }) { request.current += 1; }
export async function adminAction<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data: { session }, error } = await getSupabaseClient().auth.getSession();
  if (error || !session?.access_token) throw new Error('Sign in again to use the admin console.');
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-console`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify({ action, payload }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || result.error) throw new Error(result?.error || 'Admin request failed.');
  return result as T;
}
export async function readAdminPage<T>(resource: string, page = 1, farmUuid?: string | null): Promise<AdminPage<T>> {
  const result = await adminAction<AdminPage<T>>('read', { resource, page, page_size: 100, ...(farmUuid ? { farm_uuid: farmUuid } : {}) });
  if (!Array.isArray(result.rows) || !Number.isInteger(result.total) || result.total < 0 || result.page !== page || result.page_size !== 100) throw new Error('Admin response was incomplete. Refresh to try again.');
  return result;
}
