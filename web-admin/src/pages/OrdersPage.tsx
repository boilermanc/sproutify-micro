import { useState, useEffect } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { Eye, Edit, FileText, Plus, Search } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type DateRangePreset = '7d' | '30d' | '90d' | 'month' | 'year' | 'custom';

const OrdersPage = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newOrder, setNewOrder] = useState({
    customer_id: '',
    order_date: new Date().toISOString().split('T')[0],
    total_amount: '',
    status: 'Pending',
  });
  
  // Chart date range state
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('7d');
  const [customStartDate, setCustomStartDate] = useState<string>(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [customEndDate, setCustomEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [chartSortOrder, setChartSortOrder] = useState<'asc' | 'desc'>('asc');

  // Get date range based on preset or custom dates
  const getDateRange = () => {
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    
    let startDate: Date;
    let endDate: Date = today;
    
    switch (dateRangePreset) {
      case '7d':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);
        break;
      case '30d':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 29);
        startDate.setHours(0, 0, 0, 0);
        break;
      case '90d':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 89);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'year':
        startDate = new Date(today.getFullYear(), 0, 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'custom':
        startDate = new Date(customStartDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(customEndDate);
        endDate.setHours(23, 59, 59, 999);
        break;
      default:
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);
    }
    
    return { startDate, endDate };
  };

  // Calculate sales data from actual orders for the selected date range
  const getSalesData = () => {
    try {
      const { startDate, endDate } = getDateRange();
      
      // Generate all dates in the range
      const dates: Date[] = [];
      const currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        dates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Group orders by date and sum totals
      const salesByDate = new Map<string, number>();
      
      orders.forEach(order => {
      // Use dateISO if available (more reliable), otherwise parse the formatted date
      const dateToUse = (order as any).dateISO || order.date;
      
      if (dateToUse && dateToUse !== 'N/A' && dateToUse !== 'unknown') {
        try {
          let orderDate: Date;
          let dateKey: string;
          
          if ((order as any).dateISO) {
            // Use ISO date string directly
            dateKey = (order as any).dateISO;
            orderDate = new Date(dateKey);
          } else {
            // Parse the formatted date string
            orderDate = new Date(order.date);
            dateKey = orderDate.toISOString().split('T')[0];
          }
          
          // Check if date is valid
          if (isNaN(orderDate.getTime())) {
            return; // Skip invalid dates
          }
          
          // Only include orders within the selected date range
          if (orderDate >= startDate && orderDate <= endDate) {
            const currentTotal = salesByDate.get(dateKey) || 0;
            // Extract numeric value from total string (e.g., "$150.00" -> 150)
            const totalStr = order.total || '$0.00';
            const orderValue = parseFloat(totalStr.replace(/[$,]/g, '')) || 0;
            salesByDate.set(dateKey, currentTotal + orderValue);
          }
        } catch (e) {
          // Skip invalid dates
          console.warn('Error parsing order date:', dateToUse, e);
        }
      }
      });

      // Create data points for each date in the range
      let salesData = dates.map(date => {
      const dateKey = date.toISOString().split('T')[0];
      const amount = salesByDate.get(dateKey) || 0;
      
      // Format date based on range length
      let dateLabel: string;
      if (dates.length <= 31) {
        // Show day and month for short ranges
        dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else if (dates.length <= 90) {
        // Show month and day for medium ranges
        dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else {
        // Show month only for long ranges
        dateLabel = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      }
      
      return {
        date: dateLabel,
        dateKey: dateKey,
        amount: Math.round(amount * 100) / 100, // Round to 2 decimal places
        fullDate: date,
      };
      });
      
      // Sort based on user preference
      if (chartSortOrder === 'desc') {
        salesData = salesData.reverse();
      }
      
      return salesData;
    } catch (error) {
      console.error('Error calculating sales data:', error);
      // Return empty array on error
      return [];
    }
  };

  const salesData = getSalesData();

  const fetchOrders = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // Orders are represented by trays assigned to customers
      // A tray with a customer_id is essentially an order
      // Trays table has customer_id column that references customers.customerid
      const { data: traysData, error } = await supabase
        .from('trays')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .not('customer_id', 'is', null); // Only trays assigned to customers (orders)

      if (error) throw error;

      // Fetch customer names
      const customerIds = (traysData || [])
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

      // Group trays by customer and date to create orders
      // Each tray assigned to a customer represents an order item
      const ordersMap = new Map<string, any>();
      
      (traysData || []).forEach((tray: any) => {
        const customerId = tray.customer_id;
        const customerName = customersMap[customerId] || 'Unknown Customer';
        const orderDate = tray.harvest_date || tray.sow_date || tray.created_at;
        const dateKey = orderDate ? new Date(orderDate).toISOString().split('T')[0] : 'unknown';
        const orderKey = `${customerId}-${dateKey}`;

        if (!ordersMap.has(orderKey)) {
          ordersMap.set(orderKey, {
            id: orderKey,
            customer_id: customerId,
            customer: customerName,
            date: orderDate ? new Date(orderDate).toLocaleDateString() : 'N/A',
            orderDate: dateKey,
            trays: [],
            totalYield: 0,
            trayCount: 0,
            status: tray.harvest_date ? 'Fulfilled' : 'Pending',
          });
        }

        const order = ordersMap.get(orderKey);
        order.trays.push(tray);
        order.totalYield += parseFloat(tray.yield || 0);
        order.trayCount += 1;
        // If any tray is harvested, mark order as fulfilled
        if (tray.harvest_date) {
          order.status = 'Fulfilled';
        }
      });

      // Convert to array and format
      const formattedOrders = Array.from(ordersMap.values())
        .map((order, index) => ({
          id: order.id,
          orderId: `ORD-${1000 + index + 1}`,
          customer: order.customer,
          date: order.date,
          dateISO: order.orderDate, // Store ISO date for chart calculations
          total: order.totalYield > 0 ? `$${(order.totalYield * 10).toFixed(2)}` : '$0.00', // Estimate: $10 per unit yield
          status: order.status,
          trayCount: order.trayCount,
          yield: order.totalYield,
        }))
        .sort((a, b) => {
          // Sort by date descending
          const dateA = a.date === 'N/A' ? '' : a.date;
          const dateB = b.date === 'N/A' ? '' : b.date;
          return dateB.localeCompare(dateA);
        });

      setOrders(formattedOrders);
    } catch (error) {
      console.error('Error fetching orders:', error);
      // Fallback to empty array
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

      // Actual DB columns: customerid, name (not customer_id, customer_name)
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('farm_uuid', farmUuid);

      if (error) {
        console.error('Error fetching customers:', error);
        return;
      }

      // Normalize field names for code compatibility
      // Map customerid -> customer_id, name -> customer_name
      const normalized = (data || []).map((c: any) => ({
        ...c,
        customer_id: c.customerid ?? c.customer_id, // Map for compatibility
        customer_name: c.name ?? c.customer_name ?? '', // Map name to customer_name
      })).sort((a: any, b: any) => {
        const nameA = (a.customer_name || '').toLowerCase();
        const nameB = (b.customer_name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });

      setCustomers(normalized);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchCustomers();
  }, []);

  const handleAddOrder = async () => {
    // Note: Orders are created by assigning trays to customers
    // This form is for reference - actual orders come from trays with customer_id
    alert('Orders are created automatically when you assign trays to customers. Go to the Trays page to assign a tray to a customer, which will create an order.');
    
    setNewOrder({
      customer_id: '',
      order_date: new Date().toISOString().split('T')[0],
      total_amount: '',
      status: 'Pending',
    });
    setIsAddDialogOpen(false);
  };

  const filteredOrders = orders.filter(order => 
    order.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.orderId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadgeVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case 'fulfilled': return 'default';
      case 'pending': return 'secondary';
      case 'cancelled': return 'destructive';
      default: return 'outline';
    }
  };

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">Manage your customer orders</p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Order
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>About Orders</DialogTitle>
              <DialogDescription>
                Orders are automatically created when you assign trays to customers on the Trays page. Each tray assigned to a customer represents an order item.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm text-muted-foreground mb-2">
                  To create an order:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                  <li>Go to the <strong>Trays</strong> page</li>
                  <li>Create or select a tray</li>
                  <li>Assign it to a customer</li>
                  <li>The order will appear here automatically</li>
                </ol>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Close
              </Button>
              <Button onClick={() => {
                setIsAddDialogOpen(false);
                // Navigate to trays page - you might want to use react-router for this
                window.location.href = '/trays';
              }}>
                Go to Trays
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>Sales Trend</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={dateRangePreset} onValueChange={(value) => setDateRangePreset(value as DateRangePreset)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                  <SelectItem value="90d">Last 90 Days</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="year">This Year</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
              {dateRangePreset === 'custom' && (
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-[140px]"
                  />
                  <span className="text-muted-foreground text-sm">to</span>
                  <Input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-[140px]"
                  />
                </div>
              )}
              <Select value={chartSortOrder} onValueChange={(value) => setChartSortOrder(value as 'asc' | 'desc')}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Oldest First</SelectItem>
                  <SelectItem value="desc">Newest First</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {salesData.some(d => d.amount > 0) ? (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="rounded-lg border bg-card p-4">
                  <div className="text-sm text-muted-foreground">Total Sales</div>
                  <div className="text-2xl font-bold">
                    ${salesData.reduce((sum, d) => sum + d.amount, 0).toFixed(2)}
                  </div>
                </div>
                <div className="rounded-lg border bg-card p-4">
                  <div className="text-sm text-muted-foreground">Average Daily</div>
                  <div className="text-2xl font-bold">
                    ${(salesData.filter(d => d.amount > 0).length > 0
                      ? (salesData.reduce((sum, d) => sum + d.amount, 0) / salesData.filter(d => d.amount > 0).length).toFixed(2)
                      : '0.00')}
                  </div>
                </div>
                <div className="rounded-lg border bg-card p-4">
                  <div className="text-sm text-muted-foreground">Days with Sales</div>
                  <div className="text-2xl font-bold">
                    {salesData.filter(d => d.amount > 0).length} / {salesData.length}
                  </div>
                </div>
              </div>
              
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={salesData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#6b7280', fontSize: 12}}
                    angle={salesData.length > 14 ? -45 : 0}
                    textAnchor={salesData.length > 14 ? 'end' : 'middle'}
                    height={salesData.length > 14 ? 60 : 30}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#6b7280', fontSize: 12}}
                    tickFormatter={(value) => `$${value.toFixed(0)}`}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: '#FFF', 
                      borderRadius: '8px', 
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                    formatter={(value: any) => [`$${value.toFixed(2)}`, 'Sales']}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="amount" 
                    stroke="#10b981" 
                    strokeWidth={3} 
                    dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#FFF' }} 
                    activeDot={{ r: 6, fill: '#10b981' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <p className="mb-2">No sales data for the selected date range.</p>
                <p className="text-sm">Orders will appear here once trays are assigned to customers.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="rounded-md border bg-card text-card-foreground shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order ID</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Trays</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <FileText className="h-8 w-8 mb-2 opacity-50" />
                    <p>No orders found.</p>
                    {searchTerm && (
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => setSearchTerm('')}>
                        Clear Search
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.orderId}</TableCell>
                  <TableCell>{order.customer}</TableCell>
                  <TableCell>{order.date}</TableCell>
                  <TableCell>{order.trayCount || 0} tray(s)</TableCell>
                  <TableCell className="font-semibold">{order.total}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(order.status)}>
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => alert(`View details for ${order.orderId}`)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => alert(`Edit ${order.orderId}`)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default OrdersPage;
