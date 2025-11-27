import { useState, useEffect } from 'react';
import { Repeat, Calendar, Plus, Edit, Trash2, Search, Package } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import EmptyState from '../components/onboarding/EmptyState';

interface StandingOrder {
  standing_order_id: number;
  order_name: string;
  customer_id: number;
  customer_name?: string;
  frequency: 'weekly' | 'bi-weekly';
  delivery_days: string[];
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  items?: StandingOrderItem[];
}

interface StandingOrderItem {
  item_id: number;
  product_id: number;
  variant_id: number | null;
  quantity: number;
  product_name?: string;
  variant_name?: string;
}

const StandingOrdersPage = () => {
  const [standingOrders, setStandingOrders] = useState<StandingOrder[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<StandingOrder | null>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [newOrder, setNewOrder] = useState({
    order_name: '',
    customer_id: '',
    frequency: 'weekly' as 'weekly' | 'bi-weekly',
    delivery_days: [] as string[],
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    notes: '',
  });
  const [orderItems, setOrderItems] = useState<any[]>([]);

  useEffect(() => {
    fetchStandingOrders();
    fetchCustomers();
    fetchProducts();
  }, []);

  const fetchStandingOrders = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      const { data, error } = await supabase
        .from('standing_orders')
        .select(`
          *,
          customers!inner(customerid, name)
        `)
        .eq('farm_uuid', farmUuid)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch items for each standing order
      const ordersWithItems = await Promise.all(
        (data || []).map(async (order: any) => {
          const { data: itemsData } = await supabase
            .from('standing_order_items')
            .select(`
              *,
              products(product_id, product_name),
              product_variants(variant_id, variant_name)
            `)
            .eq('standing_order_id', order.standing_order_id);

          return {
            ...order,
            customer_name: order.customers?.name || 'Unknown',
            items: itemsData || [],
          };
        })
      );

      setStandingOrders(ordersWithItems);
    } catch (error) {
      console.error('Error fetching standing orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      const { data, error } = await supabase
        .from('customers')
        .select('customerid, name')
        .eq('farm_uuid', farmUuid)
        .order('name', { ascending: true });

      if (error) throw error;

      setCustomers((data || []).map((c: any) => ({
        customer_id: c.customerid,
        customer_name: c.name,
      })));
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      const { data, error } = await supabase
        .from('products')
        .select('product_id, product_name')
        .eq('farm_uuid', farmUuid)
        .eq('is_active', true)
        .order('product_name', { ascending: true });

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const handleAddStandingOrder = async () => {
    if (!newOrder.order_name || !newOrder.customer_id || newOrder.delivery_days.length === 0 || orderItems.length === 0) {
      alert('Please fill in all required fields and add at least one item');
      return;
    }

    setCreating(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);
      const { data: { user } } = await supabase.auth.getUser();

      // Create standing order
      const { data: orderData, error: orderError } = await supabase
        .from('standing_orders')
        .insert([{
          farm_uuid: farmUuid,
          customer_id: parseInt(newOrder.customer_id),
          order_name: newOrder.order_name,
          frequency: newOrder.frequency,
          delivery_days: newOrder.delivery_days,
          start_date: newOrder.start_date,
          end_date: newOrder.end_date || null,
          is_active: true,
          notes: newOrder.notes || null,
          created_by: user?.id || null,
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      // Create standing order items
      if (orderData && orderItems.length > 0) {
        const itemsPayload = orderItems.map(item => ({
          standing_order_id: orderData.standing_order_id,
          product_id: item.product_id,
          variant_id: item.variant_id || null,
          quantity: item.quantity,
          notes: item.notes || null,
        }));

        const { error: itemsError } = await supabase
          .from('standing_order_items')
          .insert(itemsPayload);

        if (itemsError) throw itemsError;
      }

      // Reset form
      setNewOrder({
        order_name: '',
        customer_id: '',
        frequency: 'weekly',
        delivery_days: [],
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        notes: '',
      });
      setOrderItems([]);
      setIsAddDialogOpen(false);
      fetchStandingOrders();
    } catch (error) {
      console.error('Error creating standing order:', error);
      alert('Failed to create standing order');
    } finally {
      setCreating(false);
    }
  };

  const handleEditStandingOrder = (order: StandingOrder) => {
    setEditingOrder(order);
    setIsEditDialogOpen(true);
  };

  const handleUpdateStandingOrder = async () => {
    if (!editingOrder) return;

    setUpdating(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      const { error } = await supabase
        .from('standing_orders')
        .update({
          order_name: editingOrder.order_name,
          frequency: editingOrder.frequency,
          delivery_days: editingOrder.delivery_days,
          start_date: editingOrder.start_date,
          end_date: editingOrder.end_date || null,
          notes: editingOrder.notes || null,
          is_active: editingOrder.is_active,
        })
        .eq('standing_order_id', editingOrder.standing_order_id)
        .eq('farm_uuid', farmUuid);

      if (error) throw error;

      setIsEditDialogOpen(false);
      setEditingOrder(null);
      fetchStandingOrders();
    } catch (error) {
      console.error('Error updating standing order:', error);
      alert('Failed to update standing order');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteStandingOrder = async (order: StandingOrder) => {
    if (!confirm(`Are you sure you want to delete "${order.order_name}"?`)) return;

    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // Soft delete
      const { error } = await supabase
        .from('standing_orders')
        .update({ is_active: false })
        .eq('standing_order_id', order.standing_order_id)
        .eq('farm_uuid', farmUuid);

      if (error) throw error;

      fetchStandingOrders();
    } catch (error) {
      console.error('Error deleting standing order:', error);
      alert('Failed to delete standing order');
    }
  };

  const toggleDeliveryDay = (day: string, isNew: boolean = true) => {
    if (isNew) {
      const days = newOrder.delivery_days.includes(day)
        ? newOrder.delivery_days.filter(d => d !== day)
        : [...newOrder.delivery_days, day];
      setNewOrder({ ...newOrder, delivery_days: days });
    } else if (editingOrder) {
      const days = editingOrder.delivery_days.includes(day)
        ? editingOrder.delivery_days.filter(d => d !== day)
        : [...editingOrder.delivery_days, day];
      setEditingOrder({ ...editingOrder, delivery_days: days });
    }
  };

  const filteredOrders = standingOrders.filter(order =>
    order.order_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.customer_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">Loading standing orders...</div>
      </div>
    );
  }

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Standing Orders</h1>
          <p className="text-gray-600 mt-1">Manage recurring customer orders</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Standing Order
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Standing Order</DialogTitle>
              <DialogDescription>
                Set up a recurring order that will generate orders automatically
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="order_name">Order Name *</Label>
                <Input
                  id="order_name"
                  value={newOrder.order_name}
                  onChange={(e) => setNewOrder({ ...newOrder, order_name: e.target.value })}
                  placeholder="e.g., Weekly Mix Order"
                />
              </div>

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
                  <Label htmlFor="frequency">Frequency *</Label>
                  <Select
                    value={newOrder.frequency}
                    onValueChange={(value: 'weekly' | 'bi-weekly') => setNewOrder({ ...newOrder, frequency: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="bi-weekly">Bi-weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Delivery Days *</Label>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {daysOfWeek.map((day) => (
                    <Button
                      key={day}
                      type="button"
                      variant={newOrder.delivery_days.includes(day) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleDeliveryDay(day)}
                    >
                      {day.slice(0, 3)}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="start_date">Start Date *</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={newOrder.start_date}
                    onChange={(e) => setNewOrder({ ...newOrder, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="end_date">End Date (Optional)</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={newOrder.end_date}
                    onChange={(e) => setNewOrder({ ...newOrder, end_date: e.target.value })}
                  />
                </div>
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
                    onClick={() => alert('Order item management coming soon')}
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
                        <span className="text-sm">{item.product_name} - Qty: {item.quantity}</span>
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
              <Button onClick={handleAddStandingOrder} disabled={creating}>
                {creating ? 'Creating...' : 'Create Standing Order'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search standing orders..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No standing orders found"
          description={searchTerm ? "Try adjusting your search" : "Get started by creating your first standing order"}
          actionLabel="Add Standing Order"
          onAction={() => setIsAddDialogOpen(true)}
        />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order Name</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Delivery Days</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((order) => (
                <TableRow key={order.standing_order_id}>
                  <TableCell className="font-medium">{order.order_name}</TableCell>
                  <TableCell>{order.customer_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{order.frequency}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {order.delivery_days.map((day, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {day.slice(0, 3)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{order.items?.length || 0} item(s)</TableCell>
                  <TableCell>
                    <Badge variant={order.is_active ? 'default' : 'secondary'}>
                      {order.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditStandingOrder(order)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteStandingOrder(order)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Standing Order</DialogTitle>
            <DialogDescription>
              Update standing order information
            </DialogDescription>
          </DialogHeader>
          {editingOrder && (
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="edit_order_name">Order Name *</Label>
                <Input
                  id="edit_order_name"
                  value={editingOrder.order_name}
                  onChange={(e) => setEditingOrder({ ...editingOrder, order_name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit_frequency">Frequency *</Label>
                  <Select
                    value={editingOrder.frequency}
                    onValueChange={(value: 'weekly' | 'bi-weekly') => setEditingOrder({ ...editingOrder, frequency: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="bi-weekly">Bi-weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Delivery Days *</Label>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {daysOfWeek.map((day) => (
                    <Button
                      key={day}
                      type="button"
                      variant={editingOrder.delivery_days.includes(day) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleDeliveryDay(day, false)}
                    >
                      {day.slice(0, 3)}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit_start_date">Start Date *</Label>
                  <Input
                    id="edit_start_date"
                    type="date"
                    value={editingOrder.start_date}
                    onChange={(e) => setEditingOrder({ ...editingOrder, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit_end_date">End Date</Label>
                  <Input
                    id="edit_end_date"
                    type="date"
                    value={editingOrder.end_date || ''}
                    onChange={(e) => setEditingOrder({ ...editingOrder, end_date: e.target.value || null })}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="edit_notes">Notes</Label>
                <Textarea
                  id="edit_notes"
                  value={editingOrder.notes || ''}
                  onChange={(e) => setEditingOrder({ ...editingOrder, notes: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateStandingOrder} disabled={updating}>
              {updating ? 'Updating...' : 'Update Standing Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StandingOrdersPage;

