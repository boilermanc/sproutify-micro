import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabaseClient';
import { buildSessionPayload } from '../utils/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string' && error.length > 0) {
    return error;
  }

  return fallback;
};

interface LoginPageProps {
  onLogin: () => void;
}

const LoginPage = ({ onLogin }: LoginPageProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const accessTokenParam = searchParams.get('access_token');
  const refreshTokenParam = searchParams.get('refresh_token');
  const [isAutoLoggingIn, setIsAutoLoggingIn] = useState(() =>
    Boolean(accessTokenParam && refreshTokenParam)
  );
  const navigate = useNavigate();

  const handleTokenLoginRef = useRef<((accessToken: string, refreshToken: string) => Promise<void>) | null>(null);
  const handleAutoLoginRef = useRef<((emailParam: string) => Promise<void>) | null>(null);

  const handleTokenLogin = useCallback(async (accessToken: string, refreshToken: string) => {
    try {
      const { data, error } = await getSupabaseClient().auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        throw error;
      }

      const sessionUser = data.session?.user;

      if (!sessionUser) {
        throw new Error('Invalid session tokens received.');
      }

      const { data: profile, error: profileError } = await getSupabaseClient()
        .from('profile')
        .select('*, farms(*)')
        .eq('id', sessionUser.id)
        .single();

      if (profileError || !profile) {
        throw new Error('Profile not found. Please contact support.');
      }

      const sessionPayload = await buildSessionPayload(profile, {
        email: sessionUser.email,
        userId: sessionUser.id,
      });

      localStorage.setItem('sproutify_session', JSON.stringify(sessionPayload));

      // Dispatch custom event to notify Dashboard that session is ready
      window.dispatchEvent(new CustomEvent('sproutify:session-ready', { 
        detail: { farmUuid: sessionPayload.farmUuid } 
      }));

      onLogin();
      navigate('/', { replace: true });
    } catch (error) {
      console.error('Token login error:', error);
      setError(
        getErrorMessage(
          error,
          'Unable to complete signup automatically. Please log in manually.',
        ),
      );
    } finally {
      setIsAutoLoggingIn(false);
    }
  }, [navigate, onLogin]);

  const handleAutoLogin = useCallback(async (emailParam: string) => {
    try {
      // Try to find user by email and sign in
      const { data: { user }, error: signInError } = await getSupabaseClient().auth.signInWithPassword({
        email: emailParam,
        password: '', // This won't work - need proper auth flow
      });

      if (signInError) {
        // If sign in fails, try to get user profile
        const { data: profile } = await getSupabaseClient()
          .from('profile')
          .select('*, farms(*)')
          .eq('email', emailParam)
          .single();

        if (profile) {
          const { data: { session } } = await getSupabaseClient().auth.getSession();
          if (session) {
            const sessionPayload = await buildSessionPayload(profile, {
              email: emailParam,
              userId: profile.id,
            });
            localStorage.setItem('sproutify_session', JSON.stringify(sessionPayload));
            
            // Dispatch custom event to notify Dashboard that session is ready
            window.dispatchEvent(new CustomEvent('sproutify:session-ready', { 
              detail: { farmUuid: sessionPayload.farmUuid } 
            }));
            
            onLogin();
            navigate('/');
            return;
          }
        }
      }

      if (user) {
        const { data: profile } = await getSupabaseClient()
          .from('profile')
          .select('*, farms(*)')
          .eq('id', user.id)
          .single();

        if (profile) {
          const sessionPayload = await buildSessionPayload(profile, {
            email: user.email,
            userId: user.id,
          });
          localStorage.setItem('sproutify_session', JSON.stringify(sessionPayload));
          
          // Dispatch custom event to notify Dashboard that session is ready
          window.dispatchEvent(new CustomEvent('sproutify:session-ready', { 
            detail: { farmUuid: sessionPayload.farmUuid } 
          }));
          
          onLogin();
          navigate('/');
          return;
        }
      }

      throw new Error('Auto-login failed');
    } catch (error) {
      console.error('Auto-login error:', error);
      setError('Auto-login failed. Please try manually.');
      setIsAutoLoggingIn(false);
    }
  }, [navigate, onLogin]);

  // Update refs when callbacks change
  handleTokenLoginRef.current = handleTokenLogin;
  handleAutoLoginRef.current = handleAutoLogin;

  useEffect(() => {
    const session = localStorage.getItem('sproutify_session');
    if (session) {
      onLogin();
      navigate('/');
      return;
    }

    const emailParam = searchParams.get('email');

    if (accessTokenParam && refreshTokenParam && handleTokenLoginRef.current) {
      handleTokenLoginRef.current(accessTokenParam, refreshTokenParam);
      return;
    }

    if (emailParam && handleAutoLoginRef.current) {
      setIsAutoLoggingIn(true);
      setTimeout(() => handleAutoLoginRef.current!(emailParam), 100);
      return;
    }

    setIsAutoLoggingIn(false);
  }, [
    accessTokenParam,
    refreshTokenParam,
    navigate,
    onLogin,
    searchParams,
  ]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Check if email is team@sproutify.app - redirect to admin portal
      if (email.toLowerCase() === 'team@sproutify.app') {
        navigate('/admin-portal/login');
        return;
      }

      // Authenticate with getSupabaseClient()
      const { data: { user, session }, error: signInError } = await getSupabaseClient().auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        throw signInError;
      }

      if (!user || !session) {
        throw new Error('Authentication failed');
      }

      // Fetch user profile with farm information
      const { data: profile, error: profileError } = await getSupabaseClient()
        .from('profile')
        .select('*, farms(*)')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        throw new Error('Profile not found. Please contact your administrator.');
      }

      const sessionPayload = await buildSessionPayload(profile, {
        email: user.email,
        userId: user.id,
      });

      // Store session
      localStorage.setItem('sproutify_session', JSON.stringify(sessionPayload));

      // Dispatch custom event to notify Dashboard that session is ready
      window.dispatchEvent(new CustomEvent('sproutify:session-ready', { 
        detail: { farmUuid: sessionPayload.farmUuid } 
      }));

      onLogin();
      navigate('/');
    } catch (error) {
      console.error('Manual login error:', error);
      setError(getErrorMessage(error, 'Invalid credentials. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (isAutoLoggingIn) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-12">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/40 via-emerald-400/10 to-transparent blur-3xl" />
        <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-white/10 p-10 text-center text-white shadow-2xl shadow-emerald-500/30 backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/30 bg-white/10">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
          </div>
          <h2 className="mt-6 text-2xl font-semibold tracking-tight">Logging you in...</h2>
          <p className="mt-2 text-sm text-white/70">Securing your workspace</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-12">
      <div className="absolute inset-0">
        <div className="h-full w-full bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.35),transparent_55%)] blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950/95 to-slate-950" />
      </div>
      <div className="relative z-10 w-full max-w-md space-y-6">
        <div className="flex items-center gap-3 text-white/70">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-white/10 font-semibold text-white">
            SM
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Sproutify Micro</p>
            <p className="text-lg font-semibold text-white">Beta Access</p>
          </div>
        </div>

        <div className="rounded-3xl border border-white/15 bg-white/95 p-8 shadow-2xl shadow-emerald-500/20 backdrop-blur">
          <div className="space-y-2 text-center">
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
              Beta Program
            </span>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
            <p className="text-base text-slate-500">Sign in to your beta farm account.</p>
          </div>

          {error && (
            <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-8 space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-slate-600">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="team@sproutify.app"
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-slate-600">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-white/60">
          New to the beta?{' '}
          <Link
            to="/admin-portal/signup"
            className="font-semibold text-emerald-200 underline-offset-4 hover:text-white hover:underline"
          >
            Set up your farm
          </Link>
        </p>
        <p className="text-center text-sm text-white/60">
          Need help? Email{' '}
          <a
            href="mailto:team@sproutify.app"
            className="font-semibold text-emerald-200 underline-offset-4 hover:text-white hover:underline"
          >
            team@sproutify.app
          </a>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
