import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { AuthError, AuthApiError } from '@supabase/supabase-js';
import { getSupabaseClient } from './lib/supabaseClient';
import { buildSessionPayload } from './utils/session';
import { clearSupabaseAuthStorage } from './utils/authStorage';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import UsersPage from './pages/UsersPage';
import VarietiesPage from './pages/VarietiesPage';
import RecipesPage from './pages/RecipesPage';
import RecipeBuilderPage from './pages/RecipeBuilder';
import GlobalRecipesPage from './pages/GlobalRecipesPage';
import ProductsPage from './pages/ProductsPage';
import MixCalculatorPage from './pages/MixCalculatorPage';
import BatchesPage from './pages/BatchesPage';
import OrdersPage from './pages/OrdersPage';
import StandingOrdersPage from './pages/StandingOrdersPage';
import PlantingSchedulePage from './pages/PlantingSchedulePage';
import CalendarPage from './pages/CalendarPage';
import WeeklyTasksPage from './pages/WeeklyTasksPage';
import CustomersPage from './pages/CustomersPage';
import VendorsPage from './pages/VendorsPage';
import SuppliesPage from './pages/SuppliesPage';
import TraysPage from './pages/TraysPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import DailyFlow from './components/DailyFlow';
import Layout from './components/Layout';
import SageChat from './components/SageChat';
import Activity from './pages/Activity';
import HelpCenterPage from './pages/HelpCenterPage';
import AdminLogin from './pages/AdminLogin';
import RequireAdmin from './components/RequireAdmin';
import AdminLayout from './components/AdminLayout';
import AdminDashboard from './pages/AdminDashboard';
import AdminFarmsUsers from './pages/AdminFarmsUsers';
import AdminRecipesVarieties from './pages/AdminRecipesVarieties';
import AdminTraysBatches from './pages/AdminTraysBatches';
import AdminCustomersOrders from './pages/AdminCustomersOrders';
import AdminProducts from './pages/AdminProducts';
import AdminNotifications from './pages/AdminNotifications';
import AdminEmailBroadcast from './pages/AdminEmailBroadcast';
import AdminEmailEvents from './pages/AdminEmailEvents';
import BetaSignupPage from './pages/BetaSignupPage';
import PasswordResetPage from './pages/PasswordResetPage';
import './App.css';

const SESSION_WARNING_TIMEOUT_MS = 8000;
const SESSION_HARD_TIMEOUT_MS = 15000;

const clearSupabaseStorageKeys = (): string[] => {
  const clearedKeys: string[] = [];
  if (typeof localStorage === 'undefined') {
    return clearedKeys;
  }

  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i);
    if (!key) continue;

    if (key.toLowerCase().includes('supabase')) {
      localStorage.removeItem(key);
      clearedKeys.push(key);
    }
  }

  return clearedKeys;
};

const isInvalidRefreshTokenError = (error?: AuthError | AuthApiError | null): boolean => {
  if (!error) {
    return false;
  }

  try {
    return /refresh token not found|invalid refresh token/i.test(error.message);
  } catch {
    return false;
  }
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const hasCheckedSession = useRef(false);

  useEffect(() => {
    let isMounted = true;
    const activeTimeouts = new Set<ReturnType<typeof setTimeout>>();

    const registerTimeout = (id: ReturnType<typeof setTimeout>) => {
      activeTimeouts.add(id);
      return id;
    };

    const cancelTimeout = (id: ReturnType<typeof setTimeout> | null) => {
      if (!id) return;
      activeTimeouts.delete(id);
      clearTimeout(id);
    };

    const checkSession = async () => {
      console.log('[App] checkSession started');
      try {
        // Check if supabase client exists
        const client = getSupabaseClient();
        console.log('[App] Supabase client exists:', !!client);

        if (!client) {
          console.error('[App] No Supabase client!');
          setIsLoading(false);
          return;
        }

        // Check for getSupabaseClient() session with timeout
        console.log('[App] Calling getSupabaseClient().auth.getSession()...');

        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        timeoutId = registerTimeout(
          setTimeout(() => {
            activeTimeouts.delete(timeoutId!);
            console.warn(
              `[App] Session check still running after ${SESSION_WARNING_TIMEOUT_MS / 1000}s, continuing to wait for Supabase`,
            );
          }, SESSION_WARNING_TIMEOUT_MS)
        );

        const getSessionWithTimeout = async () => {
          let hardTimeoutId: ReturnType<typeof setTimeout> | null = null;
          const timeoutPromise = new Promise<never>((_resolve, reject) => {
            hardTimeoutId = registerTimeout(
              setTimeout(() => reject(new Error('Session check timed out')), SESSION_HARD_TIMEOUT_MS)
            );
          });

          try {
            return Promise.race([
              client.auth.getSession(),
              timeoutPromise,
            ]);
          } finally {
            cancelTimeout(hardTimeoutId);
          }
        };

        const { data: { session }, error } = await getSessionWithTimeout();
        cancelTimeout(timeoutId);

        console.log('[App] getSession result:', { hasSession: !!session, error });

        if (error) {
          if (isInvalidRefreshTokenError(error)) {
            console.warn('[App] Invalid refresh token detected, clearing stored session', error.message);
            try {
              await client.auth.signOut();
            } catch (signOutError) {
              console.warn('[App] Failed to sign out while clearing session', signOutError);
            }
          }

          localStorage.removeItem('sproutify_session');
          setIsAuthenticated(false);
          if (isMounted) {
            setIsLoading(false);
          }
          return;
        }

        if (session) {
          // Skip profile check for admin users (team@sproutify.app)
          // Admin users are handled by RequireAdmin component
          if (session.user.email?.toLowerCase() === 'team@sproutify.app') {
            // Admin user - check if they have admin session
            console.log('[App] Admin user detected, skipping profile check');
            const adminSession = localStorage.getItem('sproutify_admin_session');
            if (adminSession) {
              // Admin is logged in, but not authenticated for regular app
              setIsAuthenticated(false);
            } else {
              setIsAuthenticated(false);
            }
            return;
          }

          // Regular user - verify session and get user profile
          console.log('[App] Regular user, fetching profile...');
          const { data: profile, error: profileError } = await getSupabaseClient()
            .from('profile')
            .select('*, farms(*)')
            .eq('id', session.user.id)
            .single();

          console.log('[App] Profile result:', { hasProfile: !!profile, profileError });
          if (profile && !profileError) {
            console.log('[App] Building session payload...');
            const sessionPayload = await buildSessionPayload(profile, {
              email: session.user.email,
              userId: session.user.id,
            });
            localStorage.setItem('sproutify_session', JSON.stringify(sessionPayload));
            console.log('[App] Session payload stored, setting authenticated=true');
            setIsAuthenticated(true);
            if (isMounted) {
              setIsLoading(false);
            }
          } else {
            // Profile not found or error - clear session
            console.log('[App] No profile found, clearing session');
            localStorage.removeItem('sproutify_session');
            setIsAuthenticated(false);
            if (isMounted) {
              setIsLoading(false);
            }
          }
        } else {
          console.log('[App] No session, clearing localStorage');
          localStorage.removeItem('sproutify_session');
          setIsAuthenticated(false);
          if (isMounted) {
            setIsLoading(false);
          }
        }

        // Check for auto-login via URL param (SSO from marketing site)
        const params = new URLSearchParams(window.location.search);
        const emailParam = params.get('email');

        if (emailParam && !session) {
          // Auto-login will be handled by LoginPage
          setIsAuthenticated(false);
        }
      } catch (err: any) {
        console.error('[App] Session check error:', err);
        if (err?.message === 'Session check timed out') {
          const clearedSupabaseKeys = clearSupabaseStorageKeys();
          clearSupabaseAuthStorage();
          localStorage.removeItem('sproutify_session');
          console.warn('[App] Session reset after timeout, cleared Supabase storage keys:', clearedSupabaseKeys);
          setIsAuthenticated(false);
          if (isMounted) {
            setIsLoading(false);
          }
          window.location.assign('/login');
          return;
        }
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    console.log('[App] useEffect running, calling checkSession');
    if (hasCheckedSession.current) {
      console.log('[App] checkSession already executed, skipping duplicate run');
    } else {
      hasCheckedSession.current = true;
      checkSession();
    }

    // Listen for auth state changes
    const { data: { subscription } } = getSupabaseClient().auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem('sproutify_session');
        setIsAuthenticated(false);
      } else if (event === 'SIGNED_IN' && session) {
        // Skip for admin users
        if (session.user.email?.toLowerCase() === 'team@sproutify.app') {
          return;
        }

        // Build session payload BEFORE setting authenticated
        // This prevents the race condition where Dashboard loads before session is ready
        const { data: profile, error: profileError } = await getSupabaseClient()
          .from('profile')
          .select('*, farms(*)')
          .eq('id', session.user.id)
          .single();

        if (profile && !profileError) {
          const sessionPayload = await buildSessionPayload(profile, {
            email: session.user.email,
            userId: session.user.id,
          });
          localStorage.setItem('sproutify_session', JSON.stringify(sessionPayload));
          setIsAuthenticated(true);
        }
      }
    });

    return () => {
      isMounted = false;
      hasCheckedSession.current = false;
      subscription.unsubscribe();
      activeTimeouts.forEach((id) => clearTimeout(id));
      activeTimeouts.clear();
    };
  }, []);

  // Update document title based on authentication state
  useEffect(() => {
    if (isAuthenticated) {
      document.title = 'Sproutify Micro';
    } else {
      document.title = 'Login - Sproutify Micro';
    }
  }, [isAuthenticated]);

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <Router basename="/admin">
      <Routes>
        {/* Admin Portal Routes */}
          <Route path="/admin-portal/login" element={<AdminLogin />} />
        <Route path="/admin-portal/reset-password" element={<PasswordResetPage />} />
        <Route path="/admin-portal/signup" element={<BetaSignupPage />} />
        
        <Route path="/admin-portal" element={
          <RequireAdmin>
            <AdminLayout onLogout={async () => {
              clearSupabaseAuthStorage();
              if (getSupabaseClient()) await getSupabaseClient().auth.signOut();
              localStorage.removeItem('sproutify_admin_session');
            }} />
          </RequireAdmin>
        }>
          <Route index element={<AdminDashboard />} />
          <Route path="farms-users" element={<AdminFarmsUsers />} />
          <Route path="recipes-varieties" element={<AdminRecipesVarieties />} />
          <Route path="trays-batches" element={<AdminTraysBatches />} />
          <Route path="customers-orders" element={<AdminCustomersOrders />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="notifications" element={<AdminNotifications />} />
          <Route path="email-broadcast" element={<AdminEmailBroadcast />} />
          <Route path="email-events" element={<AdminEmailEvents />} />
        </Route>

        {/* Regular User Routes */}
        <Route path="/login" element={
          isAuthenticated ? <Navigate to="/" /> : <LoginPage onLogin={() => setIsAuthenticated(true)} />
        } />

        <Route path="/" element={
          isAuthenticated ? <Layout onLogout={async () => {
            clearSupabaseAuthStorage();
            if (getSupabaseClient()) await getSupabaseClient().auth.signOut();
            localStorage.removeItem('sproutify_session');
            setIsAuthenticated(false);
          }} /> : <Navigate to="/login" />
        }>
          <Route index element={<Dashboard />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="varieties" element={<VarietiesPage />} />
          <Route path="recipes" element={<RecipesPage />} />
          <Route path="recipes/builder" element={<RecipeBuilderPage />} />
          <Route path="global-recipes" element={<GlobalRecipesPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="mix-calculator" element={<MixCalculatorPage />} />
          <Route path="batches" element={<BatchesPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="standing-orders" element={<StandingOrdersPage />} />
          <Route path="planting-schedule" element={<PlantingSchedulePage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="weekly-tasks" element={<WeeklyTasksPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="vendors" element={<VendorsPage />} />
          <Route path="supplies" element={<SuppliesPage />} />
          <Route path="trays" element={<TraysPage />} />
          <Route path="trays/:trayId" element={<TraysPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="flow" element={<DailyFlow />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="activity" element={<Activity />} />
          <Route path="help" element={<HelpCenterPage />} />
          <Route path="help/:category" element={<HelpCenterPage />} />
          <Route path="help/:category/:slug" element={<HelpCenterPage />} />
        </Route>
      </Routes>
      {isAuthenticated && <SageChat />}
    </Router>
  );
}

export default App;
