import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getSupabaseClient } from './lib/supabaseClient';
import { buildSessionPayload } from './utils/session';
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
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      if (!getSupabaseClient()) return;
      try {
        // Check for getSupabaseClient() session
        const { data: { session }, error } = await getSupabaseClient().auth.getSession();
        
        if (session && !error) {
          // Skip profile check for admin users (team@sproutify.app)
          // Admin users are handled by RequireAdmin component
          if (session.user.email?.toLowerCase() === 'team@sproutify.app') {
            // Admin user - check if they have admin session
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
          } else {
            // Profile not found or error - clear session
            localStorage.removeItem('sproutify_session');
            setIsAuthenticated(false);
          }
        } else {
          localStorage.removeItem('sproutify_session');
          setIsAuthenticated(false);
        }

        // Check for auto-login via URL param (SSO from marketing site)
        const params = new URLSearchParams(window.location.search);
        const emailParam = params.get('email');

        if (emailParam && !session) {
          // Auto-login will be handled by LoginPage
          setIsAuthenticated(false);
        }
      } catch (err) {
        console.error('Session check error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();

    // Listen for auth state changes
    if (!getSupabaseClient()) return;
    const { data: { subscription } } = getSupabaseClient().auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem('sproutify_session');
        setIsAuthenticated(false);
      } else if (event === 'SIGNED_IN' && session) {
        setIsAuthenticated(true);
      }
    });

    return () => {
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

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <Router basename="/admin">
      <Routes>
        {/* Admin Portal Routes */}
        <Route path="/admin-portal/login" element={<AdminLogin />} />
        
        <Route path="/admin-portal" element={
          <RequireAdmin>
            <AdminLayout onLogout={async () => {
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
          <Route path="reports" element={<ReportsPage />} />
          <Route path="flow" element={<DailyFlow />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="activity" element={<Activity />} />
        </Route>
      </Routes>
      {isAuthenticated && <SageChat />}
    </Router>
  );
}

export default App;
