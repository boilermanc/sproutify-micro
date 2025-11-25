import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import UsersPage from './pages/UsersPage';
import VarietiesPage from './pages/VarietiesPage';
import RecipesPage from './pages/RecipesPage';
import BatchesPage from './pages/BatchesPage';
import OrdersPage from './pages/OrdersPage';
import CustomersPage from './pages/CustomersPage';
import VendorsPage from './pages/VendorsPage';
import SuppliesPage from './pages/SuppliesPage';
import TraysPage from './pages/TraysPage';
import SettingsPage from './pages/SettingsPage';
import Layout from './components/Layout';
import SageChat from './components/SageChat';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const session = localStorage.getItem('sproutify_session');
    
    // Check for auto-login via URL param (SSO from marketing site)
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get('email');

    if (session) {
      setIsAuthenticated(true);
    } else if (emailParam) {
      // Perform auto-login
      localStorage.setItem('sproutify_session', JSON.stringify({
        email: emailParam,
        farmUuid: 'demo-farm-uuid',
        role: 'owner'
      }));
      setIsAuthenticated(true);
      // Clean up URL to remove sensitive data and allow clean navigation
      window.history.replaceState({}, '', '/');
    }
    
    setIsLoading(false);
  }, []);

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <Router>
      <Routes>
        <Route path="/login" element={
          isAuthenticated ? <Navigate to="/" /> : <LoginPage onLogin={() => setIsAuthenticated(true)} />
        } />

        <Route path="/" element={
          isAuthenticated ? <Layout onLogout={() => setIsAuthenticated(false)} /> : <Navigate to="/login" />
        }>
          <Route index element={<Dashboard />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="varieties" element={<VarietiesPage />} />
          <Route path="recipes" element={<RecipesPage />} />
          <Route path="batches" element={<BatchesPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="vendors" element={<VendorsPage />} />
          <Route path="supplies" element={<SuppliesPage />} />
          <Route path="trays" element={<TraysPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      {isAuthenticated && <SageChat />}
    </Router>
  );
}

export default App;
