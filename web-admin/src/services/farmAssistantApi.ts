import { getSupabaseClient } from '@/lib/supabaseClient';
export function farmAssistantUrl(route: 'status' | 'chat' | 'realtime') {
  return import.meta.env.PROD ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/farm-assistant/${route}` : `${import.meta.env.BASE_URL}__farm_ai/${route}`;
}
export async function farmAssistantHeaders(): Promise<Record<string, string>> {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error || !data.session?.access_token || !data.session.user?.id) throw new Error('Sign in to your farm before using AI.');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}`,
    ...(import.meta.env.PROD ? { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } : {}) };
}
