import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { LogOut, ChevronLeft, ChevronRight, Menu, Smartphone } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import NotificationBell from "./NotificationBell";
import TrialBanner from "./onboarding/TrialBanner";
import SubscriptionBlockedModal from "./SubscriptionBlockedModal";
import { useSubscription } from "@/hooks/useSubscription";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useDemoAccess } from '@/hooks/useDemoAccess';
import FarmBrand from './FarmBrand';
import { workspaceNavigation } from '@/lib/workspaceNavigation';
import './WorkspaceShell.css';

interface LayoutProps {
  onLogout: () => void;
}

const Layout = ({ onLogout }: LayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [farmName, setFarmName] = useState('');
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const isTestAccount = useDemoAccess();
  const location = useLocation();
  const { subscription, isLoading: subscriptionLoading, getTrialDaysRemaining } = useSubscription();
  const { isMobile, prefersDesktopView, setDesktopViewPreference } = useIsMobile();

  // Handler to switch back to mobile view
  const handleSwitchToMobile = () => {
    setDesktopViewPreference(false);
    // Navigate to mobile route and reload to apply layout change
    window.location.href = '/admin/tasks';
  };

  useEffect(() => {
    const sessionData = localStorage.getItem('sproutify_session');
    if (sessionData) {
      const { farmName: name } = JSON.parse(sessionData);
      setFarmName(name || '');
    }
  }, []);

  // Determine if user should be blocked
  const shouldShowBlockedModal = (): boolean => {
    if (subscriptionLoading) return false;
    if (isTestAccount) return false;

    // Don't block on pricing page - user needs to see plans to subscribe
    if (location.pathname === '/pricing') return false;

    const status = subscription.status;

    // Block if expired or cancelled
    if (status === 'expired' || status === 'cancelled') {
      return true;
    }

    // Block if trial has ended (trial with 0 or negative days remaining)
    if (status === 'trial') {
      const daysRemaining = getTrialDaysRemaining();
      if (daysRemaining !== null && daysRemaining <= 0) {
        return true;
      }
    }

    return false;
  };

  const getBlockedStatus = (): 'expired' | 'cancelled' | 'trial_ended' => {
    if (subscription.status === 'cancelled') return 'cancelled';
    if (subscription.status === 'trial') return 'trial_ended';
    return 'expired';
  };

  const handleLogout = () => {
    localStorage.removeItem('sproutify_session');
    onLogout();
  };

  let role: string | undefined;
  try { role = JSON.parse(localStorage.getItem('sproutify_session') || '{}').role; } catch { /* App verifies the session. */ }
  const navItems = workspaceNavigation(role);

  return (
    <div className="farm-workspace workspace-shell workspace-desktop flex min-h-screen bg-background">
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
        data-collapsed={!sidebarOpen}
        className={cn(
          "workspace-sidebar fixed inset-y-0 left-0 z-30 flex flex-col bg-background text-foreground border-r border-border transition-all duration-200 ease-in-out md:translate-x-0 md:static",
          sidebarOpen ? "translate-x-0 w-64" : "-translate-x-full md:translate-x-0 md:w-20"
        )}
      >
        <div className="flex h-20 items-center justify-between px-5 border-b border-border">
          <div className={cn("flex items-center gap-2 overflow-hidden", !sidebarOpen && "md:justify-center md:w-full")}>
            <FarmBrand compact={!sidebarOpen} />
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-muted-foreground md:hidden"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </div>

        <nav aria-label="Primary workspace" className="workspace-primary-links flex-1 overflow-y-auto py-4 px-3 space-y-1 custom-scrollbar">
          {navItems.map((item, index) => (
            <NavLink
              key={`nav-${item.to}-${index}`}
              to={item.to}
              data-workspace-active={item.to === '/farm' && !['/today', '/growing', '/orders'].includes(location.pathname)}
              end
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors group",
                  (isActive || (item.to === '/farm' && !['/today', '/growing', '/orders'].includes(location.pathname)))
                    ? "bg-secondary text-primary"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
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
          
        </nav>

        <div className="p-4 border-t border-border">
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start gap-3 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors",
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
              className="text-muted-foreground w-full h-8 hover:bg-secondary"
              aria-label={sidebarOpen ? 'Collapse navigation' : 'Expand navigation'}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="workspace-content flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Header */}
        <div className="workspace-header flex min-h-20 items-center justify-between px-5 py-4 bg-background border-b border-border">
          <div className="flex min-w-0 items-center gap-4">
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-6 w-6 text-slate-700" />
            </Button>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Farm workspace</p>
              <p className="truncate text-sm font-medium text-foreground">{farmName || 'Sproutify Micro'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="workspace-mobile-actions">
              <NavLink to="/profile">Profile</NavLink>
              <button type="button" onClick={handleLogout}>Logout</button>
            </div>
            {/* Show "Switch to Mobile View" for users who overrode mobile detection */}
            {isMobile && prefersDesktopView && (
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                aria-label="Switch to mobile-optimized view"
                onClick={handleSwitchToMobile}
                title="Switch to mobile-optimized view"
              >
                <Smartphone className="h-4 w-4" />
                <span className="hidden lg:inline">Mobile View</span>
              </Button>
            )}
            <NotificationBell />
          </div>
        </div>

        {/* Subscription/Trial Banner */}
        {!subscriptionLoading && !bannerDismissed && (
          <TrialBanner
            trialEndDate={subscription.trialEndDate}
            subscriptionStatus={subscription.status}
            activeTrayCount={subscription.activeTrayCount}
            trayLimit={subscription.trayLimit}
            onDismiss={() => setBannerDismissed(true)}
          />
        )}

        <div className="workspace-scroll flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>

      <nav aria-label="Mobile workspace" className="workspace-bottom-nav">
        {navItems.map(item => <NavLink key={item.to} to={item.to} end data-workspace-active={item.to === '/farm' && !['/today', '/growing', '/orders'].includes(location.pathname)}>
          <item.icon size={20} aria-hidden="true" /><span>{item.label}</span>
        </NavLink>)}
      </nav>

      {/* Subscription Blocked Modal */}
      {shouldShowBlockedModal() && (
        <SubscriptionBlockedModal
          status={getBlockedStatus()}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
};

export default Layout;
