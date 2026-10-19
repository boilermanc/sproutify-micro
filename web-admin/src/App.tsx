import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabaseClient } from './lib/supabaseClient';
import type { SproutifySession } from './utils/session';
import { clearSupabaseAuthStorage } from './utils/authStorage';
import { refreshSessionPayload } from './utils/sessionRefresh';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import TodayPage from './pages/TodayPage';
import GrowingPage from './pages/GrowingPage';
import FarmPage from './pages/FarmPage';
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
import LoadingState from './components/LoadingState';
import Layout from './components/Layout';
import FarmHandLayout from './components/FarmHandLayout';
import { FarmHandSeed, FarmHandHarvest, FarmHandCatalog, FarmHandCustomers, FarmHandLabels } from './components/farmhand';
import LocalFarmChat from './components/workspace/LocalFarmChat';
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
import AdminTestAccounts from './pages/AdminTestAccounts';
import BetaSignupPage from './pages/BetaSignupPage';
import PasswordResetPage from './pages/PasswordResetPage';
import VerifyResetCode from './pages/VerifyResetCode';
import { ToastProvider } from './components/ui/toast';
import { useIsMobile } from './hooks/useIsMobile';
import './App.css';

// Helper to check if user role is Farm Hand
const isFarmHandRole = (role: string | null | undefined): boolean => {
  if (!role) return false;
  return role.toLowerCase() === 'farm hand';
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const sessionRevision = useRef(0);
  const sessionMounted = useRef(true);
  const [isLoading, setIsLoading] = useState(true);
  // Session state is maintained to trigger re-renders when session data changes
  // Components access session data from localStorage, but this state ensures
  // the React component tree re-renders when session is refreshed
  const [session, setSession] = useState<SproutifySession | null>(null);

  // Mobile detection - mobile users get simplified FarmHandLayout regardless of role
  const { shouldUseMobileLayout } = useIsMobile();

  // Determine if user should see the simplified mobile/farm-hand layout
  // True if: mobile device (not overridden) OR Farm Hand role on any device
  const useSimplifiedLayout = shouldUseMobileLayout || isFarmHandRole(session?.role);

  const refreshFarmSession = useCallback(async () => {
    const request = ++sessionRevision.current;
    const refreshed = await refreshSessionPayload();
    if (!sessionMounted.current || request !== sessionRevision.current) return;
    if (refreshed) {
      localStorage.setItem('sproutify_session', JSON.stringify(refreshed));
      setSession(refreshed); setIsAuthenticated(true);
    } else {
      localStorage.removeItem('sproutify_session');
      setSession(null); setIsAuthenticated(false);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    sessionMounted.current = true;
    void refreshFarmSession();
    const { data: { subscription } } = getSupabaseClient().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        sessionRevision.current++;
        localStorage.removeItem('sproutify_session'); setSession(null); setIsAuthenticated(false); setIsLoading(false);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        sessionRevision.current++;
        // Supabase awaits this callback: defer work that needs its Auth lock.
        setTimeout(() => { if (sessionMounted.current) void refreshFarmSession(); }, 0);
      }
    });
    return () => { sessionMounted.current = false; sessionRevision.current++; subscription.unsubscribe(); };
  }, [refreshFarmSession]);

  // Update document title based on authentication state
  useEffect(() => {
    if (isAuthenticated) {
      document.title = 'Sproutify Micro';
    } else {
      document.title = 'Login - Sproutify Micro';
    }
  }, [isAuthenticated]);

  // Every refresh uses one epoch-checked commit, including focus and interval work.
  useEffect(() => {
    if (!isAuthenticated) return;
    const onFocus = () => { if (document.visibilityState === 'visible') void refreshFarmSession(); };
    document.addEventListener('visibilitychange', onFocus);
    const interval = setInterval(() => { void refreshFarmSession(); }, 15 * 60 * 1000);
    return () => { document.removeEventListener('visibilitychange', onFocus); clearInterval(interval); };
  }, [isAuthenticated, refreshFarmSession]);

  const signOutOfFarm = async () => {
    clearSupabaseAuthStorage();
    if (getSupabaseClient()) await getSupabaseClient().auth.signOut();
    localStorage.removeItem('sproutify_session');
    setSession(null);
    setIsAuthenticated(false);
  };
  const workspaceShell = useSimplifiedLayout
    ? <FarmHandLayout verifiedRole={session?.role} onLogout={signOutOfFarm} />
    : <Layout onLogout={signOutOfFarm} />;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <LoadingState compact message="Loading..." />
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
            <Route path="test-accounts" element={<AdminTestAccounts />} />
          </Route>

          {/* Regular User Routes */}
          <Route element={isAuthenticated ? workspaceShell : <Navigate to="/login" replace />}>
            <Route path="/today" element={<TodayPage />} />
            <Route path="/growing" element={<GrowingPage />} />
            <Route path="/farm" element={<FarmPage />} />
          </Route>
          <Route path="/login" element={
            isAuthenticated
              ? <Navigate to="/today" replace />
              : <LoginPage onLogin={(confirmed) => { sessionRevision.current++; setSession(confirmed); setIsAuthenticated(true); }} />
          } />

          {/* Checkout Success - standalone page without Layout */}
          <Route path="/checkout-success" element={
            isAuthenticated ? <CheckoutSuccessPage /> : <Navigate to="/login" />
          } />

          {/* Simplified Layout Routes - For mobile users and Farm Hands */}
          <Route path="/tasks" element={
            isAuthenticated && useSimplifiedLayout ? (
              <FarmHandLayout verifiedRole={session?.role} onLogout={async () => {
                clearSupabaseAuthStorage();
                if (getSupabaseClient()) await getSupabaseClient().auth.signOut();
                localStorage.removeItem('sproutify_session');
                setSession(null);
                setIsAuthenticated(false);
              }} />
            ) : isAuthenticated ? (
              <Navigate to="/today" replace />
            ) : (
              <Navigate to="/login" />
            )
          }>
            <Route index element={<Navigate to="/today" replace />} />
          </Route>

          <Route path="/seed" element={
            isAuthenticated && useSimplifiedLayout ? (
              <FarmHandLayout verifiedRole={session?.role} onLogout={async () => {
                clearSupabaseAuthStorage();
                if (getSupabaseClient()) await getSupabaseClient().auth.signOut();
                localStorage.removeItem('sproutify_session');
                setSession(null);
                setIsAuthenticated(false);
              }} />
            ) : isAuthenticated ? (
              <Navigate to="/trays" />
            ) : (
              <Navigate to="/login" />
            )
          }>
            <Route index element={<FarmHandSeed />} />
          </Route>

          <Route path="/harvest" element={
            isAuthenticated && useSimplifiedLayout ? (
              <FarmHandLayout verifiedRole={session?.role} onLogout={async () => {
                clearSupabaseAuthStorage();
                if (getSupabaseClient()) await getSupabaseClient().auth.signOut();
                localStorage.removeItem('sproutify_session');
                setSession(null);
                setIsAuthenticated(false);
              }} />
            ) : isAuthenticated ? (
              <Navigate to="/flow" />
            ) : (
              <Navigate to="/login" />
            )
          }>
            <Route index element={<FarmHandHarvest />} />
          </Route>

          <Route path="/profile" element={
            isAuthenticated && useSimplifiedLayout ? (
              <FarmHandLayout verifiedRole={session?.role} onLogout={async () => {
                clearSupabaseAuthStorage();
                if (getSupabaseClient()) await getSupabaseClient().auth.signOut();
                localStorage.removeItem('sproutify_session');
                setSession(null);
                setIsAuthenticated(false);
              }} />
            ) : <Navigate to={isAuthenticated ? '/settings' : '/login'} />
          }>
            <Route index element={<SettingsPage profileOnly />} />
          </Route>

          <Route path="/catalog" element={
            isAuthenticated && useSimplifiedLayout ? (
              <FarmHandLayout verifiedRole={session?.role} onLogout={async () => {
                clearSupabaseAuthStorage();
                if (getSupabaseClient()) await getSupabaseClient().auth.signOut();
                localStorage.removeItem('sproutify_session');
                setSession(null);
                setIsAuthenticated(false);
              }} />
            ) : isAuthenticated ? (
              <Navigate to="/recipes" />
            ) : (
              <Navigate to="/login" />
            )
          }>
            <Route index element={<FarmHandCatalog />} />
          </Route>

          <Route path="/customers" element={
            isAuthenticated && useSimplifiedLayout ? (
              <FarmHandLayout verifiedRole={session?.role} onLogout={async () => {
                clearSupabaseAuthStorage();
                if (getSupabaseClient()) await getSupabaseClient().auth.signOut();
                localStorage.removeItem('sproutify_session');
                setSession(null);
                setIsAuthenticated(false);
              }} />
            ) : isAuthenticated ? (
              <Layout onLogout={async () => {
                clearSupabaseAuthStorage();
                if (getSupabaseClient()) await getSupabaseClient().auth.signOut();
                localStorage.removeItem('sproutify_session');
                setSession(null);
                setIsAuthenticated(false);
              }} />
            ) : (
              <Navigate to="/login" />
            )
          }>
            <Route index element={isFarmHandRole(session?.role) ? <FarmHandCustomers /> : <CustomersPage />} />
          </Route>

          <Route path="/labels" element={
            isAuthenticated && useSimplifiedLayout ? (
              <FarmHandLayout verifiedRole={session?.role} onLogout={async () => {
                clearSupabaseAuthStorage();
                if (getSupabaseClient()) await getSupabaseClient().auth.signOut();
                localStorage.removeItem('sproutify_session');
                setSession(null);
                setIsAuthenticated(false);
              }} />
            ) : isAuthenticated ? (
              <Navigate to="/trays" />
            ) : (
              <Navigate to="/login" />
            )
          }>
            <Route index element={<FarmHandLabels />} />
          </Route>

          {/* Full Dashboard Routes - For desktop Owners/Farm Managers */}
          <Route path="/" element={
            isAuthenticated ? (
              isFarmHandRole(session?.role) ? (
                <Navigate to="/today" replace />
              ) : (
                workspaceShell
              )
            ) : (
              <Navigate to="/login" />
            )
          }>
            <Route index element={<Navigate to="/today" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
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
        {/* Sage AI Chat - Only for desktop Owners and Farm Managers */}
        {isAuthenticated && <LocalFarmChat key={`${session?.userId}:${session?.farmUuid}:${session?.role}`} />}
      </Router>
    </ToastProvider>
  );
}

export default App;
