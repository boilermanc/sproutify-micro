import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import './LoginPage.css';

interface LoginPageProps {
  onLogin: () => void;
}

const LoginPage = ({ onLogin }: LoginPageProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAutoLoggingIn, setIsAutoLoggingIn] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const emailParam = searchParams.get('email');
    const session = localStorage.getItem('sproutify_session');

    if (session) {
        onLogin();
        navigate('/');
        return;
    }

    if (emailParam) {
      setIsAutoLoggingIn(true);
      // Small timeout to ensure state update is processed before starting heavy work if any
      // but mostly to ensure UI feedback.
      setTimeout(() => handleAutoLogin(emailParam), 100);
    }
  }, [searchParams]);

  const handleAutoLogin = async (emailParam: string) => {
    try {
      // Immediate login, no artificial delay
      localStorage.setItem('sproutify_session', JSON.stringify({
        email: emailParam,
        farmUuid: 'demo-farm-uuid',
        role: 'owner'
      }));

      onLogin();
      navigate('/');
    } catch (err) {
      setError('Auto-login failed. Please try manually.');
      setIsAutoLoggingIn(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // In production, this would authenticate with Supabase
      // For now, simulate login
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Store session
      localStorage.setItem('sproutify_session', JSON.stringify({
        email,
        farmUuid: 'demo-farm-uuid',
        role: 'owner'
      }));

      onLogin();
      navigate('/');
    } catch (err) {
      setError('Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (isAutoLoggingIn) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div className="loading-spinner"></div>
            <h2 style={{ marginTop: '1.5rem', color: '#5B7C99' }}>Logging you in...</h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card">
          <h1 className="login-title">Sproutify Micro Admin</h1>
          <p className="login-subtitle">Welcome back! Sign in to continue.</p>

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
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
