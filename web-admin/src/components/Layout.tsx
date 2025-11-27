import { Outlet, NavLink } from 'react-router-dom';
import { useState } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Sprout, 
  ClipboardList, 
  Package, 
  ShoppingBasket, 
  FileText, 
  Building2, 
  Truck, 
  Settings, 
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  Calendar,
  Box,
  Calculator,
  Repeat,
  CheckSquare,
  BarChart3
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import NotificationBell from "./NotificationBell";

interface LayoutProps {
  onLogout: () => void;
}

const Layout = ({ onLogout }: LayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = () => {
    localStorage.removeItem('sproutify_session');
    onLogout();
  };

  const navItems = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard", end: true },
    { to: "/flow", icon: Calendar, label: "Daily Flow" },
    { to: "/varieties", icon: Sprout, label: "Varieties" },
    { to: "/recipes", icon: ClipboardList, label: "Recipes" },
    { to: "/products", icon: Box, label: "Products" },
    { to: "/mix-calculator", icon: Calculator, label: "Mix Calculator" },
    { to: "/batches", icon: Package, label: "Batches" },
    { to: "/trays", icon: ShoppingBasket, label: "Trays" },
    { to: "/orders", icon: FileText, label: "Orders" },
    { to: "/standing-orders", icon: Repeat, label: "Standing Orders" },
    { to: "/weekly-tasks", icon: CheckSquare, label: "Weekly Tasks" },
    { to: "/customers", icon: Building2, label: "Customers" },
    { to: "/vendors", icon: Truck, label: "Vendors" },
    { to: "/supplies", icon: ClipboardList, label: "Supplies" },
    { to: "/reports", icon: BarChart3, label: "Reports" },
    { to: "/users", icon: Users, label: "Users" },
    { to: "/settings", icon: Settings, label: "Settings" },
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
            <div className="h-8 w-8 min-w-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold text-lg">
              S
            </div>
            <span className={cn("font-bold text-lg whitespace-nowrap transition-all duration-300", 
              !sidebarOpen && "md:hidden"
            )}>
              Sproutify
            </span>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-slate-400 hover:text-white md:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1 custom-scrollbar">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group",
                  isActive 
                    ? "bg-emerald-600/20 text-emerald-400 shadow-sm" 
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
              Logout
            </span>
          </Button>
          
          <div className="mt-4 flex justify-end md:justify-center hidden md:flex">
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-500 hover:text-slate-300 w-full h-6 hover:bg-slate-800"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
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
            <h1 className="ml-4 md:ml-0 text-lg font-bold text-slate-800">Sproutify Micro</h1>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
