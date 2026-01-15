import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const INITIAL_FORM = {
  name: '',
  email: '',
  password: '',
  farmName: '',
};

const BetaSignupPage = () => {
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.name || !formData.email || !formData.password || !formData.farmName) {
      setError('All fields are required to create a beta farm.');
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      setError('Server is missing configuration. Please try again later.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          password: formData.password,
          farmName: formData.farmName.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.message || 'Failed to create beta account.');
      }

      setSuccess(result.message || 'Account created! You can now sign in with the credentials you provided.');
      setFormData(INITIAL_FORM);
    } catch (err: any) {
      console.error('[BetaSignup] Error creating account:', err);
      setError(err?.message || 'Failed to create beta account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-12">
      <div className="relative z-10 w-full max-w-md space-y-6">
        <div className="text-center text-white/70">
          <p className="text-xs uppercase tracking-[0.4em] text-white/30">Sproutify Micro</p>
          <h1 className="text-3xl font-semibold text-white">Beta Farm Signup</h1>
          <p className="text-sm text-white/60">
            Create a farm owner account so beta testers can access the portal during the initial rollout.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/10 p-8 shadow-2xl shadow-purple-500/30 backdrop-blur">
          {error && (
            <div className="mb-4 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="beta-name">Full Name</Label>
              <Input
                id="beta-name"
                value={formData.name}
                onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Jane Farmer"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="beta-email">Email</Label>
              <Input
                id="beta-email"
                type="email"
                value={formData.email}
                onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="you@sproutify.app"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="beta-farm">Farm Name</Label>
              <Input
                id="beta-farm"
                value={formData.farmName}
                onChange={(event) => setFormData((prev) => ({ ...prev, farmName: event.target.value }))}
                placeholder="Sproutify Beta Farm"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="beta-password">Password</Label>
              <Input
                id="beta-password"
                type="password"
                value={formData.password}
                onChange={(event) => setFormData((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Minimum 6 characters"
              />
            </div>

            <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700" disabled={loading}>
              {loading ? 'Creating account...' : 'Create beta account'}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-sm font-semibold text-purple-200 hover:text-white"
            >
              ← Back to admin login
            </button>
          </div>
          <div className="mt-6 text-center text-[10px] text-white/40">
            © Sweetwater Technology 2025
          </div>
        </div>
      </div>
    </div>
  );
};

export default BetaSignupPage;

