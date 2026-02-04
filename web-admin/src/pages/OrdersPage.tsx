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
import { Edit, FileText, Plus, Search, Package, Calendar, DollarSign, Truck, ShoppingCart, ChevronDown, ChevronRight, ArrowUpDown } from 'lucide-react';
import { getSupabaseClient } from '../lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type DateRangePreset = '7d' | '30d' | '90d' | 'month' | 'year' | 'custom';
type TabType = 'orders' | 'delivery-history';
type DeliverySortField = 'date' | 'customer' | 'trays' | 'yield' | 'amount';
type OrderSortField = 'orderId' | 'customer' | 'date' | 'type' | 'items' | 'total' | 'status';
type SortDirection = 'asc' | 'desc';

interface DeliveryHistoryRow {
  farm_uuid: string;
  delivery_date: string;
  customer_name: string;
  customer_id: number;
  recipe_name: string;
  recipe_id: number;
  standing_order_id: number | null;
  order_name: string | null;
  trays_delivered: number;
  total_yield_oz: number | null;
  unit_price: number | null;
  line_total: number | null;
  status: string;
}

interface DeliveryGroup {
  delivery_date: string;
  customer_name: string;
  customer_id: number;
  items: DeliveryHistoryRow[];
  total_trays: number;
  total_yield: number;
  total_amount: number;
}

const OrdersPage = () => {
  const [activeTab, setActiveTab] = useState<TabType>('orders');
  const [orders, setOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Delivery History state
  const [deliveryHistory, setDeliveryHistory] = useState<DeliveryHistoryRow[]>([]);
  const [deliveryHistoryLoading, setDeliveryHistoryLoading] = useState(false);
  const [deliveryDatePreset, setDeliveryDatePreset] = useState<DateRangePreset>('30d');
  const [deliveryCustomStartDate, setDeliveryCustomStartDate] = useState<string>(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [deliveryCustomEndDate, setDeliveryCustomEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [deliverySortField, setDeliverySortField] = useState<DeliverySortField>('date');
  const [deliverySortDirection, setDeliverySortDirection] = useState<SortDirection>('desc');
  const [expandedDeliveries, setExpandedDeliveries] = useState<Set<string>>(new Set());

  // Orders table sorting state
  const [orderSortField, setOrderSortField] = useState<OrderSortField>('date');
  const [orderSortDirection, setOrderSortDirection] = useState<SortDirection>('desc');

  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<any>(null);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [newOrder, setNewOrder] = useState({
    customer_id: '',
    order_date: new Date().toISOString().split('T')[0],
    delivery_date: '',
    order_type: 'one-time' as 'one-time' | 'weekly' | 'bi-weekly' | 'standing',
    status: 'Pending',
    notes: '',
  });
  const [orderItems, setOrderItems] = useState<any[]>([]);
  
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

      // Try to fetch from new orders table first
      let ordersFromTable: any[] = [];
      try {
        const { data: ordersData, error: ordersError } = await getSupabaseClient()
          .from('orders')
          .select(`
            *,
            customers!inner(customerid, name),
            order_items(
              *,
              products(product_id, product_name),
              product_variants(variant_id, variant_name, size, price)
            )
          `)
          .eq('farm_uuid', farmUuid)
          .order('order_date', { ascending: false });

        if (!ordersError && ordersData) {
          ordersFromTable = ordersData.map((order: any) => ({
            id: `order-${order.order_id}`,
            orderId: `ORD-${order.order_id}`,
            customer: order.customers?.name || 'Unknown',
            customer_id: order.customer_id,
            date: order.order_date ? new Date(order.order_date).toLocaleDateString() : 'N/A',
            dateISO: order.order_date || order.order_date,
            delivery_date: order.delivery_date ? new Date(order.delivery_date).toLocaleDateString() : null,
            total: `$${order.total_amount?.toFixed(2) || '0.00'}`,
            status: order.status,
            order_type: order.order_type || 'one-time',
            items: order.order_items || [],
            itemCount: order.order_items?.length || 0,
            notes: order.notes,
            isNewOrder: true, // Flag to indicate this is from new orders table
          }));
        }
      } catch (error) {
        console.log('New orders table not available, using tray-based orders', error);
      }

      // Also fetch legacy tray-based orders for backward compatibility
      const { data: traysData, error } = await getSupabaseClient()
        .from('trays')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .not('customer_id', 'is', null); // Only trays assigned to customers (orders)

      if (error && ordersFromTable.length === 0) throw error;

      // Fetch customer names
      const customerIds = (traysData || [])
        .map(tray => tray.customer_id)
        .filter(id => id !== null && id !== undefined);
      
      let customersMap: Record<number, string> = {};
      if (customerIds.length > 0) {
        const { data: customersData } = await getSupabaseClient()
          .from('customers')
          .select('customerid, name')
          .in('customerid', customerIds);
        
        customersMap = (customersData || []).reduce((acc, c) => {
          acc[c.customerid] = c.name || '';
          return acc;
        }, {} as Record<number, string>);
      }

      const recipeIds = Array.from(
        new Set(
          (traysData || [])
            .map((tray: any) => tray.recipe_id)
            .filter((id: any) => id !== null && id !== undefined)
        )
      );

      const recipeNameMap: Record<number, string> = {};
      const recipeProductMap: Record<number, { product_id: number; product_name?: string }> = {};
      const productVariantPrices: Record<number, number> = {};
      const fallbackRecipePrices: Record<string, number> = {
        'pea microgreen tray': 18,
        "marie's micro mix": 15,
      };

      if (recipeIds.length > 0) {
        const { data: recipesData, error: recipesError } = await getSupabaseClient()
          .from('recipes')
          .select('recipe_id, recipe_name')
          .in('recipe_id', recipeIds);

        if (recipesError) {
          console.error('Error fetching recipes for orders page:', recipesError);
        } else {
          (recipesData || []).forEach((recipe: any) => {
            if (recipe?.recipe_id) {
              recipeNameMap[recipe.recipe_id] = recipe.recipe_name || '';
            }
          });
        }

        const { data: recipeMappings, error: mappingError } = await getSupabaseClient()
          .from('product_recipe_mapping')
          .select('recipe_id, product_id')
          .in('recipe_id', recipeIds);

        if (mappingError) {
          console.error('Error fetching recipe -> product mappings:', mappingError);
        } else if (recipeMappings && recipeMappings.length > 0) {
          const productIds = Array.from(
            new Set(
              recipeMappings
                .map((mapping: any) => mapping.product_id)
                .filter((id: any) => id !== null && id !== undefined)
            )
          );

          const productNameMap: Record<number, string> = {};

          if (productIds.length > 0) {
            const { data: productsData, error: productsError } = await getSupabaseClient()
              .from('products')
              .select('product_id, product_name')
              .in('product_id', productIds);

            if (productsError) {
              console.error('Error fetching products for order price lookup:', productsError);
            } else {
              (productsData || []).forEach((product: any) => {
                if (product?.product_id) {
                  productNameMap[product.product_id] = product.product_name || '';
                }
              });
            }

            const { data: variantsData, error: variantsError } = await getSupabaseClient()
              .from('product_variants')
              .select('product_id, price')
              .in('product_id', productIds)
              .order('price', { ascending: true });

            if (variantsError) {
              console.error('Error fetching product variants for order price lookup:', variantsError);
            } else {
              (variantsData || []).forEach((variant: any) => {
                if (!variant?.product_id) return;
                const priceValue =
                  typeof variant.price === 'number'
                    ? variant.price
                    : parseFloat(variant.price as string) || 0;
                if (priceValue > 0 && !productVariantPrices[variant.product_id]) {
                  productVariantPrices[variant.product_id] = priceValue;
                }
              });
            }
          }

          recipeMappings.forEach((mapping: any) => {
            if (!mapping?.recipe_id || !mapping.product_id) return;
            if (!recipeProductMap[mapping.recipe_id]) {
              recipeProductMap[mapping.recipe_id] = {
                product_id: mapping.product_id,
                product_name: productNameMap[mapping.product_id] || '',
              };
            }
          });
        }
      }

      const normalizeName = (name?: string) => {
        if (!name) return '';
        return name.toLowerCase().trim();
      };

      const resolveFallbackPrice = (name?: string) => {
        const normalized = normalizeName(name);
        return fallbackRecipePrices[normalized] || 0;
      };

      const getTrayPrice = (tray: any) => {
        if (!tray) return 0;
        const recipeId = tray.recipe_id;
        const productInfo = recipeProductMap[recipeId];
        if (productInfo) {
          const variantPrice = productVariantPrices[productInfo.product_id];
          if (variantPrice && variantPrice > 0) {
            return variantPrice;
          }
          const fallbackFromProduct = resolveFallbackPrice(productInfo.product_name);
          if (fallbackFromProduct > 0) {
            return fallbackFromProduct;
          }
        }
        const recipeName = recipeNameMap[recipeId];
        return resolveFallbackPrice(recipeName);
      };

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
            totalAmount: 0,
            status: tray.harvest_date ? 'Fulfilled' : 'Pending',
          });
        }

        const order = ordersMap.get(orderKey);
        const trayPrice = getTrayPrice(tray);
        order.trays.push(tray);
        order.totalYield += parseFloat(tray.yield || 0);
        order.totalAmount += trayPrice;
        order.trayCount += 1;
        // If any tray is harvested, mark order as fulfilled
        if (tray.harvest_date) {
          order.status = 'Fulfilled';
        }
      });

      // Convert legacy tray-based orders to array and format
      const formattedTrayOrders = Array.from(ordersMap.values())
        .map((order, index) => {
          const totalValue = order.totalAmount || 0;
          return {
            id: order.id,
            orderId: `ORD-${1000 + index + 1}`,
            customer: order.customer,
            customer_id: order.customer_id,
            date: order.date,
            dateISO: order.orderDate, // Store ISO date for chart calculations
            total: `$${totalValue.toFixed(2)}`,
            status: order.status,
            trayCount: order.trayCount,
            yield: order.totalYield,
            trayIds: order.trays.map((t: any) => t.tray_id), // Store tray IDs for fetching details
            isNewOrder: false, // Legacy tray-based order
          };
        });

      // Combine new orders and legacy orders, sort by date
      const allOrders = [...ordersFromTable, ...formattedTrayOrders].sort((a, b) => {
        const dateA = a.dateISO || a.date || '';
        const dateB = b.dateISO || b.date || '';
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      setOrders(allOrders);
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
      const { data, error } = await getSupabaseClient()
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

  // Get date range for delivery history based on preset
  const getDeliveryDateRange = () => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    let startDate: Date;
    let endDate: Date = today;

    switch (deliveryDatePreset) {
      case '7d':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 6);
        break;
      case '30d':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 29);
        break;
      case '90d':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 89);
        break;
      case 'month':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(today.getFullYear(), 0, 1);
        break;
      case 'custom':
        startDate = new Date(deliveryCustomStartDate);
        endDate = new Date(deliveryCustomEndDate);
        endDate.setHours(23, 59, 59, 999);
        break;
      default:
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 29);
    }

    startDate.setHours(0, 0, 0, 0);
    return { startDate, endDate };
  };

  const fetchDeliveryHistory = async () => {
    setDeliveryHistoryLoading(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

      const { startDate, endDate } = getDeliveryDateRange();
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      const { data, error } = await getSupabaseClient()
        .from('delivery_history')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .gte('delivery_date', startDateStr)
        .lte('delivery_date', endDateStr)
        .order('delivery_date', { ascending: false });

      if (error) {
        console.error('Error fetching delivery history:', error);
        setDeliveryHistory([]);
        return;
      }

      setDeliveryHistory(data || []);
    } catch (error) {
      console.error('Error fetching delivery history:', error);
      setDeliveryHistory([]);
    } finally {
      setDeliveryHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchCustomers();
  }, []);

  // Fetch delivery history when tab changes or date range changes
  useEffect(() => {
    if (activeTab === 'delivery-history') {
      fetchDeliveryHistory();
    }
  }, [activeTab, deliveryDatePreset, deliveryCustomStartDate, deliveryCustomEndDate]);

  // Group delivery history by date + customer
  const groupedDeliveryHistory = (): DeliveryGroup[] => {
    const groupMap = new Map<string, DeliveryGroup>();

    deliveryHistory.forEach((row) => {
      const key = `${row.delivery_date}-${row.customer_id}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          delivery_date: row.delivery_date,
          customer_name: row.customer_name,
          customer_id: row.customer_id,
          items: [],
          total_trays: 0,
          total_yield: 0,
          total_amount: 0,
        });
      }
      const group = groupMap.get(key)!;
      group.items.push(row);
      group.total_trays += Number(row.trays_delivered) || 0;
      group.total_yield += Number(row.total_yield_oz) || 0;
      group.total_amount += Number(row.line_total) || 0;
    });

    // Sort based on selected field and direction
    const groups = Array.from(groupMap.values());
    const multiplier = deliverySortDirection === 'asc' ? 1 : -1;

    return groups.sort((a, b) => {
      let compare = 0;
      switch (deliverySortField) {
        case 'date':
          compare = a.delivery_date.localeCompare(b.delivery_date);
          break;
        case 'customer':
          compare = a.customer_name.localeCompare(b.customer_name);
          break;
        case 'trays':
          compare = a.total_trays - b.total_trays;
          break;
        case 'yield':
          compare = a.total_yield - b.total_yield;
          break;
        case 'amount':
          compare = a.total_amount - b.total_amount;
          break;
      }
      return compare * multiplier;
    });
  };

  // Toggle expansion of a delivery group
  const toggleDeliveryExpansion = (key: string) => {
    setExpandedDeliveries((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  // Toggle sort field (clicking same field toggles direction)
  const toggleDeliverySort = (field: DeliverySortField) => {
    if (deliverySortField === field) {
      setDeliverySortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setDeliverySortField(field);
      setDeliverySortDirection('desc');
    }
  };

  // Calculate delivery history summary
  const deliverySummary = () => {
    const totalTrays = deliveryHistory.reduce((sum, row) => sum + (Number(row.trays_delivered) || 0), 0);
    const totalYield = deliveryHistory.reduce((sum, row) => sum + (Number(row.total_yield_oz) || 0), 0);
    const totalRevenue = deliveryHistory.reduce((sum, row) => sum + (Number(row.line_total) || 0), 0);
    const uniqueDates = new Set(deliveryHistory.map((row) => row.delivery_date)).size;
    const uniqueCustomers = new Set(deliveryHistory.map((row) => row.customer_id)).size;

    return { totalTrays, totalYield, totalRevenue, uniqueDates, uniqueCustomers };
  };

  const handleEditOrder = async (order: any) => {
    setEditingOrder(order);
    setIsEditDialogOpen(true);
    
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

      // Fetch full order details for editing
      const { data: traysData, error } = await getSupabaseClient()
        .from('trays')
        .select('*')
        .in('tray_id', order.trayIds)
        .eq('farm_uuid', farmUuid)
        .eq('customer_id', order.customer_id);

      if (error) {
        console.error('Error fetching order for editing:', error);
        return;
      }

      setEditingOrder({
        ...order,
        customer_id: order.customer_id?.toString() || 'none',
        trays: traysData || [],
      });
    } catch (error) {
      console.error('Error loading order for editing:', error);
    }
  };

  const handleUpdateOrder = async () => {
    if (!editingOrder) return;

    setUpdating(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

      const newCustomerId = editingOrder.customer_id && editingOrder.customer_id !== 'none' 
        ? parseInt(editingOrder.customer_id) 
        : null;

      // Update customer_id for all trays in the order
      const { error } = await getSupabaseClient()
        .from('trays')
        .update({ customer_id: newCustomerId })
        .in('tray_id', editingOrder.trayIds)
        .eq('farm_uuid', farmUuid);

      if (error) throw error;

      setIsEditDialogOpen(false);
      setEditingOrder(null);
      fetchOrders();
    } catch (error) {
      console.error('Error updating order:', error);
      alert('Failed to update order');
    } finally {
      setUpdating(false);
    }
  };

  const handleViewOrder = async (order: any) => {
    setViewingOrder(order);
    setIsViewDialogOpen(true);
    
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

      // Fetch full tray details for this order
      const { data: traysData, error } = await getSupabaseClient()
        .from('trays')
        .select(`
          *,
          recipes!inner(
            recipe_id,
            recipe_name,
            variety_name,
            variety_id,
            varieties!inner(varietyid, name)
          )
        `)
        .in('tray_id', order.trayIds)
        .eq('farm_uuid', farmUuid)
        .eq('customer_id', order.customer_id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching order details:', error);
        return;
      }

      // Fetch customer details
      const { data: customerData } = await getSupabaseClient()
        .from('customers')
        .select('*')
        .eq('customerid', order.customer_id)
        .eq('farm_uuid', farmUuid)
        .single();

      setOrderDetails({
        trays: traysData || [],
        customer: customerData,
      });
    } catch (error) {
      console.error('Error loading order details:', error);
    }
  };

  const handleAddOrder = async () => {
    if (!newOrder.customer_id || orderItems.length === 0) {
      alert('Please select a customer and add at least one order item');
      return;
    }

    setCreating(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);
      const { data: { user } } = await getSupabaseClient().auth.getUser();

      // Calculate total amount
      const totalAmount = orderItems.reduce((sum, item) => sum + (item.total_price || 0), 0);

      // Create order
      const { data: orderData, error: orderError } = await getSupabaseClient()
        .from('orders')
        .insert([{
          farm_uuid: farmUuid,
          customer_id: parseInt(newOrder.customer_id),
          order_date: newOrder.order_date,
          delivery_date: newOrder.delivery_date || null,
          order_type: newOrder.order_type,
          status: newOrder.status,
          total_amount: totalAmount,
          notes: newOrder.notes || null,
          created_by: user?.id || null,
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      if (orderData && orderItems.length > 0) {
        const itemsPayload = orderItems.map(item => ({
          order_id: orderData.order_id,
          product_id: item.product_id,
          variant_id: item.variant_id || null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          notes: item.notes || null,
        }));

        const { error: itemsError } = await getSupabaseClient()
          .from('order_items')
          .insert(itemsPayload);

        if (itemsError) throw itemsError;
      }

      // Reset form
      setNewOrder({
        customer_id: '',
        order_date: new Date().toISOString().split('T')[0],
        delivery_date: '',
        order_type: 'one-time',
        status: 'Pending',
        notes: '',
      });
      setOrderItems([]);
      setIsAddDialogOpen(false);
      fetchOrders();
    } catch (error) {
      console.error('Error creating order:', error);
      alert('Failed to create order');
    } finally {
      setCreating(false);
    }
  };

  // Toggle sort field for orders table
  const toggleOrderSort = (field: OrderSortField) => {
    if (orderSortField === field) {
      setOrderSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrderSortField(field);
      setOrderSortDirection('desc');
    }
  };

  // Filter and sort orders
  const sortedFilteredOrders = orders
    .filter(order =>
      order.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.orderId.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      const multiplier = orderSortDirection === 'asc' ? 1 : -1;
      let compare = 0;

      switch (orderSortField) {
        case 'orderId':
          compare = a.orderId.localeCompare(b.orderId);
          break;
        case 'customer':
          compare = a.customer.localeCompare(b.customer);
          break;
        case 'date':
          compare = (a.dateISO || '').localeCompare(b.dateISO || '');
          break;
        case 'type':
          compare = (a.order_type || '').localeCompare(b.order_type || '');
          break;
        case 'items':
          const aItems = a.isNewOrder ? (a.itemCount || 0) : (a.trayCount || 0);
          const bItems = b.isNewOrder ? (b.itemCount || 0) : (b.trayCount || 0);
          compare = aItems - bItems;
          break;
        case 'total':
          // Parse total from string like "$123.45" to number
          const aTotal = parseFloat((a.total || '$0').replace(/[$,]/g, '')) || 0;
          const bTotal = parseFloat((b.total || '$0').replace(/[$,]/g, '')) || 0;
          compare = aTotal - bTotal;
          break;
        case 'status':
          compare = (a.status || '').localeCompare(b.status || '');
          break;
      }
      return compare * multiplier;
    });

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
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Order</DialogTitle>
              <DialogDescription>
                Create a new order with products and variants
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="customer">Customer *</Label>
                  <Select
                    value={newOrder.customer_id}
                    onValueChange={(value) => setNewOrder({ ...newOrder, customer_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((customer) => (
                        <SelectItem key={customer.customer_id} value={customer.customer_id.toString()}>
                          {customer.customer_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="order_type">Order Type *</Label>
                  <Select
                    value={newOrder.order_type}
                    onValueChange={(value: any) => setNewOrder({ ...newOrder, order_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="one-time">One-time</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="bi-weekly">Bi-weekly</SelectItem>
                      <SelectItem value="standing">Standing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="order_date">Order Date *</Label>
                  <Input
                    id="order_date"
                    type="date"
                    value={newOrder.order_date}
                    onChange={(e) => setNewOrder({ ...newOrder, order_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="delivery_date">Delivery Date</Label>
                  <Input
                    id="delivery_date"
                    type="date"
                    value={newOrder.delivery_date}
                    onChange={(e) => setNewOrder({ ...newOrder, delivery_date: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="status">Status</Label>
                <Select
                  value={newOrder.status}
                  onValueChange={(value) => setNewOrder({ ...newOrder, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Confirmed">Confirmed</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={newOrder.notes}
                  onChange={(e) => setNewOrder({ ...newOrder, notes: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-2">
                  <Label>Order Items</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Add order item dialog would go here
                      alert('Order item management coming soon - for now, use the Trays page to assign trays to customers');
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Item
                  </Button>
                </div>
                {orderItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No items added yet</p>
                ) : (
                  <div className="space-y-2">
                    {orderItems.map((item, index) => (
                      <div key={index} className="flex justify-between items-center p-2 bg-muted rounded">
                        <span className="text-sm">{item.product_name} - {item.variant_name}</span>
                        <span className="text-sm font-semibold">${item.total_price?.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddOrder} disabled={creating || !newOrder.customer_id || orderItems.length === 0}>
                {creating ? 'Creating...' : 'Create Order'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'orders'
              ? 'text-emerald-600 border-b-2 border-emerald-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <ShoppingCart className="h-4 w-4 inline mr-2" />
          Orders
        </button>
        <button
          onClick={() => setActiveTab('delivery-history')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'delivery-history'
              ? 'text-emerald-600 border-b-2 border-emerald-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Truck className="h-4 w-4 inline mr-2" />
          Delivery History
        </button>
      </div>

      {/* Orders Tab Content */}
      {activeTab === 'orders' && (
        <>
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
              {[
                { field: 'orderId' as OrderSortField, label: 'Order ID' },
                { field: 'customer' as OrderSortField, label: 'Customer' },
                { field: 'date' as OrderSortField, label: 'Date' },
                { field: 'type' as OrderSortField, label: 'Type' },
                { field: 'items' as OrderSortField, label: 'Items' },
                { field: 'total' as OrderSortField, label: 'Total' },
                { field: 'status' as OrderSortField, label: 'Status' },
              ].map(({ field, label }) => (
                <TableHead
                  key={field}
                  className="cursor-pointer hover:bg-slate-50 select-none"
                  onClick={() => toggleOrderSort(field)}
                >
                  <div className="flex items-center gap-1">
                    {label}
                    {orderSortField === field && (
                      <ArrowUpDown className={`h-3 w-3 ${orderSortDirection === 'asc' ? 'rotate-180' : ''}`} />
                    )}
                  </div>
                </TableHead>
              ))}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedFilteredOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center">
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
              sortedFilteredOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">
                    <button
                      onClick={() => handleViewOrder(order)}
                      className="text-primary hover:underline cursor-pointer font-semibold"
                    >
                      {order.orderId}
                    </button>
                  </TableCell>
                  <TableCell>{order.customer}</TableCell>
                  <TableCell>{order.date}</TableCell>
                  <TableCell>
                    {order.order_type ? (
                      <Badge variant="outline">{order.order_type}</Badge>
                    ) : (
                      <Badge variant="secondary">Legacy</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {order.isNewOrder ? (
                      `${order.itemCount || 0} item(s)`
                    ) : (
                      `${order.trayCount || 0} tray(s)`
                    )}
                  </TableCell>
                  <TableCell className="font-semibold">{order.total}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(order.status)}>
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleEditOrder(order)}
                        type="button"
                      >
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
        </>
      )}

      {/* Delivery History Tab Content */}
      {activeTab === 'delivery-history' && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Deliveries</div>
                <div className="text-2xl font-bold">{deliverySummary().uniqueDates}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Customers</div>
                <div className="text-2xl font-bold">{deliverySummary().uniqueCustomers}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Total Trays</div>
                <div className="text-2xl font-bold">{deliverySummary().totalTrays}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Total Yield</div>
                <div className="text-2xl font-bold">{deliverySummary().totalYield.toFixed(1)} oz</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Revenue</div>
                <div className="text-2xl font-bold text-emerald-600">${deliverySummary().totalRevenue.toFixed(2)}</div>
              </CardContent>
            </Card>
          </div>

          {/* Date Range Filter and Sort Controls */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Date Range:</Label>
              <Select value={deliveryDatePreset} onValueChange={(value) => setDeliveryDatePreset(value as DateRangePreset)}>
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
            </div>
            {deliveryDatePreset === 'custom' && (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={deliveryCustomStartDate}
                  onChange={(e) => setDeliveryCustomStartDate(e.target.value)}
                  className="w-[140px]"
                />
                <span className="text-muted-foreground text-sm">to</span>
                <Input
                  type="date"
                  value={deliveryCustomEndDate}
                  onChange={(e) => setDeliveryCustomEndDate(e.target.value)}
                  className="w-[140px]"
                />
              </div>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <Label className="text-sm font-medium">Sort by:</Label>
              <div className="flex gap-1">
                {[
                  { field: 'date' as DeliverySortField, label: 'Date' },
                  { field: 'customer' as DeliverySortField, label: 'Customer' },
                  { field: 'trays' as DeliverySortField, label: 'Trays' },
                  { field: 'yield' as DeliverySortField, label: 'Yield' },
                  { field: 'amount' as DeliverySortField, label: 'Amount' },
                ].map(({ field, label }) => (
                  <Button
                    key={field}
                    variant={deliverySortField === field ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleDeliverySort(field)}
                    className="text-xs h-8"
                  >
                    {label}
                    {deliverySortField === field && (
                      <ArrowUpDown className={`ml-1 h-3 w-3 ${deliverySortDirection === 'asc' ? 'rotate-180' : ''}`} />
                    )}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Delivery History Table */}
          {deliveryHistoryLoading ? (
            <div className="rounded-md border bg-card p-8 text-center">
              <p className="text-muted-foreground">Loading delivery history...</p>
            </div>
          ) : groupedDeliveryHistory().length === 0 ? (
            <div className="rounded-md border bg-card p-8 text-center">
              <Truck className="h-8 w-8 mx-auto mb-2 opacity-50 text-muted-foreground" />
              <p className="text-muted-foreground">No deliveries found for the selected date range.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {groupedDeliveryHistory().map((group) => {
                const groupKey = `${group.delivery_date}-${group.customer_id}`;
                const isExpanded = expandedDeliveries.has(groupKey);
                return (
                  <Card key={groupKey}>
                    <CardHeader
                      className="py-3 px-4 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => toggleDeliveryExpansion(groupKey)}
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-slate-500 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-500 flex-shrink-0" />
                        )}
                        <div className="flex flex-1 flex-col md:flex-row md:items-center md:justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-900">{group.customer_name}</p>
                            <p className="text-sm text-muted-foreground">
                              <Calendar className="h-3 w-3 inline mr-1" />
                              {new Date(group.delivery_date + 'T00:00:00').toLocaleDateString('en-US', {
                                weekday: 'short',
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                              <span className="ml-2 text-xs">({group.items.length} {group.items.length === 1 ? 'item' : 'items'})</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-muted-foreground">
                              {group.total_trays} {group.total_trays === 1 ? 'tray' : 'trays'}
                            </span>
                            <span className="text-muted-foreground">
                              {group.total_yield.toFixed(1)} oz
                            </span>
                            <span className="font-semibold text-emerald-600">
                              ${group.total_amount.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    {isExpanded && (
                      <CardContent className="p-0 border-t">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50/50">
                              <TableHead className="text-xs">Recipe/Variety</TableHead>
                              <TableHead className="text-xs text-right">Trays</TableHead>
                              <TableHead className="text-xs text-right">Yield (oz)</TableHead>
                              <TableHead className="text-xs text-right">Unit Price</TableHead>
                              <TableHead className="text-xs text-right">Line Total</TableHead>
                              <TableHead className="text-xs">Standing Order</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.items.map((item, idx) => (
                              <TableRow key={`${item.recipe_id}-${idx}`}>
                                <TableCell className="font-medium">{item.recipe_name}</TableCell>
                                <TableCell className="text-right">{item.trays_delivered}</TableCell>
                                <TableCell className="text-right">
                                  {item.total_yield_oz ? Number(item.total_yield_oz).toFixed(1) : '-'}
                                </TableCell>
                                <TableCell className="text-right">
                                  {item.unit_price ? `$${Number(item.unit_price).toFixed(2)}` : '-'}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {item.line_total ? `$${Number(item.line_total).toFixed(2)}` : '-'}
                                </TableCell>
                                <TableCell>
                                  {item.standing_order_id ? (
                                    <Badge variant="outline" className="text-xs">
                                      {item.order_name || `SO-${item.standing_order_id}`}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">-</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* View Order Details Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600" />
              Order Details
            </DialogTitle>
            <DialogDescription>
              View detailed information about this order
            </DialogDescription>
          </DialogHeader>
          {viewingOrder && orderDetails && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-muted-foreground">Order ID</Label>
                  <p className="text-base font-semibold">{viewingOrder.orderId}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    Order Date
                  </Label>
                  <p className="text-base">{viewingOrder.date}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-muted-foreground">Customer</Label>
                  <p className="text-base">{viewingOrder.customer}</p>
                  {orderDetails.customer && (
                    <div className="text-sm text-muted-foreground mt-1">
                      {orderDetails.customer.email && <div>Email: {orderDetails.customer.email}</div>}
                      {orderDetails.customer.contactnumber && <div>Phone: {orderDetails.customer.contactnumber}</div>}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-muted-foreground">Status</Label>
                  <div className="pt-1">
                    <Badge variant={getStatusBadgeVariant(viewingOrder.status)}>
                      {viewingOrder.status}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-muted-foreground">Total Trays</Label>
                  <p className="text-base">{viewingOrder.trayCount || 0}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <DollarSign className="h-4 w-4" />
                    Total Amount
                  </Label>
                  <p className="text-base font-semibold">{viewingOrder.total}</p>
                </div>
              </div>

              {orderDetails.trays && orderDetails.trays.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Trays in Order</Label>
                  <div className="space-y-2 max-h-60 overflow-y-auto border rounded p-3">
                    {orderDetails.trays.map((tray: any) => {
                      const varietyName = tray.recipes?.varieties?.name || tray.recipes?.variety_name || 'Unknown';
                      return (
                        <div key={tray.tray_id} className="flex items-start gap-3 p-2 border rounded bg-gray-50">
                          <div className="flex-1">
                            <p className="font-medium text-sm">Tray {tray.tray_unique_id || tray.tray_id}</p>
                            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                              <span>Recipe: {tray.recipes?.recipe_name || 'Unknown'}</span>
                              <span>Variety: {varietyName}</span>
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                              {tray.sow_date && (
                                <span>Sow Date: {new Date(tray.sow_date).toLocaleDateString()}</span>
                              )}
                              {tray.harvest_date && (
                                <span className="text-green-600">Harvested: {new Date(tray.harvest_date).toLocaleDateString()}</span>
                              )}
                              {tray.yield && (
                                <span>Yield: {tray.yield}g</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Order Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Order</DialogTitle>
            <DialogDescription>
              Update order information
            </DialogDescription>
          </DialogHeader>
          {editingOrder && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-order-id">Order ID</Label>
                <Input
                  id="edit-order-id"
                  value={editingOrder.orderId || ''}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-customer">Customer</Label>
                <Select 
                  value={editingOrder.customer_id || 'none'} 
                  onValueChange={(value) => setEditingOrder({ ...editingOrder, customer_id: value === 'none' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {customers.map((customer) => (
                      <SelectItem key={customer.customer_id} value={customer.customer_id.toString()}>
                        {customer.customer_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-tray-count">Trays in Order</Label>
                <Input
                  id="edit-tray-count"
                  value={`${editingOrder.trayCount || 0} tray(s)`}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-total">Total Amount</Label>
                <Input
                  id="edit-total"
                  value={editingOrder.total || '$0.00'}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="text-sm text-muted-foreground p-3 bg-blue-50 rounded border border-blue-200">
                <p className="font-semibold text-blue-900 mb-1">Note:</p>
                <p className="text-blue-800">
                  Changing the customer will reassign all trays in this order to the new customer. 
                  This will update the order grouping.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateOrder} disabled={updating}>
              {updating ? 'Updating...' : 'Update Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrdersPage;
