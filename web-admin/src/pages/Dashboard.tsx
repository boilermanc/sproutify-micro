import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { runNotificationChecks } from '../services/notificationService';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { 
  Sprout, 
  Scissors, 
  Package, 
  Users, 
  ClipboardList, 
  ShoppingBasket, 
  RefreshCcw,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { useOnboarding } from '../hooks/useOnboarding';
import WelcomeModal from '../components/onboarding/WelcomeModal';
import OnboardingWizard from '../components/onboarding/OnboardingWizard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// --- Custom Icon Component for that "Material" feel ---
const DashboardIcon = ({ icon: Icon, colorClass, bgClass }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>, colorClass: string, bgClass: string }) => (
  <div className={`p-3 rounded-xl ${bgClass} shadow-sm transition-all duration-300 group-hover:scale-110`}>
    <Icon className={`h-6 w-6 ${colorClass}`} strokeWidth={2.5} />
  </div>
);

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, startWizard, completeOnboarding } = useOnboarding();
  
  // UI State
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Data State
  const [farmInfo, setFarmInfo] = useState({ farmName: '', farmUuid: '' });
  const [trialEndDate, setTrialEndDate] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalTrays: 0,
    activeTrays: 0,
    totalVarieties: 0,
    totalOrders: 0,
    recentHarvests: 0,
    upcomingHarvests: 0,
    totalProducts: 0,
    standingOrders: 0,
    weeklyTasks: 0,
  });

  // Chart Data
  const [harvestData, setHarvestData] = useState<Array<{ name: string; yield: number }>>([]);
  const [varietyData, setVarietyData] = useState<Array<{ name: string; value: number }>>([]);

  // Vibrant Material-like colors
  const PIE_COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6'];

  // --- Data Fetching Logic ---
  const fetchDashboardData = useCallback(async (showLoadingState = false) => {
    if (showLoadingState) setIsLoading(true);
    
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) {
        setIsLoading(false);
        return;
      }

      const { farmUuid, farmName } = JSON.parse(sessionData);
      if (!farmUuid) return;

      // 1. Basic Farm Info
      const { data: farmRecord } = await supabase
        .from('farms')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .single();

      setFarmInfo({ 
        farmName: farmRecord?.farm_name || farmName || 'My Farm', 
        farmUuid 
      });
      if (farmRecord?.trial_end_date) setTrialEndDate(farmRecord.trial_end_date);

      // 2. Parallel Data Fetching (Much Faster)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const today = new Date();
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const [
        traysTotal,
        traysActive,
        varietiesCount,
        recentHarvestsCount,
        upcomingHarvestsCount,
        productsCount,
        standingOrdersCount,
        ordersCount,
        tasksCount
      ] = await Promise.all([
        // Total Trays
        supabase.from('trays').select('*', { count: 'exact', head: true }).eq('farm_uuid', farmUuid),
        // Active Trays
        supabase.from('trays').select('*', { count: 'exact', head: true }).eq('farm_uuid', farmUuid).is('harvest_date', null),
        // Varieties
        supabase.from('varieties_view').select('*', { count: 'exact', head: true }).eq('farm_uuid', farmUuid).then(r => r, () => ({ count: 0, error: null })),
        // Recent Harvests
        supabase.from('trays').select('*', { count: 'exact', head: true }).eq('farm_uuid', farmUuid).not('harvest_date', 'is', null).gte('harvest_date', sevenDaysAgo.toISOString()),
        // Upcoming Harvests
        supabase.from('trays').select('*', { count: 'exact', head: true }).eq('farm_uuid', farmUuid).is('harvest_date', null).gte('sow_date', today.toISOString()).lte('sow_date', nextWeek.toISOString()),
        // Products
        supabase.from('products').select('*', { count: 'exact', head: true }).eq('farm_uuid', farmUuid).eq('is_active', true).then(r => r, () => ({ count: 0, error: null })),
        // Standing Orders
        supabase.from('standing_orders').select('*', { count: 'exact', head: true }).eq('farm_uuid', farmUuid).eq('is_active', true).then(r => r, () => ({ count: 0, error: null })),
        // Orders
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('farm_uuid', farmUuid).then(r => r, () => ({ count: 0, error: null })),
        // Tasks (Pending this week)
        supabase.from('weekly_tasks').select('*', { count: 'exact', head: true }).eq('farm_uuid', farmUuid).eq('status', 'pending').then(r => r, () => ({ count: 0, error: null }))
      ]);

      setStats({
        totalTrays: traysTotal.count || 0,
        activeTrays: traysActive.count || 0,
        totalVarieties: varietiesCount.count || 0,
        totalOrders: ordersCount.count || 0,
        recentHarvests: recentHarvestsCount.count || 0,
        upcomingHarvests: upcomingHarvestsCount.count || 0,
        totalProducts: productsCount.count || 0,
        standingOrders: standingOrdersCount.count || 0,
        weeklyTasks: tasksCount.count || 0,
      });

      // 3. Process Chart Data
      // Harvest Chart
      const { data: harvestRaw } = await supabase
        .from('trays')
        .select('harvest_date, yield')
        .eq('farm_uuid', farmUuid)
        .not('harvest_date', 'is', null)
        .gte('harvest_date', sevenDaysAgo.toISOString())
        .order('harvest_date', { ascending: true });

      if (harvestRaw) {
        const dailyYields: Record<string, number> = {};
        harvestRaw.forEach(t => {
          const d = new Date(t.harvest_date).toLocaleDateString('en-US', { weekday: 'short' });
          dailyYields[d] = (dailyYields[d] || 0) + Number(t.yield || 0);
        });
        setHarvestData(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
          name: day, yield: dailyYields[day] || 0
        })));
      }

      // Variety Distribution
      const { data: varietyRaw } = await supabase
        .from('trays')
        .select(`recipes!inner(varieties!inner(name))`)
        .eq('farm_uuid', farmUuid)
        .is('harvest_date', null);

      if (varietyRaw) {
        const vCounts: Record<string, number> = {};
        varietyRaw.forEach((item: unknown) => {
          const itemTyped = item as { recipes?: { varieties?: { name?: string } | { name?: string }[] } };
          const varieties = itemTyped.recipes?.varieties;
          const name = Array.isArray(varieties) 
            ? (varieties[0]?.name || 'Unknown')
            : ((varieties as { name?: string })?.name || 'Unknown');
          if (name) {
            vCounts[name] = (vCounts[name] || 0) + 1;
          }
        });
        setVarietyData(Object.entries(vCounts)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5));
      }

    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // --- Effects ---

  // 1. Initial Load & Onboarding Check
  useEffect(() => {
    runNotificationChecks();
    fetchDashboardData(true);

    const sessionData = localStorage.getItem('sproutify_session');
    if (sessionData) {
      if (!state.onboarding_completed && !state.wizard_started) setShowWelcomeModal(true);
      else if (state.wizard_started && !state.onboarding_completed) setShowWizard(true);
    }
  }, [state.onboarding_completed, state.wizard_started, fetchDashboardData]);

  // 2. Refetch on Focus or Route Change (Fixes the "Refresh Issue")
  useEffect(() => {
    if (location.pathname === '/') {
      fetchDashboardData(false); // Silent update on nav
    }
    
    const handleFocus = () => {
      if (location.pathname === '/') {
        fetchDashboardData(false);
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [location.pathname, fetchDashboardData]);

  // --- Handlers ---
  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchDashboardData(false);
  };

  const friendlyGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="p-6 space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      {/* Onboarding Modals */}
      {showWelcomeModal && (
        <WelcomeModal 
          farmName={farmInfo.farmName} 
          onStart={() => { setShowWelcomeModal(false); startWizard(); setShowWizard(true); }} 
          onSkip={() => { setShowWelcomeModal(false); completeOnboarding(); }} 
        />
      )}
      {showWizard && (
        <OnboardingWizard onComplete={() => { setShowWizard(false); completeOnboarding(); }} onClose={() => setShowWizard(false)} />
      )}

      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-gray-100 pb-6">
        <div className="flex items-center gap-5">
          <div className="h-16 w-16 bg-gradient-to-br from-emerald-100 to-green-200 rounded-2xl flex items-center justify-center text-3xl shadow-sm border border-emerald-100">
            🌱
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-bold text-emerald-600 uppercase tracking-wider bg-emerald-50 px-2 py-0.5 rounded-md">
                {friendlyGreeting()}
              </span>
              {isRefreshing && <span className="text-xs text-gray-400 animate-pulse">Syncing...</span>}
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">{farmInfo.farmName}</h1>
            <p className="text-gray-500 font-medium mt-1">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {trialEndDate && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 px-3 py-1">
              Trial ends {new Date(trialEndDate).toLocaleDateString()}
            </Badge>
          )}
          <Button 
            variant="outline" 
            size="icon"
            onClick={handleManualRefresh}
            className={`rounded-full border-gray-200 hover:bg-gray-50 ${isRefreshing ? 'animate-spin' : ''}`}
            title="Refresh Data"
          >
            <RefreshCcw className="h-4 w-4 text-gray-600" />
          </Button>
        </div>
      </div>

      {/* Stats Grid - "Command Center" Style */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        <StatCard 
          title="Active Trays" 
          value={stats.activeTrays} 
          subtitle="Growing now" 
          icon={Sprout} 
          color="text-emerald-600" 
          bg="bg-emerald-100" 
        />
        <StatCard 
          title="Active Orders" 
          value={stats.totalOrders} 
          subtitle="To fulfill" 
          icon={ClipboardList} 
          color="text-blue-600" 
          bg="bg-blue-100" 
        />
        <StatCard 
          title="Harvest Soon" 
          value={stats.upcomingHarvests} 
          subtitle="Next 7 days" 
          icon={Scissors} 
          color="text-amber-600" 
          bg="bg-amber-100" 
        />
        <StatCard 
          title="Weekly Tasks" 
          value={stats.weeklyTasks} 
          subtitle="Pending" 
          icon={AlertCircle} 
          color="text-rose-600" 
          bg="bg-rose-100" 
        />
        <StatCard 
          title="Catalog" 
          value={stats.totalVarieties} 
          subtitle="Varieties" 
          icon={Package} 
          color="text-violet-600" 
          bg="bg-violet-100" 
        />
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Charts (2/3 width) */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Harvest Chart */}
          <Card className="border-none shadow-md bg-white rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-bold text-gray-800">Harvest Yield</CardTitle>
                  <CardDescription>Last 7 days output (oz)</CardDescription>
                </div>
                <TrendingUp className="h-5 w-5 text-gray-400" />
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={harvestData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 12}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 12}} />
                    <Tooltip 
                      cursor={{fill: '#f9fafb'}}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                    />
                    <Bar dataKey="yield" fill="#10B981" radius={[6, 6, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions Bar */}
          <Card className="border-none shadow-md bg-white rounded-2xl p-6">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <QuickActionBtn 
                label="New Tray" 
                icon={Sprout} 
                onClick={() => navigate('/trays')} 
                color="hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200" 
              />
              <QuickActionBtn 
                label="New Order" 
                icon={ShoppingBasket} 
                onClick={() => navigate('/orders')} 
                color="hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200" 
              />
              <QuickActionBtn 
                label="New Batch" 
                icon={Package} 
                onClick={() => navigate('/batches')} 
                color="hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200" 
              />
              <QuickActionBtn 
                label="Add User" 
                icon={Users} 
                onClick={() => navigate('/users')} 
                color="hover:bg-violet-50 hover:text-violet-700 hover:border-violet-200" 
              />
            </div>
          </Card>
        </div>

        {/* Right Column: Mix & Activity (1/3 width) */}
        <div className="space-y-8">
          
          {/* Variety Mix Pie */}
          <Card className="border-none shadow-md bg-white rounded-2xl">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-lg font-bold text-gray-800">Current Mix</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={varietyData.length > 0 ? varietyData : [{ name: 'No Data', value: 1 }]}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {(varietyData.length > 0 ? varietyData : [{ name: 'No Data', value: 1 }]).map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Activity Feed */}
          <Card className="border-none shadow-md bg-white rounded-2xl">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-lg font-bold text-gray-800">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-50">
                <ActivityItem 
                  text="Batch #104 Created" 
                  time="2h ago" 
                  icon={Package} 
                  bg="bg-amber-100" 
                  color="text-amber-600" 
                />
                <ActivityItem 
                  text="Harvested Sunflower" 
                  time="5h ago" 
                  icon={Scissors} 
                  bg="bg-emerald-100" 
                  color="text-emerald-600" 
                />
                <ActivityItem 
                  text="Order #492 Fulfilled" 
                  time="1d ago" 
                  icon={ClipboardList} 
                  bg="bg-blue-100" 
                  color="text-blue-600" 
                />
              </div>
              <Button variant="ghost" className="w-full text-xs text-gray-400 hover:text-gray-600 mt-2">
                View All Activity
              </Button>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
};

// --- Sub-components for Cleaner Code ---

interface StatCardProps {
  title: string;
  value: number;
  subtitle: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  color: string;
  bg: string;
}

const StatCard = ({ title, value, subtitle, icon, color, bg }: StatCardProps) => (
  <Card className="border-none shadow-sm hover:shadow-md transition-shadow duration-200 rounded-2xl overflow-hidden group">
    <CardContent className="p-5 flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
        <h3 className="text-2xl font-black text-gray-900 tracking-tight">{value}</h3>
        <p className="text-xs font-medium text-gray-400 mt-1">{subtitle}</p>
      </div>
      <DashboardIcon icon={icon} colorClass={color} bgClass={bg} />
    </CardContent>
  </Card>
);

interface QuickActionBtnProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  color: string;
}

const QuickActionBtn = ({ label, icon: Icon, onClick, color }: QuickActionBtnProps) => (
  <Button 
    variant="outline" 
    className={`h-auto py-6 flex flex-col gap-3 rounded-xl border-gray-100 transition-all duration-200 group ${color}`}
    onClick={onClick}
  >
    <Icon className="h-6 w-6 group-hover:scale-110 transition-transform duration-200" />
    <span className="font-semibold">{label}</span>
  </Button>
);

interface ActivityItemProps {
  text: string;
  time: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  bg: string;
  color: string;
}

const ActivityItem = ({ text, time, icon: Icon, bg, color }: ActivityItemProps) => (
  <div className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors">
    <div className={`p-2 rounded-full ${bg}`}>
      <Icon size={14} className={color} strokeWidth={3} />
    </div>
    <div className="flex-1">
      <p className="text-sm font-semibold text-gray-800">{text}</p>
      <p className="text-xs text-gray-400">{time}</p>
    </div>
  </div>
);

const DashboardSkeleton = () => (
  <div className="p-6 space-y-8 max-w-[1600px] mx-auto">
    <div className="flex justify-between items-center pb-6 border-b border-gray-100">
      <div className="flex gap-4">
        <Skeleton className="h-16 w-16 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-64" />
        </div>
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <Skeleton className="h-[400px] lg:col-span-2 rounded-2xl" />
      <Skeleton className="h-[400px] rounded-2xl" />
    </div>
  </div>
);

export default Dashboard;
