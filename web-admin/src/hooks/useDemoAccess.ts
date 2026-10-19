import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient';

export function useDemoAccess(): boolean {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let live = true;
    let revision = 0;
    const client = getSupabaseClient();
    const check = async () => {
      const request = ++revision;
      setAllowed(false);
      try {
        const { data: { user }, error } = await client.auth.getUser();
        if (error || !user?.email) return;
        const result = await client.rpc('is_test_account', { check_email: user.email });
        if (live && request === revision) setAllowed(!result.error && result.data === true);
      } catch { /* A failed check never grants a subscription exemption. */ }
    };
    void check();
    const { data: { subscription } } = client.auth.onAuthStateChange(() => {
      revision++;
      setAllowed(false);
      setTimeout(() => { if (live) void check(); }, 0);
    });
    return () => { live = false; revision++; subscription.unsubscribe(); };
  }, []);
  return allowed;
}
