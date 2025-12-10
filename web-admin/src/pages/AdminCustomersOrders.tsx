import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  RefreshCcw, 
  Users,
  ShoppingBasket,
  Search,
  X,
  Building2
} from 'lucide-react';

interface Customer {
  customer_id: number;
  customer_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  farm_uuid: string;
  created_at: string;
  farm_name?: string;
}

interface Order {
  order_id: number;
  farm_uuid: string;
  customer_id: number;
  order_date: string;
  delivery_date: string | null;
  status: string;
  total_amount: number | null;
  created_at: string;
  farm_name?: string;
  customer_name?: string;
}

interface Farm {
  farm_uuid: string;
  farmname: string;
}

interface FarmStats {
  farm_uuid: string;
  farm_name: string;
  customer_count: number;
  order_count: number;
}

const AdminCustomersOrders = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmStats, setFarmStats] = useState<FarmStats[]>([]);
  const [selectedFarmUuid, setSelectedFarmUuid] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'customers' | 'orders'>('customers');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch all farms
      const { data: farmsData, error: farmsError } = await supabase
        .from('farms')
        .select('farm_uuid, farmname')
        .order('farmname', { ascending: true });

      if (farmsError) {
        console.error('Farms error:', farmsError);
      } else {
        setFarms(farmsData || []);
      }

      // Fetch customers with farm names (only if farm is selected)
      const customersQuery = supabase
        .from('customers')
        .select(`
          *,
          farms (
            farmname
          )
        `)
        .order('created_at', { ascending: false });

      if (selectedFarmUuid) {
        customersQuery.eq('farm_uuid', selectedFarmUuid);
      }

      const { data: customersData, error: customersError } = await customersQuery.limit(selectedFarmUuid ? 1000 : 100);

      if (customersError) {
        console.error('Customers error:', customersError);
        if (customersError.code === 'PGRST301' || customersError.message.includes('permission denied')) {
          throw new Error('Admin RLS policies not configured. Please run migration 033_add_admin_rls_policies.sql');
        }
        throw customersError;
      }

      const customersWithFarmNames = (customersData || []).map((customer: any) => ({
        ...customer,
        farm_name: customer.farms?.farmname || 'Unknown Farm'
      }));

      setCustomers(customersWithFarmNames);

      // Fetch orders with farm names (only if farm is selected)
      // Note: customers table has customer_type, not customer_name
      const ordersQuery = supabase
        .from('orders')
        .select(`
          *,
          farms (
            farmname
          ),
          customers (
            customer_type
          )
        `)
        .order('created_at', { ascending: false });

      if (selectedFarmUuid) {
        ordersQuery.eq('farm_uuid', selectedFarmUuid);
      }

      let ordersForStats: any[] = [];
      const { data: ordersData, error: ordersError } = await ordersQuery.limit(selectedFarmUuid ? 1000 : 100);

      if (ordersError) {
        console.error('Orders error:', ordersError);
        // Orders table might not exist or have different schema, that's okay
        if (ordersError.code === 'PGRST116' || ordersError.message.includes('does not exist')) {
          setOrders([]);
        } else if (ordersError.code === 'PGRST301' || ordersError.message.includes('permission denied')) {
          throw new Error('Admin RLS policies not configured. Please run migration 033_add_admin_rls_policies.sql');
        } else {
          setOrders([]);
        }
      } else {
        const ordersWithNames = (ordersData || []).map((order: any) => ({
          ...order,
          farm_name: order.farms?.farmname || 'Unknown Farm',
          customer_name: order.customers?.customer_type || 'Unknown Customer'
        }));
        setOrders(ordersWithNames);
        ordersForStats = ordersData || [];
      }

      // Calculate stats per farm
      const statsMap = new Map<string, FarmStats>();
      
      // Initialize stats for all farms
      (farmsData || []).forEach((farm: any) => {
        statsMap.set(farm.farm_uuid, {
          farm_uuid: farm.farm_uuid,
          farm_name: farm.farmname || 'Unknown Farm',
          customer_count: 0,
          order_count: 0
        });
      });

      // Count customers per farm
      customersWithFarmNames.forEach((customer: Customer) => {
        const stats = statsMap.get(customer.farm_uuid);
        if (stats) {
          stats.customer_count++;
        } else {
          statsMap.set(customer.farm_uuid, {
            farm_uuid: customer.farm_uuid,
            farm_name: customer.farm_name || 'Unknown Farm',
            customer_count: 1,
            order_count: 0
          });
        }
      });

      // Count orders per farm
      ordersForStats.forEach((order: any) => {
        const stats = statsMap.get(order.farm_uuid);
        if (stats) {
          stats.order_count++;
        } else {
          statsMap.set(order.farm_uuid, {
            farm_uuid: order.farm_uuid,
            farm_name: order.farm_name || 'Unknown Farm',
            customer_count: 0,
            order_count: 1
          });
        }
      });

      setFarmStats(Array.from(statsMap.values()));
    } catch (error) {
      console.error('Error fetching data:', error);
      if (error instanceof Error && error.message.includes('RLS')) {
        alert('Admin access not configured. Please contact support to set up admin RLS policies.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedFarmUuid]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredCustomers = customers.filter(customer => {
    const customerName = (customer.customer_name || '').toLowerCase();
    const email = (customer.email || '').toLowerCase();
    const farmName = (customer.farm_name || '').toLowerCase();
    const searchLower = searchTerm.toLowerCase();
    return customerName.includes(searchLower) || 
           email.includes(searchLower) || 
           farmName.includes(searchLower);
  });

  const filteredOrders = orders.filter(order => {
    const customerName = (order.customer_name || '').toLowerCase();
    const farmName = (order.farm_name || '').toLowerCase();
    const status = (order.status || '').toLowerCase();
    const searchLower = searchTerm.toLowerCase();
    return customerName.includes(searchLower) || 
           farmName.includes(searchLower) ||
           status.includes(searchLower);
  });

  const totalCustomers = farmStats.reduce((sum, stat) => sum + stat.customer_count, 0);
  const totalOrders = farmStats.reduce((sum, stat) => sum + stat.order_count, 0);

  const statusColors: Record<string, string> = {
    'pending': 'bg-yellow-100 text-yellow-700',
    'completed': 'bg-green-100 text-green-700',
    'cancelled': 'bg-red-100 text-red-700',
    'delivered': 'bg-blue-100 text-blue-700',
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-gray-100 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Customers & Orders</h1>
          <p className="text-gray-500 font-medium mt-1">View customers and orders by farm</p>
        </div>
        <Button variant="outline" onClick={fetchData}>
          <RefreshCcw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-none shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Customers</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{totalCustomers}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                <Users className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Orders</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{totalOrders}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <ShoppingBasket className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Farms</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{farms.length}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Farm Selector */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Farm</label>
          <select
            value={selectedFarmUuid || ''}
            onChange={(e) => setSelectedFarmUuid(e.target.value || null)}
            className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          >
            <option value="">All Farms</option>
            {farms.map((farm) => {
              const stats = farmStats.find(s => s.farm_uuid === farm.farm_uuid);
              return (
                <option key={farm.farm_uuid} value={farm.farm_uuid}>
                  {farm.farmname} ({stats?.customer_count || 0} customers, {stats?.order_count || 0} orders)
                </option>
              );
            })}
          </select>
        </div>
        {selectedFarmUuid && (
          <Button
            variant="outline"
            onClick={() => setSelectedFarmUuid(null)}
            className="mt-6 md:mt-0"
          >
            <X className="h-4 w-4 mr-2" />
            Clear Filter
          </Button>
        )}
      </div>

      {/* Farm Stats Grid */}
      {!selectedFarmUuid && farmStats.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Farm Statistics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {farmStats
              .sort((a, b) => (b.customer_count + b.order_count) - (a.customer_count + a.order_count))
              .map((stat) => (
                <Card 
                  key={stat.farm_uuid} 
                  className="border-none shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedFarmUuid(stat.farm_uuid)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-lg">{stat.farm_name}</h3>
                      <Building2 className="h-5 w-5 text-gray-400" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Customers:</span>
                        <span className="font-semibold text-gray-900">{stat.customer_count}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Orders:</span>
                        <span className="font-semibold text-gray-900">{stat.order_count}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>
      )}

      {/* Tabs and Content - Only show if farm is selected */}
      {selectedFarmUuid && (
        <>
          {/* Tabs */}
          <div className="flex gap-2 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('customers')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'customers'
                  ? 'text-purple-600 border-b-2 border-purple-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Users className="h-4 w-4 inline mr-2" />
              Customers ({filteredCustomers.length})
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'orders'
                  ? 'text-purple-600 border-b-2 border-purple-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <ShoppingBasket className="h-4 w-4 inline mr-2" />
              Orders ({filteredOrders.length})
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder={activeTab === 'customers' ? 'Search customers...' : 'Search orders...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
            </div>
          ) : activeTab === 'customers' ? (
            <div className="space-y-4">
              {filteredCustomers.map((customer) => (
                <Card key={customer.customer_id} className="border-none shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg mb-2">{customer.customer_name}</h3>
                        <div className="space-y-1 text-sm text-gray-600">
                          {customer.email && (
                            <div key="email" className="flex items-center gap-2">
                              <span className="font-medium">Email:</span>
                              <span>{customer.email}</span>
                            </div>
                          )}
                          {customer.phone && (
                            <div key="phone" className="flex items-center gap-2">
                              <span className="font-medium">Phone:</span>
                              <span>{customer.phone}</span>
                            </div>
                          )}
                          {customer.address && (
                            <div key="address" className="flex items-center gap-2">
                              <span className="font-medium">Address:</span>
                              <span>{customer.address}</span>
                            </div>
                          )}
                          <div key="created" className="flex items-center gap-2">
                            <span className="font-medium">Created:</span>
                            <span>{new Date(customer.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredCustomers.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  {searchTerm ? 'No customers found matching your search' : 'No customers found for this farm'}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map((order) => (
                <Card key={order.order_id} className="border-none shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">Order #{order.order_id}</h3>
                          <Badge className={statusColors[order.status] || 'bg-gray-100 text-gray-700'}>
                            {order.status}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-sm text-gray-600">
                          <div key="customer" className="flex items-center gap-2">
                            <span className="font-medium">Customer:</span>
                            <span>{order.customer_name}</span>
                          </div>
                          <div key="order-date" className="flex items-center gap-2">
                            <span className="font-medium">Order Date:</span>
                            <span>{new Date(order.order_date).toLocaleDateString()}</span>
                          </div>
                          {order.delivery_date && (
                            <div key="delivery" className="flex items-center gap-2">
                              <span className="font-medium">Delivery Date:</span>
                              <span>{new Date(order.delivery_date).toLocaleDateString()}</span>
                            </div>
                          )}
                          {order.total_amount && (
                            <div key="total" className="flex items-center gap-2">
                              <span className="font-medium">Total:</span>
                              <span>${order.total_amount.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredOrders.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  {searchTerm ? 'No orders found matching your search' : 'No orders found for this farm'}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminCustomersOrders;
