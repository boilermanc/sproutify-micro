import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface DeliveryReportProps {
  startDate: Date;
  endDate: Date;
}

interface DeliveryData {
  customer_name: string;
  delivery_address: string | null;
  product_name: string;
  variant_name: string;
  size: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  delivery_date: string;
}

const DeliveryReport = ({ startDate, endDate }: DeliveryReportProps) => {
  const [data, setData] = useState<DeliveryData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDeliveryData();
  }, [startDate, endDate]);

  const fetchDeliveryData = async () => {
    try {
      setLoading(true);
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // Fetch orders with delivery dates in range
      const { data: ordersData, error } = await supabase
        .from('orders')
        .select(`
          order_id,
          delivery_date,
          customers!inner(customerid, name, delivery_address),
          order_items(
            quantity,
            unit_price,
            total_price,
            products(product_name),
            product_variants(variant_name, size)
          )
        `)
        .eq('farm_uuid', farmUuid)
        .not('delivery_date', 'is', null)
        .gte('delivery_date', startDate.toISOString().split('T')[0])
        .lte('delivery_date', endDate.toISOString().split('T')[0])
        .order('delivery_date', { ascending: true });

      if (error) throw error;

      // Flatten order items
      const deliveryItems: DeliveryData[] = [];

      (ordersData || []).forEach((order: any) => {
        const customer = order.customers;
        (order.order_items || []).forEach((item: any) => {
          deliveryItems.push({
            customer_name: customer?.name || 'Unknown',
            delivery_address: customer?.delivery_address || null,
            product_name: item.products?.product_name || 'Unknown',
            variant_name: item.product_variants?.variant_name || 'Standard',
            size: item.product_variants?.size || null,
            quantity: item.quantity || 0,
            unit_price: item.unit_price || 0,
            total_price: item.total_price || 0,
            delivery_date: order.delivery_date,
          });
        });
      });

      // Sort by customer, then delivery date
      deliveryItems.sort((a, b) => {
        const customerCompare = a.customer_name.localeCompare(b.customer_name);
        if (customerCompare !== 0) return customerCompare;
        return a.delivery_date.localeCompare(b.delivery_date);
      });

      setData(deliveryItems);
    } catch (error) {
      console.error('Error fetching delivery data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading delivery data...</div>;
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No delivery data found for the selected date range.
      </div>
    );
  }

  // Group by customer
  const groupedByCustomer = data.reduce((acc, item) => {
    if (!acc[item.customer_name]) {
      acc[item.customer_name] = [];
    }
    acc[item.customer_name].push(item);
    return acc;
  }, {} as Record<string, DeliveryData[]>);

  return (
    <div className="space-y-6">
      <div className="text-sm text-gray-600">
        Report Period: {startDate.toLocaleDateString()} - {endDate.toLocaleDateString()}
      </div>
      {Object.entries(groupedByCustomer).map(([customerName, items]) => {
        const customerTotal = items.reduce((sum, item) => sum + item.total_price, 0);
        return (
          <div key={customerName} className="border rounded-lg">
            <div className="p-4 bg-gray-50 border-b">
              <h3 className="font-semibold">{customerName}</h3>
              {items[0].delivery_address && (
                <p className="text-sm text-gray-600 mt-1">{items[0].delivery_address}</p>
              )}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Delivery Date</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>{new Date(item.delivery_date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium">{item.product_name}</TableCell>
                    <TableCell>
                      {item.size ? (
                        <Badge variant="outline">{item.size}</Badge>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">${item.unit_price.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-semibold">${item.total_price.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="p-4 bg-gray-50 border-t">
              <div className="text-right font-semibold">
                Customer Total: ${customerTotal.toFixed(2)}
              </div>
            </div>
          </div>
        );
      })}
      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <div className="text-sm font-semibold">Grand Total: ${
          data.reduce((sum, item) => sum + item.total_price, 0).toFixed(2)
        }</div>
      </div>
    </div>
  );
};

export default DeliveryReport;

