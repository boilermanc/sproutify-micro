import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import { buildSessionPayload } from './utils/session';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import UsersPage from './pages/UsersPage';
import VarietiesPage from './pages/VarietiesPage';
import RecipesPage from './pages/RecipesPage';
import GlobalRecipesPage from './pages/GlobalRecipesPage';
import ProductsPage from './pages/ProductsPage';
import MixCalculatorPage from './pages/MixCalculatorPage';
import BatchesPage from './pages/BatchesPage';
import OrdersPage from './pages/OrdersPage';
import StandingOrdersPage from './pages/StandingOrdersPage';
import PlantingSchedulePage from './pages/PlantingSchedulePage';
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
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        // Check for Supabase session
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (session && !error) {
          // Verify session is still valid and get user profile
          const { data: profile } = await supabase
            .from('profile')
            .select('*, farms(*)')
            .eq('id', session.user.id)
            .single();

          if (profile) {
            const sessionPayload = await buildSessionPayload(profile, {
              email: session.user.email,
              userId: session.user.id,
            });
            localStorage.setItem('sproutify_session', JSON.stringify(sessionPayload));
            setIsAuthenticated(true);
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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
        <Route path="/login" element={
          isAuthenticated ? <Navigate to="/" /> : <LoginPage onLogin={() => setIsAuthenticated(true)} />
        } />

        <Route path="/" element={
          isAuthenticated ? <Layout onLogout={async () => {
            await supabase.auth.signOut();
            localStorage.removeItem('sproutify_session');
            setIsAuthenticated(false);
          }} /> : <Navigate to="/login" />
        }>
          <Route index element={<Dashboard />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="varieties" element={<VarietiesPage />} />
          <Route path="recipes" element={<RecipesPage />} />
          <Route path="global-recipes" element={<GlobalRecipesPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="mix-calculator" element={<MixCalculatorPage />} />
          <Route path="batches" element={<BatchesPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="standing-orders" element={<StandingOrdersPage />} />
          <Route path="planting-schedule" element={<PlantingSchedulePage />} />
          <Route path="weekly-tasks" element={<WeeklyTasksPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="vendors" element={<VendorsPage />} />
          <Route path="supplies" element={<SuppliesPage />} />
          <Route path="trays" element={<TraysPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="flow" element={<DailyFlow />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      {isAuthenticated && <SageChat />}
    </Router>
  );
}

export default App;
