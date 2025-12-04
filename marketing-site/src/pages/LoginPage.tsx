import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import './LoginPage.css';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!supabase) {
      setError('Supabase is not configured. Please contact support.');
      setLoading(false);
      return;
    }

    try {
      // Authenticate with Supabase
      const { data: { user, session }, error: signInError } = await supabase.auth.signInWithPassword({
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
      const { data: profile, error: profileError } = await supabase
        .from('profile')
        .select('*, farms(*)')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        throw new Error('Profile not found. Please contact your administrator.');
      }

      // Store session
      localStorage.setItem('sproutify_session', JSON.stringify({
        email: user.email,
        farmUuid: profile.farm_uuid,
        role: profile.role,
        userId: user.id,
        farmName: profile.farms?.farm_name || 'Unknown Farm'
      }));

      // Redirect to web-admin app
      // Use relative path for production, or detect environment
      const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const targetUrl = isDevelopment ? `http://localhost:5174/` : `/admin/`;
      window.location.assign(targetUrl);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Invalid credentials. Please try again.';
      setError(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card">
          <h1 className="login-title">Sproutify Micro</h1>
          <p className="login-subtitle">Sign in to your account</p>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="your@email.com"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="login-footer">
            <p style={{ marginBottom: '0.5rem', color: '#636E72', fontSize: '0.875rem' }}>
              Don't have an account? <Link to="/signup">Sign up for free</Link>
            </p>
            <Link to="/">← Back to Home</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
