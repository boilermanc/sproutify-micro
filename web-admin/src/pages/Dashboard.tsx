import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Sprout, Scissors, Package, User, ClipboardList, ShoppingBasket, X } from 'lucide-react';
import { useOnboarding } from '../hooks/useOnboarding';
import WelcomeModal from '../components/onboarding/WelcomeModal';
import OnboardingWizard from '../components/onboarding/OnboardingWizard';
import ProgressIndicator from '../components/onboarding/ProgressIndicator';
import TrialBanner from '../components/onboarding/TrialBanner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const Dashboard = () => {
  const navigate = useNavigate();
  const { state, startWizard, startWizardAtStep, completeOnboarding, dismissSetupSteps } = useOnboarding();
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
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

  const [farmInfo, setFarmInfo] = useState({
    farmName: '',
    farmUuid: '',
  });

  // Chart data (will be populated from Supabase)
  const [harvestData, setHarvestData] = useState([
    { name: 'Mon', yield: 0 },
    { name: 'Tue', yield: 0 },
    { name: 'Wed', yield: 0 },
    { name: 'Thu', yield: 0 },
    { name: 'Fri', yield: 0 },
    { name: 'Sat', yield: 0 },
    { name: 'Sun', yield: 0 },
  ]);

  const [varietyData, setVarietyData] = useState([
    { name: 'No Data', value: 1 },
  ]);

  const [salesByVariety, setSalesByVariety] = useState([
    { name: 'No Data', sales: 0 },
  ]);

  const [salesByCustomer, setSalesByCustomer] = useState([
    { name: 'No Data', sales: 0 },
  ]);

  const COLORS = ['#10b981', '#34d399', '#fbbf24', '#ef4444', '#6b7280'];

  useEffect(() => {
    // Check if onboarding should be shown
    const sessionData = localStorage.getItem('sproutify_session');
    if (sessionData) {
      const session = JSON.parse(sessionData);
      setTrialEndDate(session.trialEndDate || null);
      setFarmInfo((prev) => ({
        farmName: session.farmName || prev.farmName,
        farmUuid: session.farmUuid || prev.farmUuid,
      }));

      if (!state.onboarding_completed && !state.wizard_started) {
        setShowWelcomeModal(true);
      } else if (state.wizard_started && !state.onboarding_completed) {
        setShowWizard(true);
      }
    }
  }, [state.onboarding_completed, state.wizard_started]);

  useEffect(() => {
    // Run notification checks on mount
    runNotificationChecks();

    const fetchDashboardData = async () => {
      try {
        const sessionData = localStorage.getItem('sproutify_session');
        if (!sessionData) return;

        const { farmUuid, farmName } = JSON.parse(sessionData);

        const { data: farmRecord } = await supabase
          .from('farms')
          .select('*')
          .eq('farm_uuid', farmUuid)
          .single();

        const resolvedFarmName =
          farmRecord?.farm_name ??
          farmRecord?.farmname ??
          farmName ??
          'My Farm';
        setFarmInfo({ farmName: resolvedFarmName, farmUuid });

        if (farmRecord?.trial_end_date) {
          setTrialEndDate((prev) => prev ?? farmRecord.trial_end_date);
        }

        // Fetch trays count
        const { count: totalTrays } = await supabase
          .from('trays')
          .select('*', { count: 'exact', head: true })
          .eq('farm_uuid', farmUuid);

        // Fetch active trays (trays without harvest_date)
        const { count: activeTrays } = await supabase
          .from('trays')
          .select('*', { count: 'exact', head: true })
          .eq('farm_uuid', farmUuid)
          .is('harvest_date', null);

        // Fetch varieties count - match what VarietiesPage shows (filtered by farm_uuid)
        let totalVarieties = 0;
        try {
          // Try to use varieties_view (same as VarietiesPage)
          const { count: varietiesCount } = await supabase
            .from('varieties_view')
            .select('*', { count: 'exact', head: true })
            .eq('farm_uuid', farmUuid);
          totalVarieties = varietiesCount || 0;
        } catch (e) {
          // Fallback: if varieties_view doesn't exist, count all varieties
          // This matches the old behavior but may not be accurate
          const { count: varietiesCount } = await supabase
            .from('varieties')
            .select('*', { count: 'exact', head: true });
          totalVarieties = varietiesCount || 0;
        }

        // Fetch recent harvests (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const { count: recentHarvests } = await supabase
          .from('trays')
          .select('*', { count: 'exact', head: true })
          .eq('farm_uuid', farmUuid)
          .not('harvest_date', 'is', null)
          .gte('harvest_date', sevenDaysAgo.toISOString());

        // Fetch upcoming harvests (next 7 days)
        const today = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        const { count: upcomingHarvests } = await supabase
          .from('trays')
          .select('*', { count: 'exact', head: true })
          .eq('farm_uuid', farmUuid)
          .is('harvest_date', null)
          .gte('sow_date', today.toISOString())
          .lte('sow_date', nextWeek.toISOString());

        // Fetch products count
        let totalProducts = 0;
        try {
          const { count: productsCount } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true })
            .eq('farm_uuid', farmUuid)
            .eq('is_active', true);
          totalProducts = productsCount || 0;
        } catch (e) {
          // Products table might not exist yet
        }

        // Fetch standing orders count
        let standingOrders = 0;
        try {
          const { count: standingOrdersCount } = await supabase
            .from('standing_orders')
            .select('*', { count: 'exact', head: true })
            .eq('farm_uuid', farmUuid)
            .eq('is_active', true);
          standingOrders = standingOrdersCount || 0;
        } catch (e) {
          // Standing orders table might not exist yet
        }

        // Fetch weekly tasks count (pending tasks for this week)
        let weeklyTasks = 0;
        try {
          const weekStart = new Date();
          weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekEnd.getDate() + 6);

          const { count: tasksCount } = await supabase
            .from('weekly_tasks')
            .select('*', { count: 'exact', head: true })
            .eq('farm_uuid', farmUuid)
            .eq('status', 'pending')
            .gte('task_date', weekStart.toISOString().split('T')[0])
            .lte('task_date', weekEnd.toISOString().split('T')[0]);
          weeklyTasks = tasksCount || 0;
        } catch (e) {
          // Weekly tasks table might not exist yet
        }

        // Fetch orders count (from new orders table)
        let totalOrders = 0;
        try {
          const { count: ordersCount } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('farm_uuid', farmUuid);
          totalOrders = ordersCount || 0;
        } catch (e) {
          // Orders table might not exist yet, keep at 0
        }

        setStats({
          totalTrays: totalTrays || 0,
          activeTrays: activeTrays || 0,
          totalVarieties: totalVarieties || 0,
          totalOrders,
          recentHarvests: recentHarvests || 0,
          upcomingHarvests: upcomingHarvests || 0,
          totalProducts,
          standingOrders,
          weeklyTasks,
        });

        // Fetch harvest data for chart (last 7 days)
        const { data: harvestDataRaw } = await supabase
          .from('trays')
          .select('harvest_date, yield')
          .eq('farm_uuid', farmUuid)
          .not('harvest_date', 'is', null)
          .gte('harvest_date', sevenDaysAgo.toISOString())
          .order('harvest_date', { ascending: true });

        if (harvestDataRaw) {
          // Group by day and sum yields
          const dailyYields: { [key: string]: number } = {};
          harvestDataRaw.forEach(tray => {
            if (tray.harvest_date && tray.yield) {
              const date = new Date(tray.harvest_date).toLocaleDateString('en-US', { weekday: 'short' });
              dailyYields[date] = (dailyYields[date] || 0) + Number(tray.yield);
            }
          });

          // Convert to chart format
          const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
          const chartData = days.map(day => ({
            name: day,
            yield: dailyYields[day] || 0
          }));
          setHarvestData(chartData);
        }

        // Fetch variety distribution
        const { data: traysData } = await supabase
          .from('trays')
          .select(`
            recipe_id,
            recipes!inner(
              variety_id,
              varieties!inner(varietyid, name)
            )
          `)
          .eq('farm_uuid', farmUuid)
          .is('harvest_date', null);

        if (traysData) {
          const varietyCounts: { [key: string]: number } = {};
          traysData.forEach((tray: any) => {
            const variety = tray.recipes?.varieties?.name || tray.recipes?.variety_name || 'Unknown';
            varietyCounts[variety] = (varietyCounts[variety] || 0) + 1;
          });

          const varietyChartData = Object.entries(varietyCounts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
          setVarietyData(varietyChartData);
        }

        // Fetch sales by variety (from trays assigned to customers)
        const { data: salesTraysData } = await supabase
          .from('trays')
          .select(`
            yield,
            recipe_id,
            recipes!inner(
              variety_id,
              varieties!inner(varietyid, name)
            )
          `)
          .eq('farm_uuid', farmUuid)
          .not('customer_id', 'is', null)
          .not('yield', 'is', null);

        if (salesTraysData && salesTraysData.length > 0) {
          const varietySales: { [key: string]: number } = {};
          salesTraysData.forEach((tray: any) => {
            const variety = tray.recipes?.varieties?.name || tray.recipes?.variety_name || 'Unknown';
            const yieldValue = parseFloat(tray.yield || 0);
            const sales = yieldValue * 10; // $10 per unit yield (same as OrdersPage)
            varietySales[variety] = (varietySales[variety] || 0) + sales;
          });

          const varietySalesData = Object.entries(varietySales)
            .map(([name, sales]) => ({ name, sales: Math.round(sales * 100) / 100 }))
            .sort((a, b) => b.sales - a.sales)
            .slice(0, 10); // Top 10 varieties

          if (varietySalesData.length > 0) {
            setSalesByVariety(varietySalesData);
          }
        }

        // Fetch sales by customer
        const { data: customerTraysData } = await supabase
          .from('trays')
          .select('yield, customer_id')
          .eq('farm_uuid', farmUuid)
          .not('customer_id', 'is', null)
          .not('yield', 'is', null);

        if (customerTraysData && customerTraysData.length > 0) {
          // Fetch customer names separately (same pattern as OrdersPage)
          const customerIds = customerTraysData
            .map(tray => tray.customer_id)
            .filter(id => id !== null && id !== undefined);
          
          let customersMap: Record<number, string> = {};
          if (customerIds.length > 0) {
            const { data: customersData } = await supabase
              .from('customers')
              .select('customerid, name')
              .in('customerid', customerIds);
            
            customersMap = (customersData || []).reduce((acc, c) => {
              acc[c.customerid] = c.name || '';
              return acc;
            }, {} as Record<number, string>);
          }

          const customerSales: { [key: string]: number } = {};
          customerTraysData.forEach((tray: any) => {
            const customerName = customersMap[tray.customer_id] || 'Unknown Customer';
            const yieldValue = parseFloat(tray.yield || 0);
            const sales = yieldValue * 10; // $10 per unit yield
            customerSales[customerName] = (customerSales[customerName] || 0) + sales;
          });

          const customerSalesData = Object.entries(customerSales)
            .map(([name, sales]) => ({ name, sales: Math.round(sales * 100) / 100 }))
            .sort((a, b) => b.sales - a.sales)
            .slice(0, 10); // Top 10 customers

          if (customerSalesData.length > 0) {
            setSalesByCustomer(customerSalesData);
          }
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      }
    };

    fetchDashboardData();
  }, []);

  const handleWelcomeStart = () => {
    setShowWelcomeModal(false);
    startWizard();
    setShowWizard(true);
  };

  const handleWelcomeSkip = () => {
    setShowWelcomeModal(false);
    completeOnboarding();
  };

  const handleWizardComplete = () => {
    setShowWizard(false);
    completeOnboarding();
  };

  const handleWizardClose = () => {
    setShowWizard(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const friendlyGreeting = getGreeting();
  const todaySummary = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  const trialEndLabel = trialEndDate
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
        new Date(trialEndDate)
      )
    : null;
  const shouldShowTrialBanner = false;

  return (
    <div className="p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {showWelcomeModal && (
        <WelcomeModal
          farmName={farmInfo.farmName}
          onStart={handleWelcomeStart}
          onSkip={handleWelcomeSkip}
        />
      )}
      
      {showWizard && (
        <OnboardingWizard
          onComplete={handleWizardComplete}
          onClose={handleWizardClose}
        />
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-xl border border-green-100">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 bg-white rounded-xl flex items-center justify-center text-4xl shadow-sm border border-green-100">
            🌱
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-600 uppercase tracking-wider mb-1">{friendlyGreeting}</p>
            <h1 className="text-3xl font-bold text-gray-900">{farmInfo.farmName || 'Your Farm'}</h1>
            <p className="text-gray-600 mt-1">It's {todaySummary}. Everything is synced and ready.</p>
          </div>
        </div>
        {trialEndLabel && (
          <Badge variant="outline" className="bg-white/50 text-emerald-700 border-emerald-200 px-4 py-1 text-sm">
            Trial ends {trialEndLabel}
          </Badge>
        )}
      </div>

      {/* Setup Progress Section */}
      {!state.setup_steps_dismissed && (
        <Card className="mb-8 border-l-4 border-l-blue-500 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <CardTitle className="text-lg font-semibold text-gray-800">Setup Progress</CardTitle>
                <CardDescription>
                  {state.onboarding_completed 
                    ? "Your onboarding is complete. You can restart the setup wizard anytime."
                    : "Complete these steps to get your farm fully set up."}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {state.onboarding_completed && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowWelcomeModal(false);
                      startWizardAtStep(0);
                      setShowWizard(true);
                    }}
                  >
                    Restart Setup Wizard
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={dismissSetupSteps}
                  className="h-8 w-8"
                  title="Don't show this anymore"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ProgressIndicator
              onStartStep={(stepIndex) => {
                setShowWelcomeModal(false);
                startWizardAtStep(stepIndex ?? 0);
                setShowWizard(true);
              }}
              onRestart={() => {
                setShowWelcomeModal(false);
                startWizardAtStep(0);
                setShowWizard(true);
              }}
            />
          </CardContent>
        </Card>
      )}

      {shouldShowTrialBanner && <TrialBanner trialEndDate={trialEndDate} />}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        <Card className="border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-all duration-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-50 rounded-lg">
                <ShoppingBasket className="h-8 w-8 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Active Trays</p>
                <h3 className="text-2xl font-bold text-gray-900">{stats.activeTrays}</h3>
                <p className="text-xs text-gray-500">of {stats.totalTrays} total</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-all duration-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-50 rounded-lg">
                <Sprout className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Varieties</p>
                <h3 className="text-2xl font-bold text-gray-900">{stats.totalVarieties}</h3>
                <p className="text-xs text-gray-500">in catalog</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500 shadow-sm hover:shadow-md transition-all duration-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-50 rounded-lg">
                <ClipboardList className="h-8 w-8 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Orders</p>
                <h3 className="text-2xl font-bold text-gray-900">{stats.totalOrders}</h3>
                <p className="text-xs text-gray-500">active orders</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-indigo-500 shadow-sm hover:shadow-md transition-all duration-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-50 rounded-lg">
                <Package className="h-8 w-8 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Products</p>
                <h3 className="text-2xl font-bold text-gray-900">{stats.totalProducts}</h3>
                <p className="text-xs text-gray-500">active products</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500 shadow-sm hover:shadow-md transition-all duration-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-50 rounded-lg">
                <ShoppingBasket className="h-8 w-8 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Standing Orders</p>
                <h3 className="text-2xl font-bold text-gray-900">{stats.standingOrders}</h3>
                <p className="text-xs text-gray-500">recurring orders</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-teal-500 shadow-sm hover:shadow-md transition-all duration-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-teal-50 rounded-lg">
                <ClipboardList className="h-8 w-8 text-teal-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Weekly Tasks</p>
                <h3 className="text-2xl font-bold text-gray-900">{stats.weeklyTasks}</h3>
                <p className="text-xs text-gray-500">pending this week</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-sky-500 shadow-sm hover:shadow-md transition-all duration-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-sky-50 rounded-lg">
                <Scissors className="h-8 w-8 text-sky-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Upcoming Harvests</p>
                <h3 className="text-2xl font-bold text-gray-900">{stats.upcomingHarvests}</h3>
                <p className="text-xs text-gray-500">next 7 days</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-800">Weekly Harvest Yield (oz)</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={harvestData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6b7280'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280'}} />
                <Tooltip 
                  cursor={{fill: '#f3f4f6'}}
                  contentStyle={{
                    backgroundColor: '#FFF', 
                    borderRadius: '8px', 
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Bar dataKey="yield" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-800">Tray Distribution by Variety</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={varietyData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {varietyData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{
                    backgroundColor: '#FFF', 
                    borderRadius: '8px', 
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-800">Sales by Variety</CardTitle>
            <CardDescription>Total sales grouped by variety</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            {salesByVariety.length > 0 && salesByVariety[0].name !== 'No Data' ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={salesByVariety} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e5e7eb" />
                  <XAxis 
                    type="number" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#6b7280'}}
                    tickFormatter={(value) => `$${value.toFixed(0)}`}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#6b7280', fontSize: 12}}
                    width={120}
                  />
                  <Tooltip 
                    cursor={{fill: '#f3f4f6'}}
                    contentStyle={{
                      backgroundColor: '#FFF', 
                      borderRadius: '8px', 
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                    formatter={(value: any) => [`$${value.toFixed(2)}`, 'Sales']}
                  />
                  <Bar dataKey="sales" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <p className="mb-2">No sales data available.</p>
                  <p className="text-sm">Sales will appear here once trays are assigned to customers.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-800">Sales by Customer</CardTitle>
            <CardDescription>Total sales grouped by customer</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            {salesByCustomer.length > 0 && salesByCustomer[0].name !== 'No Data' ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={salesByCustomer} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e5e7eb" />
                  <XAxis 
                    type="number" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#6b7280'}}
                    tickFormatter={(value) => `$${value.toFixed(0)}`}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#6b7280', fontSize: 12}}
                    width={120}
                  />
                  <Tooltip 
                    cursor={{fill: '#f3f4f6'}}
                    contentStyle={{
                      backgroundColor: '#FFF', 
                      borderRadius: '8px', 
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                    formatter={(value: any) => [`$${value.toFixed(2)}`, 'Sales']}
                  />
                  <Bar dataKey="sales" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <p className="mb-2">No sales data available.</p>
                  <p className="text-sm">Sales will appear here once trays are assigned to customers.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <div className="mt-1 p-2 bg-emerald-50 rounded-full">
                  <Sprout size={16} className="text-emerald-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">New batch #123 created</p>
                  <p className="text-sm text-gray-500">2 hours ago</p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <div className="mt-1 p-2 bg-sky-50 rounded-full">
                  <Scissors size={16} className="text-sky-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Harvested 15 trays of Sunflower</p>
                  <p className="text-sm text-gray-500">5 hours ago</p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <div className="mt-1 p-2 bg-amber-50 rounded-full">
                  <Package size={16} className="text-amber-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Order #456 fulfilled</p>
                  <p className="text-sm text-gray-500">1 day ago</p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <div className="mt-1 p-2 bg-indigo-50 rounded-full">
                  <User size={16} className="text-indigo-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">New user added: John Doe</p>
                  <p className="text-sm text-gray-500">2 days ago</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <Button 
                variant="outline" 
                className="h-auto py-6 flex flex-col gap-2 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-all"
                onClick={() => navigate('/trays')}
              >
                <ShoppingBasket className="h-8 w-8 mb-1" />
                <span>Create Tray</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-6 flex flex-col gap-2 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 transition-all"
                onClick={() => navigate('/batches')}
              >
                <Package className="h-8 w-8 mb-1" />
                <span>New Batch</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-6 flex flex-col gap-2 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-all"
                onClick={() => navigate('/orders')}
              >
                <ClipboardList className="h-8 w-8 mb-1" />
                <span>New Order</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-6 flex flex-col gap-2 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200 transition-all"
                onClick={() => navigate('/users')}
              >
                <User className="h-8 w-8 mb-1" />
                <span>Add User</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
