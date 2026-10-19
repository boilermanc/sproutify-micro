import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { getSupabaseClient } from '../lib/supabaseClient';
import type { SproutifySession } from '../utils/session';
import { buildSessionPayload } from '../utils/session';
import { completeFarmSignup, verifyPlatformAdmin } from '../utils/accountAccess';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import FarmBrand from '@/components/FarmBrand';

const getRedirectPath = (role: string | null | undefined) => role?.toLowerCase() === 'farm hand' ? '/tasks' : '/';
interface LoginPageProps { onLogin: (session: SproutifySession) => void; }
const LoginPage = ({ onLogin }: LoginPageProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Email-only links prefill the form; they never choose an authenticated identity.
  useEffect(() => { setEmail(searchParams.get('email') || ''); }, [searchParams]);

  const resendVerification = async () => {
    if (!email.trim()) { setError('Enter your email first.'); return; }
    setLoading(true); setError(''); setNotice('');
    try {
      const { error } = await getSupabaseClient().auth.resend({ type: 'signup', email: email.trim().toLowerCase() });
      if (error) throw error;
      setNotice('If verification is available for this email, check your inbox.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to resend verification. Please try later.'); }
    finally { setLoading(false); }
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const client = getSupabaseClient();
      const { data, error: signInError } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) throw signInError;
      if (!data.user || !data.session) throw new Error('Authentication failed');
      if (await verifyPlatformAdmin()) { navigate('/admin-portal'); return; }
      const loadProfile = () => client.from('profile').select('*, farms(*)').eq('id', data.user!.id).maybeSingle();
      let result = await loadProfile();
      if (result.error) throw result.error;
      if (!result.data?.farm_uuid) {
        const { name, farm_name: farmName } = data.user.user_metadata || {};
        if (typeof name !== 'string' || typeof farmName !== 'string' || !name.trim() || !farmName.trim()) {
          throw new Error('Farm setup details are missing. Please contact your farm owner or support.');
        }
        await completeFarmSignup(name, farmName);
        result = await loadProfile();
      }
      const profile = result.data;
      if (result.error || !profile?.farm_uuid || profile.is_active !== true) {
        throw new Error('An active farm membership is required. Please contact your farm owner.');
      }
      const sessionPayload = await buildSessionPayload(profile, { email: data.user.email, userId: data.user.id });
      localStorage.setItem('sproutify_session', JSON.stringify(sessionPayload));
      window.dispatchEvent(new CustomEvent('sproutify:session-ready', { detail: { farmUuid: sessionPayload.farmUuid } }));
      onLogin(sessionPayload);
      navigate(getRedirectPath(sessionPayload.role));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.');
    } finally { setLoading(false); }
  };


  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="relative z-10 w-full max-w-md space-y-6">
        <div className="text-center"><FarmBrand /></div>

        <div className="rounded-lg border border-border bg-card p-7 sm:p-8">
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

          {notice && <p role="status" className="mt-4 text-sm text-emerald-700">{notice}</p>}
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
                placeholder="micro@micro.co"
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-slate-600">
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={passwordVisible ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="pr-12"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                  onClick={() => setPasswordVisible((prev) => !prev)}
                  aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                >
                  {passwordVisible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
            <button type="button" className="text-sm text-emerald-700" disabled={loading} onClick={resendVerification}>Resend verification email</button>
            <div className="text-right text-xs text-slate-500">
              <Link to="/admin-portal/reset-password" className="font-semibold text-emerald-600 hover:text-emerald-500">
                Forgot password?
              </Link>
            </div>
          </form>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          New to the beta?{' '}
          <Link
            to="/admin-portal/signup"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Set up your farm
          </Link>
        </p>
        <p className="text-center text-sm text-muted-foreground">
          Need help? Email{' '}
          <a
            href="mailto:team@sproutify.app"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            team@sproutify.app
          </a>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
