import { useState, useEffect, useRef } from 'react';
import './PreLaunchPage.css';
import sproutifyLogo from '../assets/sproutify micro.png';

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

const PreLaunchPage = () => {
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);

  // Cloudflare Turnstile site key - ensure it's always a string primitive
  const TURNSTILE_SITE_KEY: string = (() => {
    const envKey = import.meta.env.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY;
    const fallback = '0x4AAAAAACE0X9epZQxNOlPg';
    
    // If no env key, use fallback
    if (!envKey) {
      return fallback;
    }
    
    // If it's already a string, trim and return
    if (typeof envKey === 'string') {
      const trimmed = envKey.trim();
      return trimmed || fallback;
    }
    
    // Otherwise convert to string - this should never happen with Vite env vars
    const asString = String(envKey);
    return asString.trim() || fallback;
  })();
  const N8N_WEBHOOK_URL = 'https://n8n.sproutify.app/webhook/88de5026-2ea2-4da1-ab26-d2ad9c136470';

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
    let checkRefInterval: ReturnType<typeof setInterval> | null = null;
    let checkTurnstileInterval: ReturnType<typeof setInterval> | null = null;

    const initializeTurnstile = () => {
      // Final checks before rendering - verify element exists by ID
      const container = document.getElementById('turnstile-container');
      if (!isMounted || !container || widgetId || !window.turnstile) {
        return;
      }

      // Check if widget already exists in DOM
      if (container.querySelector('.cf-turnstile-widget') || 
          container.querySelector('iframe[src*="challenges.cloudflare.com"]')) {
        return;
      }

      try {
        // Get the sitekey - must be a string primitive
        const sitekey = TURNSTILE_SITE_KEY;
        
        // Validate it's a non-empty string
        if (!sitekey || typeof sitekey !== 'string' || sitekey.length === 0) {
          console.warn('Turnstile sitekey is invalid, disabling Turnstile');
          return;
        }

        // Log for debugging - pass as separate arguments, not as object
        console.log('Initializing Turnstile with sitekey:', sitekey, typeof sitekey);

        // Pass sitekey directly as a string primitive to Turnstile
        // Use CSS selector string instead of ref element to avoid React ref proxy issues
        widgetId = window.turnstile.render('#turnstile-container', {
          sitekey,
          callback: (token: string) => {
            if (isMounted) {
              setTurnstileToken(token);
              setErrorMessage('');
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

    const tryInitialize = () => {
      const container = document.getElementById('turnstile-container');
      if (window.turnstile && container) {
        initializeTurnstile();
        return true;
      }
      return false;
    };

    // Wait for container element to be available, then check for Turnstile
    checkRefInterval = setInterval(() => {
      const container = document.getElementById('turnstile-container');
      if (container) {
        if (checkRefInterval) {
          clearInterval(checkRefInterval);
          checkRefInterval = null;
        }
        
        // If Turnstile is already loaded, initialize immediately
    if (window.turnstile) {
      initializeTurnstile();
    } else {
          // Otherwise, wait for Turnstile to load
          checkTurnstileInterval = setInterval(() => {
            if (tryInitialize() && checkTurnstileInterval) {
              clearInterval(checkTurnstileInterval);
              checkTurnstileInterval = null;
            }
          }, 100);

          // Timeout after 5 seconds
          setTimeout(() => {
            if (checkTurnstileInterval) {
              clearInterval(checkTurnstileInterval);
              checkTurnstileInterval = null;
            }
            if (!window.turnstile) {
              console.warn('Turnstile failed to load, continuing without it');
              setTurnstileEnabled(false);
            }
          }, 5000);
        }
      }
    }, 100);

    // Timeout after 2 seconds if ref never becomes available
    setTimeout(() => {
      if (checkRefInterval) {
        clearInterval(checkRefInterval);
        checkRefInterval = null;
      }
    }, 2000);

    // Check if script needs to be loaded
    if (!window.turnstile && !turnstileScriptLoaded && !document.querySelector('script[src*="turnstile"]')) {
        if (typeof window !== 'undefined') {
          (window as { __turnstileScriptLoaded?: boolean }).__turnstileScriptLoaded = true;
        }
        
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.onload = () => {
          const container = document.getElementById('turnstile-container');
          if (isMounted && container) {
            // Wait a bit for Turnstile API to be fully ready
            setTimeout(() => {
              if (isMounted) {
                tryInitialize();
              }
            }, 50);
          }
        };
        script.onerror = () => {
          console.error('Failed to load Turnstile script');
          setTurnstileEnabled(false);
        };
        document.body.appendChild(script);
    } else if (window.turnstile && document.getElementById('turnstile-container')) {
      // Turnstile already loaded and container is available
      initializeTurnstile();
    }

    // Cleanup
    return () => {
      isMounted = false;
      if (checkRefInterval) {
        clearInterval(checkRefInterval);
      }
      if (checkTurnstileInterval) {
        clearInterval(checkTurnstileInterval);
      }
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
  }, [TURNSTILE_SITE_KEY]); // turnstileScriptLoaded is a global flag, doesn't need to be in deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    // Validation
    if (!firstName.trim()) {
      setErrorMessage('Please enter your first name');
      return;
    }

    if (!email.trim()) {
      setErrorMessage('Please enter your email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setErrorMessage('Please enter a valid email address');
      return;
    }

    // Check Cloudflare Turnstile (if enabled)
    if (turnstileEnabled && !turnstileToken) {
      setErrorMessage('Please complete the verification');
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      // Send to n8n webhook
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          first_name: firstName.trim(),
          email: email.trim().toLowerCase(),
          turnstile_token: turnstileToken, // Include for verification on backend if needed
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit registration');
      }

      // Success
      setSubmitStatus('success');
      setFirstName('');
      setEmail('');
      setTurnstileToken(null);
      
      // Reset Turnstile widget if it exists
      if (turnstileEnabled && window.turnstile && turnstileWidgetIdRef.current) {
        try {
          window.turnstile.reset(turnstileWidgetIdRef.current);
          setTurnstileToken(null);
        } catch {
          // Ignore reset errors
        }
      }
    } catch (error) {
      console.error('Registration error:', error);
      setSubmitStatus('error');
      setErrorMessage('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="pre-launch-page">
      <header className="pre-launch-header">
        <div className="container">
          <div className="logo">
            <img src={sproutifyLogo} alt="Sproutify Micro" className="logo-image" />
          </div>
        </div>
      </header>

      <main className="pre-launch-main">
        <div className="container">
          <div className="pre-launch-content">
            <div className="pre-launch-hero">
              <h1 className="pre-launch-title">
                Sproutify Micro is<br />
                <span className="highlight">Coming Soon</span>
              </h1>
              <p className="pre-launch-subtitle">
                The complete management solution for microgreen growers. 
                Track trays, manage batches, streamline orders, and grow your business.
              </p>
            </div>

            <div className="pre-launch-form-container">
              {submitStatus === 'success' ? (
                <div className="success-message">
                  <div className="success-icon">✓</div>
                  <h2>Thank You!</h2>
                  <p>We've received your registration. We'll notify you when Sproutify Micro launches.</p>
                  <button 
                    onClick={() => setSubmitStatus('idle')}
                    className="btn btn-primary"
                  >
                    Register Another Email
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="pre-launch-form">
                  <h2 className="form-title">Get Early Access</h2>
                  <p className="form-subtitle">Be the first to know when we launch</p>

                  <div className="form-group">
                    <label htmlFor="firstName">First Name</label>
                    <input
                      type="text"
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Enter your first name"
                      disabled={isSubmitting}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="email">Email Address</label>
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      disabled={isSubmitting}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ display: turnstileEnabled ? 'block' : 'none' }}>
                    <div id="turnstile-container" ref={turnstileRef} />
                  </div>

                  {errorMessage && (
                    <div className="error-message">{errorMessage}</div>
                  )}

                  {submitStatus === 'error' && !errorMessage && (
                    <div className="error-message">
                      Something went wrong. Please try again.
                    </div>
                  )}

                  <button
                    type="submit"
                    className="btn btn-primary btn-submit"
                    disabled={isSubmitting || (turnstileEnabled && !turnstileToken)}
                  >
                    {isSubmitting ? 'Submitting...' : 'Get Notified'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="pre-launch-footer">
        <div className="container">
          <p>&copy; {new Date().getFullYear()} Sproutify Micro. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default PreLaunchPage;

