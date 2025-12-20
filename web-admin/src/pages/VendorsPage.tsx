import { useState, useEffect } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient';
import { Edit, Truck, Plus, Search, Building2, Mail, Phone, MapPin, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

const VendorsPage = () => {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [viewingVendor, setViewingVendor] = useState<any>(null);
  const [editingVendor, setEditingVendor] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [newVendor, setNewVendor] = useState({
    name: '',
    email: '',
    phone: '',
    street: '',
    city: '',
    state: '',
    postalcode: '',
    website: '',
    notes: '',
  });

  const fetchVendors = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // Actual DB columns likely: vendorid, vendorname (not vendor_id, vendor_name)
      const { data, error } = await getSupabaseClient()
        .from('vendors')
        .select('*')
        .eq('farm_uuid', farmUuid);

      if (error) {
        console.error('Error fetching vendors:', error);
        // Fallback to empty array instead of mock data
        setVendors([]);
        return;
      }

      // Normalize field names for code compatibility
      // Actual DB columns: vendorid, name (not vendor_id, vendor_name)
      const normalized = (data || []).map((v: any) => ({
        ...v,
        vendor_id: v.vendorid ?? v.vendor_id, // Map for compatibility
        vendor_name: v.name ?? v.vendor_name ?? '', // Map name to vendor_name
      })).sort((a: any, b: any) => {
        const nameA = (a.vendor_name || '').toLowerCase();
        const nameB = (b.vendor_name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });

      setVendors(normalized);
    } catch (error) {
      console.error('Error fetching vendors:', error);
      setVendors([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  const handleAddVendor = async () => {
    if (!newVendor.name) return;

    setCreating(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

      // Map to actual DB column names: vendorid, name
      const payload: any = {
        name: newVendor.name, // Actual column: name
        email: newVendor.email || null,
        phone: newVendor.phone || null,
        street: newVendor.street || null,
        city: newVendor.city || null,
        state: newVendor.state || null,
        postalcode: newVendor.postalcode || null,
        website: newVendor.website || null,
        notes: newVendor.notes || null,
        farm_uuid: farmUuid,
        is_active: true,
      };

      const { error } = await getSupabaseClient()
        .from('vendors')
        .insert([payload]);

      if (error) throw error;

      setNewVendor({
        name: '',
        email: '',
        phone: '',
        street: '',
        city: '',
        state: '',
        postalcode: '',
        website: '',
        notes: '',
      });
      setIsAddDialogOpen(false);
      fetchVendors();
    } catch (error) {
      console.error('Error creating vendor:', error);
      alert('Failed to create vendor');
    } finally {
      setCreating(false);
    }
  };

  const handleViewVendor = (vendor: any) => {
    setViewingVendor(vendor);
    setIsViewDialogOpen(true);
  };

  const handleEditVendor = (vendor: any) => {
    setEditingVendor({
      ...vendor,
      name: vendor.vendor_name || vendor.name || '',
      street: vendor.street || '',
      city: vendor.city || '',
      state: vendor.state || '',
      postalcode: vendor.postalcode || '',
      website: vendor.website || '',
      notes: vendor.notes || '',
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateVendor = async () => {
    if (!editingVendor) return;

    setUpdating(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

      const updatePayload: any = {
        name: editingVendor.name,
        email: editingVendor.email || null,
        phone: editingVendor.phone || null,
        street: editingVendor.street || null,
        city: editingVendor.city || null,
        state: editingVendor.state || null,
        postalcode: editingVendor.postalcode || null,
        website: editingVendor.website || null,
        notes: editingVendor.notes || null,
        is_active: editingVendor.is_active !== false,
      };

      const { error } = await getSupabaseClient()
        .from('vendors')
        .update(updatePayload)
        .eq('vendorid', editingVendor.vendor_id || editingVendor.vendorid)
        .eq('farm_uuid', farmUuid);

      if (error) throw error;

      setIsEditDialogOpen(false);
      setEditingVendor(null);
      fetchVendors();
    } catch (error) {
      console.error('Error updating vendor:', error);
      alert('Failed to update vendor');
    } finally {
      setUpdating(false);
    }
  };

  const filteredVendors = vendors.filter(vendor => {
    const vendorName = vendor.vendor_name || vendor.name || '';
    return vendorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
           (vendor.email && vendor.email.toLowerCase().includes(searchTerm.toLowerCase()));
  });

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Vendors</h1>
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
          <h1 className="text-3xl font-bold tracking-tight">Vendors</h1>
          <p className="text-muted-foreground">Manage your suppliers and vendors</p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Vendor
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Add New Vendor</DialogTitle>
              <DialogDescription>
                Add a new supplier or vendor to your list.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Vendor Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Seed Supply Co."
                  value={newVendor.name}
                  onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="contact@vendor.com"
                  value={newVendor.email}
                  onChange={(e) => setNewVendor({ ...newVendor, email: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={newVendor.phone}
                  onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="street">Street Address</Label>
                <Input
                  id="street"
                  placeholder="123 Main St"
                  value={newVendor.street}
                  onChange={(e) => setNewVendor({ ...newVendor, street: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  placeholder="City"
                  value={newVendor.city}
                  onChange={(e) => setNewVendor({ ...newVendor, city: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    placeholder="State"
                    value={newVendor.state}
                    onChange={(e) => setNewVendor({ ...newVendor, state: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postalcode">Postal Code</Label>
                  <Input
                    id="postalcode"
                    placeholder="12345"
                    value={newVendor.postalcode}
                    onChange={(e) => setNewVendor({ ...newVendor, postalcode: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  type="url"
                  placeholder="https://vendor.com"
                  value={newVendor.website}
                  onChange={(e) => setNewVendor({ ...newVendor, website: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  placeholder="Additional notes about this vendor"
                  value={newVendor.notes}
                  onChange={(e) => setNewVendor({ ...newVendor, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddVendor} disabled={creating || !newVendor.name}>
                {creating ? 'Creating...' : 'Create Vendor'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search vendors..."
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
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredVendors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <Truck className="h-8 w-8 mb-2 opacity-50" />
                    <p>No vendors found.</p>
                    {searchTerm && (
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => setSearchTerm('')}>
                        Clear Search
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredVendors.map((vendor) => {
                const vendorName = vendor.vendor_name || vendor.name || '';
                const location = [vendor.city, vendor.state].filter(Boolean).join(', ') || '-';
                return (
                  <TableRow key={vendor.vendor_id || vendor.vendorid}>
                    <TableCell className="font-medium">
                      <button
                        onClick={() => handleViewVendor(vendor)}
                        className="text-primary hover:underline cursor-pointer font-semibold"
                      >
                        {vendorName}
                      </button>
                    </TableCell>
                    <TableCell>{vendor.email || '-'}</TableCell>
                    <TableCell>{vendor.phone || '-'}</TableCell>
                    <TableCell>{location}</TableCell>
                    <TableCell>
                      <Badge variant={(vendor.is_active !== false) ? 'default' : 'secondary'} className={(vendor.is_active !== false) ? 'bg-green-500 hover:bg-green-600' : ''}>
                        {(vendor.is_active !== false) ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleEditVendor(vendor)}
                          type="button"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* View Vendor Details Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              Vendor Details
            </DialogTitle>
            <DialogDescription>
              View detailed information about this vendor
            </DialogDescription>
          </DialogHeader>
          {viewingVendor && (
            <div className="space-y-4 py-4">
              <div className="grid gap-2">
                <Label className="text-sm font-semibold text-muted-foreground">Name</Label>
                <p className="text-base font-semibold">{viewingVendor.vendor_name || viewingVendor.name}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {viewingVendor.email && (
                  <div className="space-y-1">
                    <Label className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                      <Mail className="h-4 w-4" />
                      Email
                    </Label>
                    <p className="text-base">{viewingVendor.email}</p>
                  </div>
                )}
                {viewingVendor.phone && (
                  <div className="space-y-1">
                    <Label className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                      <Phone className="h-4 w-4" />
                      Phone
                    </Label>
                    <p className="text-base">{viewingVendor.phone}</p>
                  </div>
                )}
              </div>

              {(viewingVendor.street || viewingVendor.city || viewingVendor.state) && (
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    Address
                  </Label>
                  <p className="text-base">
                    {[viewingVendor.street, viewingVendor.city, viewingVendor.state, viewingVendor.postalcode]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                </div>
              )}

              {viewingVendor.website && (
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <Globe className="h-4 w-4" />
                    Website
                  </Label>
                  <a href={viewingVendor.website} target="_blank" rel="noopener noreferrer" className="text-base text-primary hover:underline">
                    {viewingVendor.website}
                  </a>
                </div>
              )}

              {viewingVendor.notes && (
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-muted-foreground">Notes</Label>
                  <p className="text-base">{viewingVendor.notes}</p>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-sm font-semibold text-muted-foreground">Status</Label>
                <Badge variant={(viewingVendor.is_active !== false) ? 'default' : 'secondary'} className={(viewingVendor.is_active !== false) ? 'bg-green-500 hover:bg-green-600' : ''}>
                  {(viewingVendor.is_active !== false) ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
            {viewingVendor && (
              <Button onClick={() => {
                setIsViewDialogOpen(false);
                handleEditVendor(viewingVendor);
              }}>
                Edit Vendor
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Vendor Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Vendor</DialogTitle>
            <DialogDescription>
              Update vendor information
            </DialogDescription>
          </DialogHeader>
          {editingVendor && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Vendor Name *</Label>
                <Input
                  id="edit-name"
                  value={editingVendor.name || ''}
                  onChange={(e) => setEditingVendor({ ...editingVendor, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editingVendor.email || ''}
                  onChange={(e) => setEditingVendor({ ...editingVendor, email: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  type="tel"
                  value={editingVendor.phone || ''}
                  onChange={(e) => setEditingVendor({ ...editingVendor, phone: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-street">Street Address</Label>
                <Input
                  id="edit-street"
                  value={editingVendor.street || ''}
                  onChange={(e) => setEditingVendor({ ...editingVendor, street: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-city">City</Label>
                <Input
                  id="edit-city"
                  value={editingVendor.city || ''}
                  onChange={(e) => setEditingVendor({ ...editingVendor, city: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-state">State</Label>
                  <Input
                    id="edit-state"
                    value={editingVendor.state || ''}
                    onChange={(e) => setEditingVendor({ ...editingVendor, state: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-postalcode">Postal Code</Label>
                  <Input
                    id="edit-postalcode"
                    value={editingVendor.postalcode || ''}
                    onChange={(e) => setEditingVendor({ ...editingVendor, postalcode: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-website">Website</Label>
                <Input
                  id="edit-website"
                  type="url"
                  value={editingVendor.website || ''}
                  onChange={(e) => setEditingVendor({ ...editingVendor, website: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-notes">Notes</Label>
                <Input
                  id="edit-notes"
                  value={editingVendor.notes || ''}
                  onChange={(e) => setEditingVendor({ ...editingVendor, notes: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateVendor} disabled={updating || !editingVendor?.name}>
              {updating ? 'Updating...' : 'Update Vendor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VendorsPage;
