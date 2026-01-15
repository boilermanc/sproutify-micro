import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff } from 'lucide-react';

const VerifyResetCode = () => {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus('idle');
    setMessage('');

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedCode = code.trim();

    if (!trimmedEmail) {
      setStatus('error');
      setMessage('Please enter your email address.');
      return;
    }

    if (!trimmedCode || trimmedCode.length !== 6) {
      setStatus('error');
      setMessage('Please enter the 6-digit code from your email.');
      return;
    }

    if (newPassword.length < 8) {
      setStatus('error');
      setMessage('Password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatus('error');
      setMessage('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase is unavailable. Try again in a moment.');
      }

      // Verify the OTP code
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: trimmedEmail,
        token: trimmedCode,
        type: 'recovery',
      });

      if (verifyError) {
        throw verifyError;
      }

      // Update the password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        throw updateError;
      }

      // Sign out to clear the recovery session
      await supabase.auth.signOut();

      setStatus('success');
      setMessage('Password updated successfully! Redirecting to login...');

      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err: unknown) {
      setStatus('error');
      const errorMessage = err instanceof Error ? err.message : 'Failed to reset password. Please try again.';
      setMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-12">
      <div className="absolute inset-0">
        <div className="h-full w-full bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.35),transparent_55%)] blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950/95 to-slate-950" />
      </div>

      <div className="relative z-10 w-full max-w-md space-y-6">
        <div className="rounded-3xl border border-white/15 bg-white/95 p-8 shadow-2xl shadow-emerald-500/20 backdrop-blur">
          <div className="space-y-2 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Sproutify Micro</p>
            <h1 className="text-3xl font-semibold text-slate-900">Set New Password</h1>
            <p className="text-sm text-slate-500">Enter the code from your email and choose a new password.</p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="space-y-2">
              <label htmlFor="verify-email" className="text-sm font-medium text-slate-600">
                Email
              </label>
              <Input
                id="verify-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@sproutify.app"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="verify-code" className="text-sm font-medium text-slate-600">
                6-Digit Code
              </label>
              <Input
                id="verify-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                maxLength={6}
                required
                className="text-center text-lg tracking-widest"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="new-password" className="text-sm font-medium text-slate-600">
                New Password
              </label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={passwordVisible ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
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
              <p className="text-xs text-slate-400">Minimum 8 characters</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="confirm-password" className="text-sm font-medium text-slate-600">
                Confirm Password
              </label>
              <Input
                id="confirm-password"
                type={passwordVisible ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Updating password...' : 'Update Password'}
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
            <Link to="/admin-portal/reset-password" className="font-semibold text-emerald-600 hover:text-emerald-500">
              Need a new code?
            </Link>
            <span className="mx-2">|</span>
            <Link to="/login" className="font-semibold text-emerald-600 hover:text-emerald-500">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerifyResetCode;
