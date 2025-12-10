import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Sprout,
  Package,
  ShoppingBasket,
  FileText,
  Building2,
  LogOut,
  Menu,
  X,
  Bell,
  Mail
} from 'lucide-react';

interface AdminLayoutProps {
  onLogout: () => void;
}

const AdminLayout = ({ onLogout }: AdminLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('sproutify_admin_session');
    onLogout();
    navigate('/admin-portal/login');
  };

  const navItems = [
    { to: "/admin-portal", icon: LayoutDashboard, label: "Overview", end: true },
    { to: "/admin-portal/farms-users", icon: Users, label: "Farms & Users" },
    { to: "/admin-portal/recipes-varieties", icon: Sprout, label: "Recipes & Varieties" },
    { to: "/admin-portal/trays-batches", icon: Package, label: "Trays & Batches" },
    { to: "/admin-portal/customers-orders", icon: ShoppingBasket, label: "Customers & Orders" },
    { to: "/admin-portal/products", icon: FileText, label: "Products" },
    { to: "/admin-portal/notifications", icon: Bell, label: "Notifications" },
    { to: "/admin-portal/email-broadcast", icon: Mail, label: "Email Broadcast" },
    { to: "/admin-portal/email-events", icon: Mail, label: "Email Events" },
  ];

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Mobile overlay */}
      <div 
        className={cn(
          "fixed inset-0 z-20 bg-black/50 transition-opacity md:hidden",
          sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex flex-col bg-slate-900 text-slate-100 transition-all duration-300 ease-in-out md:translate-x-0 md:static shadow-xl",
          sidebarOpen ? "translate-x-0 w-64" : "-translate-x-full md:translate-x-0 md:w-20"
        )}
      >
        <div className="flex h-16 items-center justify-between px-4 border-b border-slate-800">
          <div className={cn("flex items-center gap-2 overflow-hidden", !sidebarOpen && "md:justify-center md:w-full")}>
            <div className="h-8 w-8 min-w-8 rounded-lg bg-purple-600 flex items-center justify-center text-white font-bold text-lg">
              SA
            </div>
            <span className={cn("font-bold text-lg whitespace-nowrap transition-all duration-300", 
              !sidebarOpen && "md:hidden"
            )}>
              Admin Portal
            </span>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-slate-400 hover:text-white md:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group",
                  isActive 
                    ? "bg-purple-600/20 text-purple-400 shadow-sm" 
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-100",
                  !sidebarOpen && "md:justify-center md:px-2"
                )
              }
              title={!sidebarOpen ? item.label : undefined}
            >
              <item.icon className={cn("h-5 w-5 min-w-5", !sidebarOpen && "md:h-6 md:w-6")} />
              <span className={cn("font-medium whitespace-nowrap transition-all duration-300", 
                !sidebarOpen && "md:hidden"
              )}>
                {item.label}
              </span>
              
              {/* Tooltip for collapsed state */}
              {!sidebarOpen && (
                <div className="absolute left-16 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-50 hidden md:block border border-slate-700 shadow-lg">
                  {item.label}
                </div>
              )}
            </NavLink>
          ))}
        </div>

        <div className="p-4 border-t border-slate-800">
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start gap-3 text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition-colors",
              !sidebarOpen && "md:justify-center md:px-0"
            )}
            onClick={handleLogout}
            title={!sidebarOpen ? "Logout" : undefined}
          >
            <LogOut className="h-5 w-5 min-w-5" />
            <span className={cn("transition-all duration-300", !sidebarOpen && "md:hidden")}>
              Sign Out
            </span>
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200">
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-6 w-6 text-slate-700" />
            </Button>
            <div className="ml-4 md:ml-0">
              <h1 className="text-lg font-semibold text-slate-900">Sproutify Admin Portal</h1>
              <p className="text-sm text-slate-500">Micro Greens Farm Management</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;

