import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';

const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Check if email is team@sproutify.app
      if (email.toLowerCase() !== 'team@sproutify.app') {
        setError('Access denied. Only team@sproutify.app can access the admin portal.');
        setLoading(false);
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

      // Check for admin role in app_metadata
      const userRole = user.app_metadata?.role;
      if (userRole !== 'admin') {
        // Set admin role if not already set (for initial setup)
        await getSupabaseClient().auth.updateUser({
          data: { role: 'admin' }
        });
      }

      // Store admin session
      localStorage.setItem('sproutify_admin_session', JSON.stringify({
        email: user.email,
        userId: user.id,
        role: 'admin'
      }));

      // Redirect to admin dashboard
      navigate('/admin-portal');
    } catch (error) {
      console.error('Admin login error:', error);
      setError(error instanceof Error ? error.message : 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-12">
      <div className="absolute inset-0">
        <div className="h-full w-full bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.35),transparent_55%)] blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950/95 to-slate-950" />
      </div>
      
      <div className="relative z-10 w-full max-w-md space-y-6">
        <div className="flex items-center justify-between text-white/70">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-white/10 font-semibold text-white">
              SA
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">Sproutify</p>
              <p className="text-lg font-semibold text-white">Admin Portal</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-white/70 hover:text-white hover:bg-white/10"
            onClick={() => navigate('/login')}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="rounded-3xl border border-white/15 bg-white/95 p-8 shadow-2xl shadow-purple-500/20 backdrop-blur">
          <div className="space-y-2 text-center">
            <span className="inline-flex items-center rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-600">
              Admin access
            </span>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Team Portal</h1>
            <p className="text-base text-slate-500">Sign in to access admin dashboard</p>
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

            <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-white/60">
          Only authorized team members can access this portal
        </p>
      </div>
    </div>
  );
};

export default AdminLogin;









