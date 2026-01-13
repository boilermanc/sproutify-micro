import { getSupabaseClient } from '../lib/supabaseClient';
import { buildSessionPayload } from './session';
import type { SproutifySession } from './session';

/**
 * Refreshes the session payload from the database without requiring re-login.
 * Call this periodically or on tab focus to keep session data current.
 * 
 * This function:
 * - Verifies the user is still authenticated
 * - Fetches the latest profile and farm data
 * - Rebuilds and stores the session payload
 * - Returns the refreshed session or null if refresh fails
 * 
 * @returns The refreshed session payload or null if refresh fails
 */
export async function refreshSessionPayload(): Promise<SproutifySession | null> {
  try {
    const client = getSupabaseClient();
    
    if (!client) {
      console.warn('[SessionRefresh] No Supabase client available');
      return null;
    }

    // Check if user is still authenticated
    const { data: { session }, error: sessionError } = await client.auth.getSession();
    
    if (sessionError || !session) {
      console.warn('[SessionRefresh] No active session, skipping refresh');
      return null;
    }

    // Fetch latest profile and farm data (including is_admin)
    const { data: profile, error: profileError } = await client
      .from('profile')
      .select('*, farms(*)')
      .eq('id', session.user.id)
      .single();

    if (profileError || !profile) {
      console.error('[SessionRefresh] Failed to fetch profile:', profileError);
      return null;
    }

    // Build refreshed session payload
    const sessionPayload = await buildSessionPayload(profile, {
      email: session.user.email,
      userId: session.user.id,
    });

    // Update localStorage with refreshed data
    localStorage.setItem('sproutify_session', JSON.stringify(sessionPayload));
    
    console.log('[SessionRefresh] Session refreshed successfully', {
      farmUuid: sessionPayload.farmUuid,
      farmName: sessionPayload.farmName,
      role: sessionPayload.role,
    });

    return sessionPayload;
  } catch (error) {
    console.error('[SessionRefresh] Session refresh failed:', error);
    return null;
  }
}

/**
 * Gets the current session from localStorage
 */
export function getCurrentSession(): SproutifySession | null {
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) return null;
    return JSON.parse(sessionData) as SproutifySession;
  } catch (error) {
    console.error('[SessionRefresh] Failed to parse session:', error);
    return null;
  }
}
