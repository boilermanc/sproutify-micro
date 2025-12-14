import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface SalesReportProps {
  startDate: Date;
  endDate: Date;
}

interface SalesData {
  customer_name: string;
  product_name: string;
  variant_name: string;
  size: string | null;
  total_quantity: number;
  total_revenue: number;
  order_count: number;
}

const SalesReport = ({ startDate, endDate }: SalesReportProps) => {
  const [data, setData] = useState<SalesData[]>([]);
  const [groupBy, setGroupBy] = useState<'customer' | 'product' | 'size'>('customer');
  const [loading, setLoading] = useState(true);

  const fetchSalesData = useCallback(async () => {
    try {
      setLoading(true);
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // Fetch orders with items in date range
      const { data: ordersData, error } = await supabase
        .from('orders')
        .select(`
          order_id,
          order_date,
          customers!inner(customerid, name),
          order_items(
            quantity,
            total_price,
            products(product_name),
            product_variants(variant_name, size)
          )
        `)
        .eq('farm_uuid', farmUuid)
        .gte('order_date', startDate.toISOString().split('T')[0])
        .lte('order_date', endDate.toISOString().split('T')[0])
        .order('order_date', { ascending: false });

      if (error) throw error;

      // Aggregate sales data
      const salesMap = new Map<string, SalesData>();

      (ordersData || []).forEach((order: any) => {
        const customerName = order.customers?.name || 'Unknown';
        (order.order_items || []).forEach((item: any) => {
          const productName = item.products?.product_name || 'Unknown';
          const variantName = item.product_variants?.variant_name || 'Standard';
          const size = item.product_variants?.size || null;
          const key = `${customerName}-${productName}-${variantName}-${size || 'nosize'}`;

          if (!salesMap.has(key)) {
            salesMap.set(key, {
              customer_name: customerName,
              product_name: productName,
              variant_name: variantName,
              size,
              total_quantity: 0,
              total_revenue: 0,
              order_count: 0,
            });
          }

          const existing = salesMap.get(key)!;
          existing.total_quantity += item.quantity || 0;
          existing.total_revenue += item.total_price || 0;
          existing.order_count += 1;
        });
      });

      setData(Array.from(salesMap.values()));
    } catch (error) {
      console.error('Error fetching sales data:', error);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchSalesData();
  }, [fetchSalesData]);

  if (loading) {
    return <div className="text-center py-8">Loading sales data...</div>;
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No sales data found for the selected date range.
      </div>
    );
  }

  // Group data based on selected grouping
  const groupedData = data.reduce((acc, item) => {
    let key: string;
    switch (groupBy) {
      case 'customer':
        key = item.customer_name;
        break;
      case 'product':
        key = item.product_name;
        break;
      case 'size':
        key = item.size || 'No Size';
        break;
      default:
        key = item.customer_name;
    }

    if (!acc[key]) {
      acc[key] = {
        name: key,
        quantity: 0,
        revenue: 0,
        orders: 0,
      };
    }

    acc[key].quantity += item.total_quantity;
    acc[key].revenue += item.total_revenue;
    acc[key].orders += item.order_count;

    return acc;
  }, {} as Record<string, { name: string; quantity: number; revenue: number; orders: number }>);

  const chartData = Object.values(groupedData).sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = data.reduce((sum, item) => sum + item.total_revenue, 0);
  const totalQuantity = data.reduce((sum, item) => sum + item.total_quantity, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          Report Period: {startDate.toLocaleDateString()} - {endDate.toLocaleDateString()}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm">Group By:</label>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as 'customer' | 'product' | 'size')}
            className="px-3 py-1 border rounded"
          >
            <option value="customer">Customer</option>
            <option value="product">Product</option>
            <option value="size">Size</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 border rounded-lg">
          <div className="text-sm text-gray-600">Total Revenue</div>
          <div className="text-2xl font-bold">${totalRevenue.toFixed(2)}</div>
        </div>
        <div className="p-4 border rounded-lg">
          <div className="text-sm text-gray-600">Total Quantity</div>
          <div className="text-2xl font-bold">{totalQuantity}</div>
        </div>
        <div className="p-4 border rounded-lg">
          <div className="text-sm text-gray-600">Total Orders</div>
          <div className="text-2xl font-bold">{data.length}</div>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
            <YAxis />
            <Tooltip formatter={(value: any) => `$${value.toFixed(2)}`} />
            <Legend />
            <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{groupBy === 'customer' ? 'Customer' : groupBy === 'product' ? 'Product' : 'Size'}</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">Revenue</TableHead>
            <TableHead className="text-right">Orders</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {chartData.map((item, index) => (
            <TableRow key={index}>
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell className="text-right">{item.quantity}</TableCell>
              <TableCell className="text-right font-semibold">${item.revenue.toFixed(2)}</TableCell>
              <TableCell className="text-right">{item.orders}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default SalesReport;

