import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabaseClient';

interface RequireAdminProps {
  children: React.ReactNode;
}

const ALLOWED_ROLES = new Set(['admin', 'owner']);

const parseAdminSession = () => {
  const storedSession = localStorage.getItem('sproutify_admin_session');
  if (!storedSession) return null;

  try {
    return JSON.parse(storedSession) as {
      email?: string;
      userId?: string;
      role?: string;
      farmUuid?: string;
    };
  } catch (error) {
    console.error('Failed to parse admin session:', error);
    return null;
  }
};

const RequireAdmin = ({ children }: RequireAdminProps) => {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAdminAccess = async () => {
      if (!getSupabaseClient()) {
        setIsAuthorized(false);
        setIsLoading(false);
        return;
      }
      try {
        const adminSession = parseAdminSession();
        if (!adminSession) {
          setIsAuthorized(false);
          setIsLoading(false);
          return;
        }

        const normalizedRole = (adminSession.role ?? '').toLowerCase();
        if (!ALLOWED_ROLES.has(normalizedRole)) {
          setIsAuthorized(false);
          setIsLoading(false);
          return;
        }

        const { data: { session }, error } = await getSupabaseClient().auth.getSession();

        if (error || !session || session.user.id !== adminSession.userId) {
          await getSupabaseClient().auth.signOut();
          localStorage.removeItem('sproutify_admin_session');
          setIsAuthorized(false);
          setIsLoading(false);
          return;
        }

        setIsAuthorized(true);
      } catch (error) {
        console.error('Admin check error:', error);
        setIsAuthorized(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAdminAccess();

    // Listen for auth state changes
    if (!getSupabaseClient()) return;
    const { data: { subscription } } = getSupabaseClient().auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem('sproutify_admin_session');
        setIsAuthorized(false);
      } else if (event === 'SIGNED_IN' && session) {
        const adminSession = parseAdminSession();
        if (!adminSession) {
          setIsAuthorized(false);
          return;
        }

        const normalizedRole = (adminSession.role ?? '').toLowerCase();
        const allowedRole = ALLOWED_ROLES.has(normalizedRole);

        if (allowedRole && session.user.id === adminSession.userId) {
          setIsAuthorized(true);
        } else {
          setIsAuthorized(false);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
          <p className="mt-4 text-sm text-slate-600">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return <Navigate to="/admin-portal/login" replace />;
  }

  return <>{children}</>;
};

export default RequireAdmin;










