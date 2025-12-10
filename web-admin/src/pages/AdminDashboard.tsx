import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  RefreshCcw, 
  Users, 
  Building2, 
  Sprout, 
  Package, 
  ShoppingBasket,
  ClipboardList,
  TrendingUp
} from 'lucide-react';

const AdminDashboard = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalFarms: 0,
    activeFarms: 0,
    totalUsers: 0,
    newUsersToday: 0,
    totalTrays: 0,
    activeTrays: 0,
    totalRecipes: 0,
    totalVarieties: 0,
    totalCustomers: 0,
    totalOrders: 0,
    totalBatches: 0,
  });

  const fetchDashboardData = useCallback(async (showLoadingState = false) => {
    if (showLoadingState) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString();

      // Fetch all data in parallel
      const [
        farmsTotal,
        farmsActive,
        usersTotal,
        usersToday,
        traysTotal,
        traysActive,
        recipesTotal,
        varietiesTotal,
        customersTotal,
        ordersTotal,
        batchesTotal
      ] = await Promise.all([
        // Total Farms
        supabase.from('farms').select('*', { count: 'exact', head: true }),
        // Active Farms
        supabase.from('farms').select('*', { count: 'exact', head: true }).eq('is_active', true),
        // Total Users
        supabase.from('profile').select('*', { count: 'exact', head: true }),
        // New Users Today
        supabase.from('profile').select('*', { count: 'exact', head: true }).gte('created_at', todayStr),
        // Total Trays
        supabase.from('trays').select('*', { count: 'exact', head: true }),
        // Active Trays (no harvest date)
        supabase.from('trays').select('*', { count: 'exact', head: true }).is('harvest_date', null),
        // Total Recipes
        supabase.from('recipes').select('*', { count: 'exact', head: true }),
        // Total Varieties
        supabase.from('varieties').select('*', { count: 'exact', head: true }),
        // Total Customers
        supabase.from('customers').select('*', { count: 'exact', head: true }),
        // Total Orders
        supabase.from('orders').select('*', { count: 'exact', head: true }).then(r => r, () => ({ count: 0, error: null })),
        // Total Batches
        supabase.from('seedbatches').select('*', { count: 'exact', head: true }).then(r => r, () => ({ count: 0, error: null })),
      ]);

      setStats({
        totalFarms: farmsTotal.count || 0,
        activeFarms: farmsActive.count || 0,
        totalUsers: usersTotal.count || 0,
        newUsersToday: usersToday.count || 0,
        totalTrays: traysTotal.count || 0,
        activeTrays: traysActive.count || 0,
        totalRecipes: recipesTotal.count || 0,
        totalVarieties: varietiesTotal.count || 0,
        totalCustomers: customersTotal.count || 0,
        totalOrders: ordersTotal.count || 0,
        totalBatches: batchesTotal.count || 0,
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData(true);
  }, [fetchDashboardData]);

  const handleRefresh = () => {
    fetchDashboardData(false);
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="p-6 space-y-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-gray-100 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Admin Dashboard</h1>
          <p className="text-gray-500 font-medium mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        
        <Button 
          variant="outline" 
          size="icon"
          onClick={handleRefresh}
          className={`rounded-full border-gray-200 hover:bg-gray-50 ${isRefreshing ? 'animate-spin' : ''}`}
          title="Refresh Data"
        >
          <RefreshCcw className="h-4 w-4 text-gray-600" />
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <StatCard 
          title="Total Farms" 
          value={stats.totalFarms} 
          subtitle={`${stats.activeFarms} active`}
          icon={Building2} 
          color="text-blue-600" 
          bg="bg-blue-100" 
        />
        <StatCard 
          title="Total Users" 
          value={stats.totalUsers} 
          subtitle={`${stats.newUsersToday} new today`}
          icon={Users} 
          color="text-purple-600" 
          bg="bg-purple-100" 
        />
        <StatCard 
          title="Active Trays" 
          value={stats.activeTrays} 
          subtitle={`${stats.totalTrays} total`}
          icon={Sprout} 
          color="text-emerald-600" 
          bg="bg-emerald-100" 
        />
        <StatCard 
          title="Total Recipes" 
          value={stats.totalRecipes} 
          subtitle="Across all farms"
          icon={ClipboardList} 
          color="text-amber-600" 
          bg="bg-amber-100" 
        />
        <StatCard 
          title="Total Varieties" 
          value={stats.totalVarieties} 
          subtitle="Catalog items"
          icon={Sprout} 
          color="text-green-600" 
          bg="bg-green-100" 
        />
        <StatCard 
          title="Total Customers" 
          value={stats.totalCustomers} 
          subtitle="All farms"
          icon={Users} 
          color="text-indigo-600" 
          bg="bg-indigo-100" 
        />
        <StatCard 
          title="Total Orders" 
          value={stats.totalOrders} 
          subtitle="All farms"
          icon={ShoppingBasket} 
          color="text-rose-600" 
          bg="bg-rose-100" 
        />
        <StatCard 
          title="Total Batches" 
          value={stats.totalBatches} 
          subtitle="Seed batches"
          icon={Package} 
          color="text-violet-600" 
          bg="bg-violet-100" 
        />
      </div>

      {/* Additional Info Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-md bg-white rounded-2xl">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-gray-800">System Overview</CardTitle>
            <CardDescription>Key metrics across all micro farms</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-600">Active Farms</span>
                <span className="text-lg font-bold text-gray-900">{stats.activeFarms}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-600">New Users Today</span>
                <span className="text-lg font-bold text-gray-900">{stats.newUsersToday}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-600">Active Trays</span>
                <span className="text-lg font-bold text-gray-900">{stats.activeTrays}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-white rounded-2xl">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-gray-800">Quick Actions</CardTitle>
            <CardDescription>Common admin tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start" onClick={() => window.location.href = '/admin-portal/farms-users'}>
                <Users className="h-4 w-4 mr-2" />
                View All Farms & Users
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => window.location.href = '/admin-portal/trays-batches'}>
                <Package className="h-4 w-4 mr-2" />
                View All Trays & Batches
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => window.location.href = '/admin-portal/customers-orders'}>
                <ShoppingBasket className="h-4 w-4 mr-2" />
                View All Customers & Orders
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

interface StatCardProps {
  title: string;
  value: number;
  subtitle: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  color: string;
  bg: string;
}

const StatCard = ({ title, value, subtitle, icon: Icon, color, bg }: StatCardProps) => (
  <Card className="border-none shadow-sm hover:shadow-md transition-shadow duration-200 rounded-2xl overflow-hidden group">
    <CardContent className="p-5 flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
        <h3 className="text-2xl font-black text-gray-900 tracking-tight">{value}</h3>
        <p className="text-xs font-medium text-gray-400 mt-1">{subtitle}</p>
      </div>
      <div className={`p-3 rounded-xl ${bg} shadow-sm transition-all duration-300 group-hover:scale-110`}>
        <Icon className={`h-6 w-6 ${color}`} strokeWidth={2.5} />
      </div>
    </CardContent>
  </Card>
);

const DashboardSkeleton = () => (
  <div className="p-6 space-y-8 max-w-[1600px] mx-auto">
    <div className="flex justify-between items-center pb-6 border-b border-gray-100">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
    </div>
  </div>
);

export default AdminDashboard;

