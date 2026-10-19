import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  LogOut,
  Menu,
  X,
  Monitor,
  Leaf,
  Users,
  User,
  Tag
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsMobile } from '@/hooks/useIsMobile';
import FarmBrand from './FarmBrand';
import { canManageFarm, workspaceNavigation } from '@/lib/workspaceNavigation';
import { useSubscription } from '@/hooks/useSubscription';
import { useDemoAccess } from '@/hooks/useDemoAccess';
import TrialBanner from './onboarding/TrialBanner';
import SubscriptionBlockedModal from './SubscriptionBlockedModal';
import './WorkspaceShell.css';

interface FarmHandLayoutProps {
  onLogout: () => void;
  verifiedRole?: string | null;
}

function OwnerSubscriptionNotice({ onLogout }: { onLogout: () => void }) {
  const { subscription, isLoading, getTrialDaysRemaining } = useSubscription();
  const isDemo = useDemoAccess();
  const [dismissed, setDismissed] = useState(false);
  const location = useLocation();
  const days = getTrialDaysRemaining();
  const blocked = !isLoading && !isDemo && location.pathname !== '/pricing' && (
    subscription.status === 'expired' || subscription.status === 'cancelled' ||
    (subscription.status === 'trial' && days !== null && days <= 0)
  );
  const reason = subscription.status === 'cancelled' ? 'cancelled' : subscription.status === 'trial' ? 'trial_ended' : 'expired';
  return <>
    {!isLoading && !dismissed && <TrialBanner trialEndDate={subscription.trialEndDate} subscriptionStatus={subscription.status} activeTrayCount={subscription.activeTrayCount} trayLimit={subscription.trayLimit} onDismiss={() => setDismissed(true)}/>}
    {blocked && <SubscriptionBlockedModal status={reason} onLogout={onLogout}/>}
  </>;
}

const FarmHandLayout = ({ onLogout, verifiedRole }: FarmHandLayoutProps) => {
  const [farmName, setFarmName] = useState('');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { isMobile, setDesktopViewPreference } = useIsMobile();

  useEffect(() => {
    const sessionData = localStorage.getItem('sproutify_session');
    if (sessionData) {
      const { farmName: name, role } = JSON.parse(sessionData);
      setFarmName(name || '');
      setUserRole(role || null);
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

  const handleSwitchToDesktop = () => {
    setDesktopViewPreference(true);
    // Navigate to desktop route and reload to apply layout change
    window.location.href = '/admin/today';
  };

  // Only show "Switch to Desktop" for mobile users who aren't Farm Hands
  // Farm Hands always see simplified layout regardless of device
  const role = verifiedRole === undefined ? userRole : verifiedRole;
  const isFarmHand = /^farm ?hand$/i.test(role || '');
  const canSwitchToDesktop = isMobile && !!role && !isFarmHand;

  const navItems = workspaceNavigation(role);

  return (
    <div className="farm-workspace workspace-shell workspace-simplified flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="workspace-header sticky top-0 z-40 flex items-center justify-between h-16 px-4 bg-background border-b border-border">
        <div className="flex min-w-0 items-center gap-3">
          <FarmBrand compact />
          {farmName && (
            <span className="text-lg font-semibold text-slate-800 truncate max-w-[200px]">
              {farmName}
            </span>
          )}
        </div>

        {/* Desktop actions */}
        <div className="hidden md:flex items-center gap-2">
          <NavLink to="/profile" className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">Profile</NavLink>
          {canSwitchToDesktop && (
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100"
              onClick={handleSwitchToDesktop}
            >
              <Monitor className="h-4 w-4" />
              <span>Desktop View</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="flex items-center gap-2 text-slate-600 hover:text-red-600 hover:bg-red-50"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </Button>
        </div>

        {/* Mobile menu button */}
        <Button
          variant="ghost"
          className="md:hidden text-slate-600 h-12 w-12 p-0 min-w-[48px] min-h-[48px]"
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </header>

      {canManageFarm(role) && <OwnerSubscriptionNotice onLogout={handleLogout}/>}

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed top-16 right-0 left-0 z-30 bg-white border-b border-slate-200 shadow-lg">
          {/* Secondary Navigation */}
          <NavLink to="/profile" className="flex items-center gap-3 px-4 py-3 text-slate-600 hover:bg-slate-100 border-b border-slate-100">
            <User className="h-5 w-5" /><span>Profile</span>
          </NavLink>
          <NavLink
            to="/catalog"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-4 py-3 text-slate-600 hover:bg-slate-100 border-b border-slate-100",
                isActive && "text-emerald-600 bg-emerald-50"
              )
            }
          >
            <Leaf className="h-5 w-5" />
            <span>Crop Catalog</span>
          </NavLink>
          <NavLink
            to="/customers"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-4 py-3 text-slate-600 hover:bg-slate-100 border-b border-slate-100",
                isActive && "text-blue-600 bg-blue-50"
              )
            }
          >
            <Users className="h-5 w-5" />
            <span>Customers</span>
          </NavLink>
          <NavLink
            to="/labels"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-4 py-3 text-slate-600 hover:bg-slate-100 border-b border-slate-100",
                isActive && "text-purple-600 bg-purple-50"
              )
            }
          >
            <Tag className="h-5 w-5" />
            <span>Print Labels</span>
          </NavLink>

          {/* Actions */}
          {canSwitchToDesktop && (
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 px-4 py-3 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-none border-b border-slate-100"
              onClick={handleSwitchToDesktop}
            >
              <Monitor className="h-5 w-5" />
              <span>Switch to Desktop View</span>
            </Button>
          )}
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
      <main className="workspace-scroll flex-1 overflow-y-auto pb-20 md:pb-4">
        <Outlet />
      </main>

      {/* Bottom Navigation - Mobile & Desktop */}
      <nav aria-label="Primary workspace" className="workspace-simplified-nav fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border md:static md:border-t-0">
        <div className="workspace-nav-brand"><FarmBrand /></div>
        <div className="workspace-primary-links flex items-center justify-around h-16 max-w-lg mx-auto md:max-w-none md:justify-center md:gap-2 md:px-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              data-workspace-active={item.to === '/farm' && !['/today', '/growing', '/orders'].includes(location.pathname)}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-all duration-200 min-w-[72px] md:flex-row md:gap-2 md:px-6",
                  (isActive || (item.to === '/farm' && !['/today', '/growing', '/orders'].includes(location.pathname)))
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
