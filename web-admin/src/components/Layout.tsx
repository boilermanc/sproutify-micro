import { Outlet, NavLink } from 'react-router-dom';
import { useState } from 'react';
import './Layout.css';

interface LayoutProps {
  onLogout: () => void;
}

const Layout = ({ onLogout }: LayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = () => {
    localStorage.removeItem('sproutify_session');
    onLogout();
  };

  return (
    <div className="layout">
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <h1 className="logo">Sproutify Micro</h1>
          <button className="toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? '«' : '»'}
          </button>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
            <span className="icon">📊</span>
            {sidebarOpen && <span>Dashboard</span>}
          </NavLink>
          <NavLink to="/users" className={({ isActive }) => isActive ? 'active' : ''}>
            <span className="icon">👥</span>
            {sidebarOpen && <span>Users</span>}
          </NavLink>
          <NavLink to="/varieties" className={({ isActive }) => isActive ? 'active' : ''}>
            <span className="icon">🌱</span>
            {sidebarOpen && <span>Varieties</span>}
          </NavLink>
          <NavLink to="/recipes" className={({ isActive }) => isActive ? 'active' : ''}>
            <span className="icon">📋</span>
            {sidebarOpen && <span>Recipes</span>}
          </NavLink>
          <NavLink to="/batches" className={({ isActive }) => isActive ? 'active' : ''}>
            <span className="icon">📦</span>
            {sidebarOpen && <span>Batches</span>}
          </NavLink>
          <NavLink to="/trays" className={({ isActive }) => isActive ? 'active' : ''}>
            <span className="icon">🧺</span>
            {sidebarOpen && <span>Trays</span>}
          </NavLink>
          <NavLink to="/orders" className={({ isActive }) => isActive ? 'active' : ''}>
            <span className="icon">📝</span>
            {sidebarOpen && <span>Orders</span>}
          </NavLink>
          <NavLink to="/customers" className={({ isActive }) => isActive ? 'active' : ''}>
            <span className="icon">🏢</span>
            {sidebarOpen && <span>Customers</span>}
          </NavLink>
          <NavLink to="/vendors" className={({ isActive }) => isActive ? 'active' : ''}>
            <span className="icon">🚚</span>
            {sidebarOpen && <span>Vendors</span>}
          </NavLink>
          <NavLink to="/supplies" className={({ isActive }) => isActive ? 'active' : ''}>
            <span className="icon">📋</span>
            {sidebarOpen && <span>Supplies</span>}
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => isActive ? 'active' : ''}>
            <span className="icon">⚙️</span>
            {sidebarOpen && <span>Settings</span>}
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
            <span className="icon">🚪</span>
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
