import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { AuthError, AuthApiError } from '@supabase/supabase-js';
import { getSupabaseClient } from './lib/supabaseClient';
import { buildSessionPayload } from './utils/session';
import type { SproutifySession } from './utils/session';
import { clearSupabaseAuthStorage } from './utils/authStorage';
import { refreshSessionPayload } from './utils/sessionRefresh';
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
import PricingPage from './pages/PricingPage';
import DailyFlow from './components/DailyFlow';
import GrowingMicrogreens from './components/GrowingMicrogreens';
import Layout from './components/Layout';
import SageChat from './components/SageChat';
import Activity from './pages/Activity';
import HelpCenterPage from './pages/HelpCenterPage';
import CheckoutSuccessPage from './pages/CheckoutSuccessPage';
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
import VerifyResetCode from './pages/VerifyResetCode';
import { ToastProvider } from './components/ui/toast';
import './App.css';

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
  // Session state is maintained to trigger re-renders when session data changes
  // Components access session data from localStorage, but this state ensures
  // the React component tree re-renders when session is refreshed
  const [session, setSession] = useState<SproutifySession | null>(null);
  const hasCheckedSession = useRef(false);

  // Acknowledge session state exists for future component consumption
  void session;

  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      console.log('[App] checkSession started');
      try {
        const client = getSupabaseClient();
        console.log('[App] Supabase client exists:', !!client);

        if (!client) {
          console.error('[App] No Supabase client!');
          setIsLoading(false);
          return;
        }

        console.log('[App] Calling getSupabaseClient().auth.getSession()...');
        const { data: { session }, error } = await client.auth.getSession();

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
          console.log('[App] User session found, fetching profile...');
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
            setSession(sessionPayload);
            console.log('[App] Session payload stored, setting authenticated=true');
            console.log('[App] Session payload farmUuid:', sessionPayload.farmUuid);
            setIsAuthenticated(true);
            if (isMounted) {
              setIsLoading(false);
            }
          } else {
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

        const params = new URLSearchParams(window.location.search);
        const emailParam = params.get('email');

        if (emailParam && !session) {
          setIsAuthenticated(false);
        }
      } catch (err) {
        console.error('[App] Session check error:', err);
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
        setSession(null);
        setIsAuthenticated(false);
      } else if (event === 'SIGNED_IN' && session) {
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
          setSession(sessionPayload);
          setIsAuthenticated(true);
        }
      }
    });

    return () => {
      isMounted = false;
      hasCheckedSession.current = false;
      subscription.unsubscribe();
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

  // Refresh session when tab becomes visible
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        console.log('[App] Tab focused - refreshing session...');
        const refreshedSession = await refreshSessionPayload();
        if (refreshedSession) {
          setSession(refreshedSession);
          console.log('[App] Session refreshed on tab focus');
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated]);

  // Periodic session refresh (every 15 minutes)
  useEffect(() => {
    if (!isAuthenticated) return;

    const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes
    
    console.log('[App] Starting periodic session refresh (every 15 minutes)');
    
    const intervalId = setInterval(async () => {
      console.log('[App] Periodic session refresh triggered');
      const refreshedSession = await refreshSessionPayload();
      if (refreshedSession) {
        setSession(refreshedSession);
        console.log('[App] Periodic session refresh completed');
      }
    }, REFRESH_INTERVAL);

    return () => {
      console.log('[App] Clearing periodic session refresh');
      clearInterval(intervalId);
    };
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <GrowingMicrogreens compact message="Loading..." />
      </div>
    );
  }

  return (
    <ToastProvider>
      <Router basename="/admin">
        <Routes>
          {/* Admin Portal Routes */}
            <Route path="/admin-portal/login" element={<AdminLogin />} />
          <Route path="/admin-portal/reset-password" element={<PasswordResetPage />} />
          <Route path="/admin-portal/verify-reset" element={<VerifyResetCode />} />
          <Route path="/admin-portal/signup" element={<BetaSignupPage />} />
          
          <Route path="/admin-portal" element={
            <RequireAdmin>
              <AdminLayout onLogout={async () => {
                clearSupabaseAuthStorage();
                if (getSupabaseClient()) await getSupabaseClient().auth.signOut();
                localStorage.removeItem('sproutify_admin_session');
                setSession(null);
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

          {/* Checkout Success - standalone page without Layout */}
          <Route path="/checkout-success" element={
            isAuthenticated ? <CheckoutSuccessPage /> : <Navigate to="/login" />
          } />

          <Route path="/" element={
            isAuthenticated ? <Layout onLogout={async () => {
              clearSupabaseAuthStorage();
              if (getSupabaseClient()) await getSupabaseClient().auth.signOut();
              localStorage.removeItem('sproutify_session');
              setSession(null);
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
            <Route path="pricing" element={<PricingPage />} />
            <Route path="activity" element={<Activity />} />
            <Route path="help" element={<HelpCenterPage />} />
            <Route path="help/:category" element={<HelpCenterPage />} />
            <Route path="help/:category/:slug" element={<HelpCenterPage />} />
          </Route>
        </Routes>
        {isAuthenticated && <SageChat />}
      </Router>
    </ToastProvider>
  );
}

export default App;
