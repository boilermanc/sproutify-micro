import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabaseClient';
import { verifyPlatformAdmin } from '../utils/accountAccess';

const RequireAdmin = ({ children }: { children: React.ReactNode }) => {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    let revision = 0;
    const check = async () => {
      const request = ++revision;
      if (live) setAuthorized(null);
      const timer = setTimeout(() => {
        if (live && request === revision) { revision++; setAuthorized(false); }
      }, 5000);
      try {
        const allowed = await verifyPlatformAdmin();
        if (live && request === revision) setAuthorized(allowed);
      } catch {
        if (live && request === revision) setAuthorized(false);
      } finally { clearTimeout(timer); }
    };
    void check();
    const { data: { subscription } } = getSupabaseClient().auth.onAuthStateChange(() => {
      revision++;
      setAuthorized(null);
      // Do not await Supabase calls inside its auth lock callback.
      setTimeout(() => { if (live) void check(); }, 0);
    });
    return () => { live = false; revision++; subscription.unsubscribe(); };
  }, []);
  if (authorized === null) return <p role="status">Verifying access...</p>;
  if (!authorized) return <Navigate to="/admin-portal/login" replace />;
  return <>{children}</>;
};
export default RequireAdmin;
