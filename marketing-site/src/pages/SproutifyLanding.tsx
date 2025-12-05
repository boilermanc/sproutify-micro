import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Sprout,
  ClipboardList,
  Calendar,
  ShoppingCart,
  Calculator,
  ChevronRight,
  Smartphone,
  Monitor,
  CheckCircle2,
  Leaf,
  TrendingUp,
  Users,
  Camera,
  Sun, // Added for Morning Briefing
  BarChart3 // Added for Inventory
} from 'lucide-react';

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

const SproutifyLanding = () => {
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);

  // Cloudflare Turnstile site key
  const TURNSTILE_SITE_KEY: string = (() => {
    const envKey = import.meta.env.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY;
    const fallback = '0x4AAAAAACE0X9epZQxNOlPg'; // Replace with your key
    if (!envKey) return fallback;
    if (typeof envKey === 'string') {
      const trimmed = envKey.trim();
      return trimmed || fallback;
    }
    return String(envKey).trim() || fallback;
  })();

  const N8N_WEBHOOK_URL = 'https://n8n.sproutify.app/webhook/88de5026-2ea2-4da1-ab26-d2ad9c136470';

  // Global flag to prevent multiple script loads
  const turnstileScriptLoaded = typeof window !== 'undefined' && (window as { __turnstileScriptLoaded?: boolean }).__turnstileScriptLoaded;

  // Load Cloudflare Turnstile script
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;

    let isMounted = true;
    let widgetId: string | null = null;
    let checkRefInterval: ReturnType<typeof setInterval> | null = null;
    let checkTurnstileInterval: ReturnType<typeof setInterval> | null = null;

    const initializeTurnstile = () => {
      const container = document.getElementById('turnstile-container');
      if (!isMounted || !container || widgetId || !window.turnstile) return;

      if (container.querySelector('.cf-turnstile-widget') ||
          container.querySelector('iframe[src*="challenges.cloudflare.com"]')) {
        return;
      }

      try {
        const sitekey = TURNSTILE_SITE_KEY;
        if (!sitekey || typeof sitekey !== 'string' || sitekey.length === 0) {
          console.warn('Turnstile sitekey is invalid, disabling Turnstile');
          return;
        }

        widgetId = window.turnstile.render('#turnstile-container', {
          sitekey,
          callback: (token: string) => {
            if (isMounted) {
              setTurnstileToken(token);
              setErrorMessage('');
            }
          },
          'error-callback': () => {
            if (isMounted) setTurnstileToken(null);
          },
        });

        if (isMounted && widgetId) {
          turnstileWidgetIdRef.current = widgetId;
          setTurnstileEnabled(true);
        }
      } catch (error) {
        console.error('Turnstile initialization failed:', error);
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

    checkRefInterval = setInterval(() => {
      const container = document.getElementById('turnstile-container');
      if (container) {
        if (checkRefInterval) {
          clearInterval(checkRefInterval);
          checkRefInterval = null;
        }

        if (window.turnstile) {
          initializeTurnstile();
        } else {
          checkTurnstileInterval = setInterval(() => {
            if (tryInitialize() && checkTurnstileInterval) {
              clearInterval(checkTurnstileInterval);
              checkTurnstileInterval = null;
            }
          }, 100);

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

    setTimeout(() => {
      if (checkRefInterval) {
        clearInterval(checkRefInterval);
        checkRefInterval = null;
      }
    }, 2000);

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
          setTimeout(() => {
            if (isMounted) tryInitialize();
          }, 50);
        }
      };
      script.onerror = () => {
        console.error('Failed to load Turnstile script');
        setTurnstileEnabled(false);
      };
      document.body.appendChild(script);
    } else if (window.turnstile && document.getElementById('turnstile-container')) {
      initializeTurnstile();
    }

    return () => {
      isMounted = false;
      if (checkRefInterval) clearInterval(checkRefInterval);
      if (checkTurnstileInterval) clearInterval(checkTurnstileInterval);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!firstName.trim()) {
      setErrorMessage('Please enter your first name');
      return;
    }

    if (!email.trim()) {
      setErrorMessage('Please enter your email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setErrorMessage('Please enter a valid email address');
      return;
    }

    if (turnstileEnabled && !turnstileToken) {
      setErrorMessage('Please complete the verification');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          email: email.trim().toLowerCase(),
          turnstile_token: turnstileToken,
        }),
      });

      if (!response.ok) throw new Error('Failed to submit registration');

      setSubmitted(true);
      setFirstName('');
      setEmail('');
      setTurnstileToken(null);

      if (turnstileEnabled && window.turnstile && turnstileWidgetIdRef.current) {
        try {
          window.turnstile.reset(turnstileWidgetIdRef.current);
        } catch {
          // Ignore reset errors
        }
      }
    } catch (error) {
      console.error('Registration error:', error);
      setErrorMessage('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fadeInUp = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.2 }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-white overflow-hidden">
      {/* --- NAVBAR --- */}
      <nav className="fixed top-0 w-full z-50 bg-slate-950/80 backdrop-blur-md border-b border-white/10" aria-label="Main navigation">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xl" aria-label="Sproutify Micro Logo">
            <Sprout size={24} aria-hidden="true" />
            <span>Sproutify<span className="text-white">Micro</span></span>
          </div>
          <button
            onClick={() => document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth' })}
            className="px-4 py-2 text-sm font-medium bg-white/10 hover:bg-white/20 rounded-full transition-all"
            aria-label="Scroll to waitlist form"
          >
            Get Early Access
          </button>
        </div>
      </nav>

      <main>

      {/* --- HERO SECTION --- */}
      <section className="relative pt-32 pb-20 px-6 max-w-7xl mx-auto flex flex-col items-center text-center" aria-labelledby="hero-heading">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-emerald-500/20 rounded-full blur-[120px] -z-10" aria-hidden="true" />

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-6"
          role="status"
          aria-live="polite"
        >
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Accepting Beta Testers
        </motion.div>

        <motion.h1
          id="hero-heading"
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent"
        >
          The Operating System for <br className="hidden md:block" />
          <span className="text-emerald-400">Your Microgreens Farm</span>
        </motion.h1>

        <motion.p
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          className="text-lg md:text-xl text-slate-400 max-w-2xl mb-10 leading-relaxed"
        >
          Stop growing in the dark. Manage your trays, optimize your seed inventory, and deliver perfect orders with the first intelligent platform for microgreen farmers.
        </motion.p>

        {/* Email Capture */}
        <motion.div
          id="waitlist"
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          className="w-full max-w-md"
        >
          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-3" aria-label="Join the waitlist for Sproutify Micro">
              <label htmlFor="first-name-input" className="sr-only">First Name</label>
              <input
                id="first-name-input"
                type="text"
                name="firstName"
                placeholder="First name..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-white placeholder:text-slate-500"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={isSubmitting}
                required
                aria-required="true"
                aria-label="Enter your first name"
              />
              <div className="flex gap-2">
                <label htmlFor="email-input" className="sr-only">Email Address</label>
                <input
                  id="email-input"
                  type="email"
                  name="email"
                  placeholder="Enter your email..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-white placeholder:text-slate-500"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                  required
                  aria-required="true"
                  aria-label="Enter your email address"
                />
                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-bold px-6 py-3 rounded-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isSubmitting || (turnstileEnabled && !turnstileToken)}
                  aria-label="Submit waitlist registration"
                >
                  {isSubmitting ? '...' : 'Join'} <ChevronRight size={18} aria-hidden="true" />
                </button>
              </div>
              <div style={{ display: turnstileEnabled ? 'block' : 'none' }} className="flex justify-center" aria-label="Security verification">
                <div id="turnstile-container" ref={turnstileRef} />
              </div>
              {errorMessage && (
                <div className="bg-red-500/20 border border-red-500/30 text-red-300 px-4 py-2 rounded-lg text-sm" role="alert" aria-live="polite">
                  {errorMessage}
                </div>
              )}
            </form>
          ) : (
            <div className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 px-6 py-3 rounded-lg flex items-center justify-center gap-2" role="status" aria-live="polite">
              <CheckCircle2 size={20} aria-hidden="true" /> <span>Thanks! You're on the list.</span>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-500">Join growers waiting for launch.</p>
        </motion.div>
      </section>

      {/* --- HOW IT WORKS (FLOW) --- */}
      <section className="py-20 bg-slate-900/50 border-y border-white/5" aria-labelledby="how-it-works-heading">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 id="how-it-works-heading" className="text-3xl font-bold mb-4">Streamline Your Grow</h2>
            <p className="text-slate-400">Automated logic replaces your spreadsheets.</p>
          </div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-4 gap-8 relative"
          >
            <div className="hidden md:block absolute top-12 left-0 w-full h-0.5 bg-gradient-to-r from-emerald-500/0 via-emerald-500/20 to-emerald-500/0" />

            {[
              { icon: Sprout, title: "Sow", desc: "Use the Mix Calculator to sow the exact amount needed." },
              { icon: ClipboardList, title: "Track", desc: "Follow auto-generated daily tasks for every tray." },
              { icon: Leaf, title: "Harvest", desc: "Log yields and complete production cycles." },
              { icon: TrendingUp, title: "Sell", desc: "Manage orders and recurring deliveries." }
            ].map((step, idx) => (
              <motion.article key={idx} variants={fadeInUp} className="relative flex flex-col items-center text-center z-10">
                <div className="w-24 h-24 rounded-2xl bg-slate-800 border border-white/10 flex items-center justify-center mb-6 shadow-xl shadow-black/50" aria-hidden="true">
                  <step.icon size={32} className="text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold mb-2">{step.title}</h3>
                <p className="text-sm text-slate-400">{step.desc}</p>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </section>

      {/* --- BENTO GRID FEATURES --- */}
      <section className="py-24 max-w-7xl mx-auto px-6" aria-labelledby="features-heading">
        <div className="mb-16">
          <h2 id="features-heading" className="text-3xl md:text-4xl font-bold mb-4">Everything you need to grow.</h2>
          <p className="text-slate-400 text-lg">Powerful features wrapped in a simple interface.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Feature 1: Task Flow (Large) */}
          <motion.article
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="md:col-span-2 bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 rounded-3xl p-8 overflow-hidden relative group"
          >
            <div className="relative z-10">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-4 text-emerald-400" aria-hidden="true">
                <ClipboardList />
              </div>
              <h3 className="text-2xl font-bold mb-2">Smart Daily Task Flow</h3>
              <p className="text-slate-400 max-w-md">Wake up to a clear checklist. See exactly what needs watering, unstacking, or harvesting. Miss a day? Use the "Catch Up" logic to get back on track.</p>
            </div>
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 opacity-50 group-hover:opacity-100 transition-opacity duration-500 hidden md:block">
               <div className="w-64 bg-slate-950 rounded-l-xl p-4 border-l border-y border-white/10 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full border border-slate-600" />
                    <div className="h-2 w-24 bg-slate-700 rounded-full" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full border border-emerald-500 bg-emerald-500/20" />
                    <div className="h-2 w-32 bg-slate-700 rounded-full" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full border border-slate-600" />
                    <div className="h-2 w-20 bg-slate-700 rounded-full" />
                  </div>
               </div>
            </div>
          </motion.article>

          {/* Feature 2: Recipe Management */}
          <motion.article
             initial={{ opacity: 0, scale: 0.95 }}
             whileInView={{ opacity: 1, scale: 1 }}
             viewport={{ once: true }}
             transition={{ delay: 0.1 }}
             className="bg-slate-900 border border-white/10 rounded-3xl p-8 hover:border-emerald-500/30 transition-colors"
          >
            <Calendar className="text-emerald-400 mb-4" size={32} aria-hidden="true" />
            <h3 className="text-xl font-bold mb-2">Recipe Management</h3>
            <p className="text-slate-400 text-sm">50+ pre-built recipes included. Customize timelines and cloning to match your environment.</p>
          </motion.article>

          {/* Feature 3: Mix Calculator */}
          <motion.article
             initial={{ opacity: 0, scale: 0.95 }}
             whileInView={{ opacity: 1, scale: 1 }}
             viewport={{ once: true }}
             transition={{ delay: 0.2 }}
             className="bg-slate-900 border border-white/10 rounded-3xl p-8 hover:border-emerald-500/30 transition-colors"
          >
            <Calculator className="text-emerald-400 mb-4" size={32} aria-hidden="true" />
            <h3 className="text-xl font-bold mb-2">Mix Calculator</h3>
            <p className="text-slate-400 text-sm">Calculate trays needed based on order weight, projected yield, and delivery dates instantly.</p>
          </motion.article>

          {/* Feature 4: Orders & Sales (Large) */}
          <motion.article
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="md:col-span-2 bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 rounded-3xl p-8 overflow-hidden group"
          >
            <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4 text-blue-400" aria-hidden="true">
              <ShoppingCart />
            </div>
            <h3 className="text-2xl font-bold mb-2">Orders & Sales Management</h3>
            <p className="text-slate-400 max-w-lg">Handle one-time purchases or recurring restaurant standing orders. We track fulfillment from the moment an order is placed until delivery.</p>
          </motion.article>
        </div>
      </section>

      {/* --- SAGE AI SECTION --- */}
      <section className="py-24 relative overflow-hidden" aria-labelledby="sage-heading">
        <div className="absolute inset-0 bg-slate-950" aria-hidden="true">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-900/20 rounded-full blur-[120px]" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-[80px]" />
        </div>

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="flex flex-col md:flex-row items-center gap-16">

            {/* Left: Text & Features */}
            <div className="flex-1 order-2 md:order-1">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-bold mb-6"
                role="status"
              >
                <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" aria-hidden="true" />
                INTELLIGENCE LAYER
              </motion.div>

              <h2 id="sage-heading" className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
                Meet <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-indigo-400">Sage</span>. <br />
                Your 24/7 Operations Manager.
              </h2>
              <p className="text-slate-400 text-lg mb-8 leading-relaxed">
                Stop growing in the dark. Sage acts as your farm's brain, connecting your inventory, task lists, and order data to give you daily strategy, not just data.
              </p>

              <div className="space-y-6">
                {[
                   {
                    icon: Sun,
                    title: "The Morning Briefing",
                    desc: "Start the day with strategy. Sage analyzes your trays to flag yield drops, overdue tasks, and opportunities to sell extra product."
                  },
                  {
                    icon: Camera,
                    title: "Instant Diagnostics",
                    desc: "Spot mold or grow issues instantly. Sage uses visual analysis to distinguish between harmless root hairs and dangerous pathogens."
                  },
                  {
                    icon: BarChart3,
                    title: "Active Inventory",
                    desc: "Link your harvest to your orders. Sage warns you immediately if you're sowing too little for next week's demand."
                  }
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="flex gap-4 group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center shrink-0 group-hover:border-indigo-500/50 group-hover:bg-indigo-500/10 transition-all">
                       <item.icon size={20} className="text-indigo-400 group-hover:text-indigo-300" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white group-hover:text-indigo-300 transition-colors">{item.title}</h4>
                      <p className="text-sm text-slate-500">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Right: Sage Visual (Chat Interface) */}
            <div className="flex-1 w-full flex justify-center order-1 md:order-2">
              <div className="relative w-full max-w-md">

                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-gradient-to-tr from-indigo-500/20 to-emerald-500/20 rounded-full blur-[60px] animate-pulse" />

                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  whileInView={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.8 }}
                  className="relative bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl"
                >
                    <div className="flex items-center gap-3 border-b border-white/5 pb-4 mb-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20" aria-hidden="true">
                      <Sprout size={20} className="text-white" />
                    </div>
                    <div>
                      <div className="font-bold text-sm">Sage AI</div>
                      <div className="text-xs text-emerald-400 flex items-center gap-1" aria-label="Sage AI is online">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true"/> Connected to Inventory
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* User Message */}
                    <div className="flex gap-3 justify-end">
                      <div className="bg-slate-800 text-slate-200 text-sm px-4 py-3 rounded-2xl rounded-tr-sm max-w-[85%] leading-relaxed">
                        Do I have enough sunflower seed for the Fresh Foods order next week?
                      </div>
                    </div>

                    {/* Sage Response */}
                    <motion.div
                       initial={{ opacity: 0 }}
                       whileInView={{ opacity: 1 }}
                       transition={{ delay: 1, duration: 0.5 }}
                       className="flex gap-3"
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-emerald-500 flex-shrink-0 flex items-center justify-center">
                         <Sprout size={14} className="text-white" />
                      </div>
                      <div className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-100 text-sm px-4 py-3 rounded-2xl rounded-tl-sm max-w-[95%]">
                        <p className="mb-2 text-xs text-indigo-300 font-mono uppercase tracking-wide">Checking Recipes & Stock...</p>
                        
                        <div className="flex items-start gap-2 mb-2">
                          <span className="text-amber-400 font-bold">⚠️ Potential Shortfall</span>
                        </div>

                        <ul className="space-y-1 text-slate-300 mb-3 text-xs">
                          <li className="flex justify-between">
                            <span>Required for Order:</span>
                            <span className="font-bold text-white">4.5 lbs</span>
                          </li>
                          <li className="flex justify-between">
                            <span>Current Stock:</span>
                            <span className="font-bold text-amber-300">4.25 lbs</span>
                          </li>
                        </ul>
                        
                        <p className="text-slate-200 text-xs border-t border-indigo-500/20 pt-2 mt-2">
                          You are short <strong>0.25 lbs</strong>. <br/>
                          <span className="text-emerald-400">Recommendation:</span> You can supplement from your backup stock or order a small amount to cover the gap.
                        </p>
                      </div>
                    </motion.div>
                  </div>

                  {/* Floating Badge */}
                  <motion.div
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute -right-8 -bottom-4 bg-slate-800 border border-white/10 p-3 rounded-lg shadow-xl flex items-center gap-2"
                  >
                    <div className="w-2 h-2 bg-amber-400 rounded-full" />
                    <span className="text-xs font-bold text-slate-300">Inventory Alert</span>
                  </motion.div>

                </motion.div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* --- PLATFORM & AUDIENCE --- */}
      <section className="py-20 bg-slate-900/30" aria-labelledby="audience-heading">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-16 items-center">

          <div>
            <h2 id="audience-heading" className="text-3xl font-bold mb-8">Built for growers of all sizes</h2>
            <div className="space-y-4">
              {[
                { label: "Home Growers", desc: "Scaling from 2 to 20 trays a week." },
                { label: "Market Farmers", desc: "Selling efficiently at weekend markets." },
                { label: "Wholesale Ops", desc: "Supplying restaurants with recurring orders." }
              ].map((item, i) => (
                <article key={i} className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                  <div className="bg-emerald-500/20 p-2 rounded-lg text-emerald-400" aria-hidden="true">
                    <Users size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold">{item.label}</h3>
                    <p className="text-sm text-slate-400">{item.desc}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500/20 blur-[100px] -z-10" aria-hidden="true" />
            <article className="bg-slate-950 border border-white/10 rounded-2xl p-8 shadow-2xl">
              <div className="flex gap-6 mb-8 border-b border-white/10 pb-8">
                <div className="text-center flex-1">
                  <Smartphone className="mx-auto mb-2 text-emerald-400" size={32} aria-hidden="true" />
                  <h3 className="font-bold">In The Field</h3>
                  <p className="text-xs text-slate-500 mt-1">Check off tasks, log harvests, and view recipes on your phone.</p>
                </div>
                <div className="w-px bg-white/10" aria-hidden="true" />
                <div className="text-center flex-1">
                  <Monitor className="mx-auto mb-2 text-blue-400" size={32} aria-hidden="true" />
                  <h3 className="font-bold">In The Office</h3>
                  <p className="text-xs text-slate-500 mt-1">Plan production, manage orders, and analyze yield data.</p>
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-300">Syncs instantly across all devices.</p>
              </div>
            </article>
          </div>

        </div>
      </section>

      {/* --- CTA / FOOTER --- */}
      <section className="py-32 px-6 text-center" aria-labelledby="cta-heading">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          className="max-w-3xl mx-auto"
        >
          <h2 id="cta-heading" className="text-4xl md:text-5xl font-bold mb-6">Ready to optimize your farm?</h2>
          <p className="text-xl text-slate-400 mb-8">
            Join the waitlist today. Free trial available at launch.
          </p>
          <button
             onClick={() => document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth' })}
             className="bg-emerald-500 hover:bg-emerald-600 text-emerald-950 text-lg font-bold px-8 py-4 rounded-full transition-transform hover:scale-105 shadow-lg shadow-emerald-500/25"
             aria-label="Join the waitlist for Sproutify Micro"
          >
            Join the Waitlist
          </button>
        </motion.div>

        <footer className="mt-24 pt-8 border-t border-white/10 text-slate-600 text-sm" role="contentinfo">
          <p>&copy; {new Date().getFullYear()} Sproutify Micro. All rights reserved.</p>
        </footer>
      </section>

      </main>
    </div>
  );
};

export default SproutifyLanding;
