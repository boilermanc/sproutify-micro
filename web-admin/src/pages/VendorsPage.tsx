import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Eye, Edit, Truck, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const VendorsPage = () => {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
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
      const { data, error } = await supabase
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

      const { error } = await supabase
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
          <DialogContent className="sm:max-w-[425px]">
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="contact@vendor.com"
                    value={newVendor.email}
                    onChange={(e) => setNewVendor({ ...newVendor, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={newVendor.phone}
                    onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })}
                  />
                </div>
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
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    placeholder="City"
                    value={newVendor.city}
                    onChange={(e) => setNewVendor({ ...newVendor, city: e.target.value })}
                  />
                </div>
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
                    <TableCell className="font-medium">{vendorName}</TableCell>
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
                        <Button variant="ghost" size="icon" onClick={() => alert(`View vendor: ${vendorName}`)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => alert(`Edit vendor: ${vendorName}`)}>
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
    </div>
  );
};

export default VendorsPage;
