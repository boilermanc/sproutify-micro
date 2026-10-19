import { getSupabaseClient } from '@/lib/supabaseClient';
import { farmAssistantHeaders, farmAssistantUrl } from './farmAssistantApi';
export async function negotiateFarmVoice(sdp: string, signal: AbortSignal): Promise<string> {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error || !data.session?.access_token || !data.session.user?.id) throw new Error('Sign in before starting voice.');
  const response = await fetch(farmAssistantUrl('realtime'), {
    method: 'POST', signal, headers: await farmAssistantHeaders(), body: JSON.stringify({ sdp, userId: data.session.user.id }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Realtime voice could not connect. You can still type.');
  if (result.writesEnabled !== false || typeof result.sdp !== 'string' || !result.sdp.startsWith('v=0') || !result.sdp.includes('m=audio')) throw new Error('Voice connection could not be verified.');
  return result.sdp;
}
