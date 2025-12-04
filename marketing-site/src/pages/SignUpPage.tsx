import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import './LoginPage.css';

// Extend Window interface for Turnstile
declare global {
  interface Window {
    turnstile?: {
      render: (selectorOrElement: string | HTMLElement, options: {
        sitekey: string;
        callback?: (token: string) => void;
        'error-callback'?: () => void;
      }) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SignUpPage = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    farmName: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);

  // Cloudflare Turnstile site key
  const TURNSTILE_SITE_KEY_RAW = import.meta.env.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY || '0x4AAAAAACE0X9epZQxNOlPg';
  const TURNSTILE_SITE_KEY = typeof TURNSTILE_SITE_KEY_RAW === 'string' ? TURNSTILE_SITE_KEY_RAW.trim() : String(TURNSTILE_SITE_KEY_RAW).trim();

  // Global flag to prevent multiple script loads
  const turnstileScriptLoaded = typeof window !== 'undefined' && (window as { __turnstileScriptLoaded?: boolean }).__turnstileScriptLoaded;

  // Load Cloudflare Turnstile script and initialize widget
  useEffect(() => {
    // Skip if no site key
    if (!TURNSTILE_SITE_KEY) {
      return;
    }

    let isMounted = true;
    let widgetId: string | null = null;

    const initializeTurnstile = () => {
      // Final checks before rendering - verify element exists by ID
      const container = document.getElementById('turnstile-container-signup');
      if (!isMounted || !container || widgetId || !window.turnstile) {
        return;
      }

      // Check if widget already exists in DOM
      if (container.querySelector('.cf-turnstile-widget') || 
          container.querySelector('iframe[src*="challenges.cloudflare.com"]')) {
        return;
      }

      try {
        // Ensure sitekey is definitely a string
        const sitekey = String(TURNSTILE_SITE_KEY);
        
        if (!sitekey || sitekey.length === 0) {
          console.warn('Turnstile sitekey is invalid, disabling Turnstile');
          return;
        }

        // Use CSS selector string instead of ref element to avoid React ref proxy issues
        widgetId = window.turnstile.render('#turnstile-container-signup', {
          sitekey,
          callback: (token: string) => {
            if (isMounted) {
              setTurnstileToken(token);
              setError('');
            }
          },
          'error-callback': () => {
            if (isMounted) {
              setTurnstileToken(null);
            }
          },
        });

        if (isMounted && widgetId) {
          turnstileWidgetIdRef.current = widgetId;
          setTurnstileEnabled(true);
        }
      } catch (error) {
        console.error('Turnstile initialization failed:', error);
        // Don't show error to user, just disable Turnstile
        setTurnstileEnabled(false);
      }
    };

    // Check if Turnstile is already available
    if (window.turnstile) {
      initializeTurnstile();
    } else {
      // Check if script is already being loaded
      if (!turnstileScriptLoaded && !document.querySelector('script[src*="turnstile"]')) {
        if (typeof window !== 'undefined') {
          (window as { __turnstileScriptLoaded?: boolean }).__turnstileScriptLoaded = true;
        }
        
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.onload = () => {
          if (isMounted) {
            // Wait a bit for Turnstile API to be fully ready
            setTimeout(initializeTurnstile, 50);
          }
        };
        script.onerror = () => {
          console.error('Failed to load Turnstile script');
          setTurnstileEnabled(false);
        };
        document.body.appendChild(script);
      } else {
        // Script is loading, wait for it
        const checkTurnstile = setInterval(() => {
          if (window.turnstile) {
            clearInterval(checkTurnstile);
            if (isMounted) {
              initializeTurnstile();
            }
          }
        }, 100);

        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(checkTurnstile);
          if (!window.turnstile) {
            console.warn('Turnstile failed to load, continuing without it');
            setTurnstileEnabled(false);
          }
        }, 5000);
      }
    }

    // Cleanup
    return () => {
      isMounted = false;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          // Ignore cleanup errors
        }
        widgetId = null;
        turnstileWidgetIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [TURNSTILE_SITE_KEY]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Validate email format
    if (!formData.email || !validateEmail(formData.email)) {
      setError('Please enter a valid email address.');
      return;
    }

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match. Please try again.');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    // Check Cloudflare Turnstile (if enabled)
    if (turnstileEnabled && !turnstileToken) {
      setError('Please complete the verification.');
      return;
    }

    setLoading(true);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      // Call the signup function
      const response = await fetch(`${supabaseUrl}/functions/v1/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey || '',
          'Authorization': `Bearer ${supabaseAnonKey || ''}`,
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          name: formData.name,
          farmName: formData.farmName,
          turnstile_token: turnstileToken, // Include for verification on backend if needed
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('Signup error:', result);
        throw new Error(result.error || result.message || 'Failed to create account');
      }

      // Sign in the user automatically
      if (!supabase) {
        throw new Error('Supabase is not configured. Please contact support.');
      }

      const { data: { user, session }, error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (signInError || !user || !session) {
        throw new Error('Account created but failed to sign in. Please try logging in.');
      }

      const adminUrl =
        import.meta.env.VITE_WEB_ADMIN_URL ||
        import.meta.env.VITE_WEB_ADMIN_LOGIN_URL ||
        'http://localhost:5174/login';

      if (!session.access_token || !session.refresh_token) {
        throw new Error('Account created but missing session tokens. Please log in manually.');
      }

      const targetUrl = new URL(adminUrl);
      targetUrl.searchParams.set('access_token', session.access_token);
      targetUrl.searchParams.set('refresh_token', session.refresh_token);
      targetUrl.searchParams.set('email', user.email ?? formData.email);

      window.location.assign(targetUrl.toString());
    } catch (err: unknown) {
      console.error('Signup error details:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to create account. Please try again.';
      setError(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card">
          <h1 className="login-title">Start Your Free Trial</h1>
          <p className="login-subtitle">Create your account and get 7 days free</p>

          <form onSubmit={handleSignUp} className="login-form">
            <div className="form-group">
              <label htmlFor="name">Full Name</label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="John Doe"
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                placeholder="your@email.com"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="password-input-wrapper">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  placeholder="••••••••"
                  minLength={6}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <div className="password-input-wrapper">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  required
                  placeholder="••••••••"
                  minLength={6}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="farmName">Farm Name</label>
              <input
                id="farmName"
                type="text"
                value={formData.farmName}
                onChange={(e) => setFormData({ ...formData, farmName: e.target.value })}
                required
                placeholder="My Microgreen Farm"
              />
            </div>

            {turnstileEnabled && (
              <div className="form-group">
                <div id="turnstile-container-signup" ref={turnstileRef} />
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={loading || (turnstileEnabled && !turnstileToken)}>
              {loading ? 'Creating Account...' : 'Start Free Trial'}
            </button>
            
            {error && <div className="error-message" style={{ marginTop: '1rem' }}>{error}</div>}
          </form>

          <div className="login-footer">
            <p style={{ marginBottom: '0.5rem', color: '#636E72', fontSize: '0.875rem' }}>
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
            <Link to="/">← Back to Home</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignUpPage;

