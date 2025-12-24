import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import './LoginPage.css';

const ResetPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setStatus('error');
      setMessage('Please provide an email address.');
      return;
    }

    setLoading(true);
    setStatus('idle');
    setMessage('');

    try {
      if (!supabase) {
        throw new Error('Supabase is not configured.');
      }

      const { error } = await supabase.auth.resetPasswordForEmail(trimmed);
      if (error) {
        throw error;
      }

      setStatus('success');
      setMessage('Reset link sent. Check your inbox.');
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message || 'Unable to send reset link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card">
          <h1 className="login-title">Sproutify Micro</h1>
          <p className="login-subtitle">Reset your password</p>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="reset-email">Email</label>
              <input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="your@email.com"
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Sending reset link...' : 'Send reset link'}
            </button>
          </form>

          {message && (
            <p
              className={`text-xs mt-3 ${
                status === 'success' ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {message}
            </p>
          )}

          <div className="login-footer">
            <Link to="/login">← Back to login</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;

