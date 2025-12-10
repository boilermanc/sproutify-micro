import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

interface RequireAdminProps {
  children: React.ReactNode;
}

const RequireAdmin = ({ children }: RequireAdminProps) => {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        // Check for admin session in localStorage
        const adminSession = localStorage.getItem('sproutify_admin_session');
        if (!adminSession) {
          setIsAuthorized(false);
          setIsLoading(false);
          return;
        }

        // Check Supabase session
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error || !session) {
          localStorage.removeItem('sproutify_admin_session');
          setIsAuthorized(false);
          setIsLoading(false);
          return;
        }

        // Verify email is team@sproutify.app
        if (session.user.email?.toLowerCase() !== 'team@sproutify.app') {
          await supabase.auth.signOut();
          localStorage.removeItem('sproutify_admin_session');
          setIsAuthorized(false);
          setIsLoading(false);
          return;
        }

        // Check for admin role
        const userRole = session.user.app_metadata?.role;
        if (userRole !== 'admin') {
          // Update role if needed
          await supabase.auth.updateUser({
            data: { role: 'admin' }
          });
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem('sproutify_admin_session');
        setIsAuthorized(false);
      } else if (event === 'SIGNED_IN' && session) {
        if (session.user.email?.toLowerCase() === 'team@sproutify.app') {
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

