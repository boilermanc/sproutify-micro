import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Edit, Building2, Mail, Phone, MapPin, Plus, Search, User, Calendar, FileText, DollarSign } from 'lucide-react';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

interface Customer {
  customer_id: number;
  customer_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  farm_uuid: string;
  delivery_instructions?: string | null;
  payment_instructions?: string | null;
  notes?: string | null;
  preferred_delivery_days?: string[] | null;
  delivery_address?: string | null;
}

const CustomersPage = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleViewCustomer = (customer: Customer) => {
    setViewingCustomer(customer);
    setIsViewDialogOpen(true);
  };

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer({
      ...customer,
      customer_id: customer.customer_id,
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateCustomer = async () => {
    if (!editingCustomer) return;

    setUpdating(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

      // Map to actual DB column names
      const updatePayload: any = {
        name: editingCustomer.customer_name,
        email: editingCustomer.email || null,
        contactnumber: editingCustomer.phone || null,
        billingstreet: editingCustomer.address?.split(',')[0] || null,
        billingcity: editingCustomer.address?.split(',')[1]?.trim() || null,
        billingstate: editingCustomer.address?.split(',')[2]?.trim()?.split(' ')[0] || null,
        billingpostalcode: editingCustomer.address?.split(',')[2]?.trim()?.split(' ')[1] || null,
        delivery_instructions: editingCustomer.delivery_instructions || null,
        payment_instructions: editingCustomer.payment_instructions || null,
        notes: editingCustomer.notes || null,
        preferred_delivery_days: editingCustomer.preferred_delivery_days || null,
        delivery_address: editingCustomer.delivery_address || null,
      };

      const { error } = await supabase
        .from('customers')
        .update(updatePayload)
        .eq('customerid', editingCustomer.customer_id)
        .eq('farm_uuid', farmUuid);

      if (error) throw error;

      setIsEditDialogOpen(false);
      setEditingCustomer(null);
      fetchCustomers();
    } catch (error) {
      console.error('Error updating customer:', error);
      alert('Failed to update customer');
    } finally {
      setUpdating(false);
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

      if (error) throw error;

      // Normalize field names for code compatibility
      // Map customerid -> customer_id, name -> customer_name
      const normalized = (data || []).map((c: any) => ({
        ...c,
        customer_id: c.customerid ?? c.customer_id,
        customer_name: c.name ?? c.customer_name ?? '',
        phone: c.contactnumber ?? c.phone ?? null,
        address: c.billingstreet 
          ? `${c.billingstreet}${c.billingcity ? `, ${c.billingcity}` : ''}${c.billingstate ? `, ${c.billingstate}` : ''}${c.billingpostalcode ? ` ${c.billingpostalcode}` : ''}`
          : (c.address ?? null),
        delivery_instructions: c.delivery_instructions ?? null,
        payment_instructions: c.payment_instructions ?? null,
        notes: c.notes ?? null,
        preferred_delivery_days: c.preferred_delivery_days ?? null,
        delivery_address: c.delivery_address ?? null,
      })).sort((a: any, b: any) => {
        const nameA = (a.customer_name || '').toLowerCase();
        const nameB = (b.customer_name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });

      setCustomers(normalized);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter(customer => 
    customer.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (customer.email && customer.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
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
          <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground">Manage your customer relationships</p>
        </div>
        <Button onClick={() => alert('Create Customer feature coming soon!')}>
          <Plus className="mr-2 h-4 w-4" />
          Add Customer
        </Button>
      </div>

      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact Info</TableHead>
                <TableHead>Address</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Building2 className="h-8 w-8 mb-2 opacity-50" />
                      <p>No customers found.</p>
                      <p className="text-sm">Add your first customer to get started!</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredCustomers.map((customer) => (
                  <TableRow key={customer.customer_id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {customer.customer_name.charAt(0)}
                        </div>
                        <button
                          onClick={() => handleViewCustomer(customer)}
                          className="text-primary hover:underline cursor-pointer font-semibold"
                        >
                          {customer.customer_name}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {customer.email && (
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Mail className="mr-2 h-3 w-3" />
                            {customer.email}
                          </div>
                        )}
                        {customer.phone && (
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Phone className="mr-2 h-3 w-3" />
                            {customer.phone}
                          </div>
                        )}
                        {!customer.email && !customer.phone && <span className="text-muted-foreground italic">No contact info</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {customer.address ? (
                        <div className="flex items-center text-sm text-muted-foreground">
                          <MapPin className="mr-2 h-3 w-3" />
                          {customer.address}
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">No address</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleEditCustomer(customer)}
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
        </CardContent>
      </Card>

      {/* View Customer Details Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-blue-600" />
              Customer Details
            </DialogTitle>
            <DialogDescription>
              View detailed information about this customer
            </DialogDescription>
          </DialogHeader>
          {viewingCustomer && (
            <div className="space-y-4 py-4">
              <div className="grid gap-2">
                <Label className="text-sm font-semibold text-muted-foreground">Name</Label>
                <p className="text-base font-semibold">{viewingCustomer.customer_name}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {viewingCustomer.email && (
                  <div className="space-y-1">
                    <Label className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                      <Mail className="h-4 w-4" />
                      Email
                    </Label>
                    <p className="text-base">{viewingCustomer.email}</p>
                  </div>
                )}
                {viewingCustomer.phone && (
                  <div className="space-y-1">
                    <Label className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                      <Phone className="h-4 w-4" />
                      Phone
                    </Label>
                    <p className="text-base">{viewingCustomer.phone}</p>
                  </div>
                )}
              </div>

              {viewingCustomer.address && (
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    Billing Address
                  </Label>
                  <p className="text-base">{viewingCustomer.address}</p>
                </div>
              )}

              {viewingCustomer.delivery_address && (
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    Delivery Address
                  </Label>
                  <p className="text-base">{viewingCustomer.delivery_address}</p>
                </div>
              )}

              {viewingCustomer.preferred_delivery_days && viewingCustomer.preferred_delivery_days.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    Preferred Delivery Days
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {viewingCustomer.preferred_delivery_days.map((day, index) => (
                      <Badge key={index} variant="secondary">{day}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {viewingCustomer.delivery_instructions && (
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <FileText className="h-4 w-4" />
                    Delivery Instructions
                  </Label>
                  <p className="text-base">{viewingCustomer.delivery_instructions}</p>
                </div>
              )}

              {viewingCustomer.payment_instructions && (
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <DollarSign className="h-4 w-4" />
                    Payment Instructions
                  </Label>
                  <p className="text-base">{viewingCustomer.payment_instructions}</p>
                </div>
              )}

              {viewingCustomer.notes && (
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-muted-foreground">Notes</Label>
                  <p className="text-base">{viewingCustomer.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
            {viewingCustomer && (
              <Button onClick={() => {
                setIsViewDialogOpen(false);
                handleEditCustomer(viewingCustomer);
              }}>
                Edit Customer
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>
              Update customer information
            </DialogDescription>
          </DialogHeader>
          {editingCustomer && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Name *</Label>
                <Input
                  id="edit-name"
                  value={editingCustomer.customer_name || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, customer_name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={editingCustomer.email || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, email: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-phone">Phone</Label>
                  <Input
                    id="edit-phone"
                    type="tel"
                    value={editingCustomer.phone || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-address">Billing Address</Label>
                <Textarea
                  id="edit-address"
                  value={editingCustomer.address || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, address: e.target.value })}
                  placeholder="Street, City, State, Postal Code"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-delivery-address">Delivery Address</Label>
                <Textarea
                  id="edit-delivery-address"
                  value={editingCustomer.delivery_address || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, delivery_address: e.target.value })}
                  placeholder="Leave blank to use billing address"
                />
              </div>

              <div className="grid gap-2">
                <Label>Preferred Delivery Days</Label>
                <div className="grid grid-cols-2 gap-2">
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => {
                    const isSelected = editingCustomer.preferred_delivery_days?.includes(day) || false;
                    return (
                      <Button
                        key={day}
                        type="button"
                        variant={isSelected ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          const currentDays = editingCustomer.preferred_delivery_days || [];
                          const newDays = isSelected
                            ? currentDays.filter((d: string) => d !== day)
                            : [...currentDays, day];
                          setEditingCustomer({ ...editingCustomer, preferred_delivery_days: newDays });
                        }}
                      >
                        {day}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-delivery-instructions">Delivery Instructions</Label>
                <Textarea
                  id="edit-delivery-instructions"
                  value={editingCustomer.delivery_instructions || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, delivery_instructions: e.target.value })}
                  placeholder="Special delivery instructions..."
                  rows={2}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-payment-instructions">Payment Instructions</Label>
                <Textarea
                  id="edit-payment-instructions"
                  value={editingCustomer.payment_instructions || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, payment_instructions: e.target.value })}
                  placeholder="Payment preferences and instructions..."
                  rows={2}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={editingCustomer.notes || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, notes: e.target.value })}
                  placeholder="General notes about this customer..."
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateCustomer} disabled={updating || !editingCustomer?.customer_name}>
              {updating ? 'Updating...' : 'Update Customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomersPage;
