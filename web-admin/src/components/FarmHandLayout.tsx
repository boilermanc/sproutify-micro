import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  Calendar,
  Sprout,
  Scissors,
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import sproutifyIcon from '../assets/sproutify_micro_icon.png';

interface FarmHandLayoutProps {
  onLogout: () => void;
}

const FarmHandLayout = ({ onLogout }: FarmHandLayoutProps) => {
  const [farmName, setFarmName] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const sessionData = localStorage.getItem('sproutify_session');
    if (sessionData) {
      const { farmName: name } = JSON.parse(sessionData);
      setFarmName(name || '');
    }
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('sproutify_session');
    onLogout();
  };

  const navItems = [
    { to: "/tasks", icon: Calendar, label: "Tasks" },
    { to: "/seed", icon: Sprout, label: "Seed" },
    { to: "/harvest", icon: Scissors, label: "Harvest" },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between h-16 px-4 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <img src={sproutifyIcon} alt="Sproutify" className="h-8 w-8 rounded-lg object-cover" />
          {farmName && (
            <span className="text-lg font-semibold text-slate-800 truncate max-w-[200px]">
              {farmName}
            </span>
          )}
        </div>

        {/* Desktop logout */}
        <Button
          variant="ghost"
          size="sm"
          className="hidden md:flex items-center gap-2 text-slate-600 hover:text-red-600 hover:bg-red-50"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          <span>Logout</span>
        </Button>

        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden text-slate-600"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </header>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-16 right-0 left-0 z-30 bg-white border-b border-slate-200 shadow-lg">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 px-4 py-3 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-none"
            onClick={handleLogout}
          >
            <LogOut className="h-5 w-5" />
            <span>Logout</span>
          </Button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-20 md:pb-4">
        <Outlet />
      </main>

      {/* Bottom Navigation - Mobile & Desktop */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-lg md:static md:border-t-0 md:shadow-none">
        <div className="flex items-center justify-around h-16 max-w-md mx-auto md:max-w-none md:justify-center md:gap-2 md:px-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-lg transition-all duration-200 min-w-[72px] md:flex-row md:gap-2 md:px-6",
                  isActive
                    ? "text-emerald-600 bg-emerald-50"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                )
              }
            >
              <item.icon className="h-5 w-5" />
              <span className="text-xs font-medium md:text-sm">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default FarmHandLayout;
