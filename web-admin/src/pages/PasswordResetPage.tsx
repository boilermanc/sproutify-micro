import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const PasswordResetPage = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setStatus('error');
      setMessage('Please enter an email address to receive reset instructions.');
      return;
    }

    setLoading(true);
    setStatus('idle');
    setMessage('');

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase is unavailable. Try again in a moment.');
      }

      const { error } = await supabase.auth.resetPasswordForEmail(trimmed);
      if (error) {
        throw error;
      }

      setStatus('success');
      setMessage('Check your inbox for password reset instructions.');
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message || 'Failed to send password reset email.');
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
        <div className="rounded-3xl border border-white/15 bg-white/95 p-8 shadow-2xl shadow-purple-500/20 backdrop-blur">
          <div className="space-y-2 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Sproutify Micro</p>
            <h1 className="text-3xl font-semibold text-slate-900">Reset Password</h1>
            <p className="text-sm text-slate-500">Enter the email linked with your account.</p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="space-y-2">
              <label htmlFor="reset-email" className="text-sm font-medium text-slate-600">
                Email
              </label>
              <Input
                id="reset-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="email@sproutify.app"
                required
              />
            </div>

            <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700" disabled={loading}>
              {loading ? 'Sending reset link...' : 'Send reset link'}
            </Button>
          </form>

          {message && (
            <p
              className={`text-sm mt-3 text-center ${
                status === 'success' ? 'text-emerald-600' : 'text-destructive'
              }`}
            >
              {message}
            </p>
          )}

          <div className="mt-6 text-center text-xs text-slate-500">
            <Link to="/admin-portal/login" className="font-semibold text-purple-500 hover:text-purple-400">
              ← Back to Beta Portal login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PasswordResetPage;



