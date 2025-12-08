import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Edit, Package, Plus, Search } from 'lucide-react';
import EmptyState from '../components/onboarding/EmptyState';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const BatchesPage = () => {
  const [batches, setBatches] = useState<any[]>([]);
  const [varieties, setVarieties] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [editingBatch, setEditingBatch] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [newBatch, setNewBatch] = useState({
    variety_id: '',
    vendor_id: '', // Keep as empty string for controlled component
    quantity: '',
    unit: 'lbs',
    lot_number: '',
    purchase_date: new Date().toISOString().split('T')[0],
    cost: '',
  });

  const fetchBatches = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // Don't fetch vendors here - fetchFormData handles it with proper normalization
      // This prevents overwriting normalized vendors

      const { data, error } = await supabase
        .from('seedbatches')
        .select('*')
        .eq('farm_uuid', farmUuid);

      if (error) throw error;

      // Sort batches by purchase date (most recent first) in JavaScript
      // Actual DB column: purchasedate
      const sortedBatches = (data || []).sort((a: any, b: any) => {
        const dateA = a.purchasedate || a.purchase_date || '';
        const dateB = b.purchasedate || b.purchase_date || '';
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      // Fetch varieties if not already loaded (needed for batch normalization)
      let varietiesList = varieties;
      if (varietiesList.length === 0) {
        const { data: varietiesData } = await supabase
          .from('varieties')
          .select('*');
        varietiesList = (varietiesData || []).map((v: any) => ({
          ...v,
          variety_id: v.varietyid ?? v.variety_id,
          variety_name: v.name ?? v.variety_name ?? '',
        }));
      }

      // Get tray counts for each batch and join vendor/variety data
      // Actual DB columns: batchid, vendorid, varietyid
      const batchesWithTrayCounts = await Promise.all(
        sortedBatches.map(async (batch) => {
          const batchId = batch.batchid || batch.batch_id;
          const { count } = await supabase
            .from('trays')
            .select('*', { count: 'exact', head: true })
            .eq('batch_id', batchId)
            .eq('farm_uuid', farmUuid);

          // Find vendor name if vendorid exists (actual DB column)
          // Use vendors state (already normalized) or fetch if not loaded
          const vendorId = batch.vendorid || batch.vendor_id;
          const vendor = vendorId ? vendors.find(v => 
            (v.vendorid || v.vendor_id) === vendorId
          ) : null;

          // Find variety name if varietyid exists (actual DB column)
          const varietyId = batch.varietyid || batch.variety_id;
          const variety = varietyId ? varietiesList.find((v: any) => 
            (v.variety_id || v.varietyid) === varietyId
          ) : null;

          // Normalize field names - map actual DB columns to expected names
          const normalizedBatch = {
            ...batch,
            batch_id: batch.batchid || batch.batch_id, // Map batchid to batch_id
            variety_id: varietyId,
            variety_name: variety?.variety_name || variety?.name || '',
            purchase_date: batch.purchasedate || batch.purchase_date || null,
            lot_number: batch.lot_number || batch.lotnumber || null,
            vendor_id: vendorId,
            trayCount: count || 0,
            vendors: vendor ? { 
              vendor_name: ((vendor as any).vendor_name || (vendor as any).vendorname || '') as string 
            } : null,
          };
          return normalizedBatch;
        })
      );

      setBatches(batchesWithTrayCounts);
    } catch (error) {
      console.error('Error fetching batches:', error);
    } finally {
      setLoading(false);
    }
  };

  // Utility function to check actual column names - can be called from browser console
  // Usage: window.checkVarietiesColumns()
  const checkVarietiesColumns = async () => {
    try {
      // Fetch one row without any filters to see actual column names
      const { data, error } = await supabase
        .from('varieties')
        .select('*')
        .limit(1);
      
      if (error) {
        console.error('Error fetching varieties:', error);
        return;
      }
      
      if (data && data.length > 0) {
        console.log('Actual column names in varieties table:');
        console.log(Object.keys(data[0]));
        console.log('Sample row:', data[0]);
        
        // Check for farm-related columns
        const farmColumns = Object.keys(data[0]).filter(key => 
          key.toLowerCase().includes('farm')
        );
        console.log('Farm-related columns found:', farmColumns);
      } else {
        console.log('No data in varieties table to inspect');
      }
    } catch (err) {
      console.error('Error checking columns:', err);
    }
  };
  
  // Expose to window for console debugging
  if (typeof window !== 'undefined') {
    (window as any).checkVarietiesColumns = checkVarietiesColumns;
  }

  const fetchFormData = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

      // Fetch varieties - no farm filtering since varieties table doesn't have farm_uuid
      // Actual schema: varietyid, name (not variety_id, variety_name)
      // Varieties appear to be global/shared across all farms
      const fetchVarieties = async () => {
        try {
          // Fetch all varieties (no farm filtering since column doesn't exist)
          const { data, error } = await supabase
            .from('varieties')
            .select('*');
          
          if (error) {
            return { data: null, error };
          }
          
          // Return all varieties (no filtering needed since they're global)
          return { data: data || [], error: null };
        } catch (err: any) {
          return { data: null, error: err };
        }
      };

      // Fetch vendors - include vendors for this farm OR vendors with null farm_uuid (global vendors)
      const fetchVendors = async () => {
        const { data, error } = await supabase
          .from('vendors')
          .select('*')
          .or(`farm_uuid.eq.${farmUuid},farm_uuid.is.null`);
        return { data, error };
      };

      // Fetch vendors first (this seems to work), then try varieties
      const vendorsResult = await fetchVendors();
      
      if (vendorsResult.error) {
        console.error('Error fetching vendors:', vendorsResult.error);
      } else {
        console.log('Fetched vendors:', vendorsResult.data?.length || 0, vendorsResult.data);
        // Log each vendor's structure to debug
        vendorsResult.data?.forEach((v, i) => {
          console.log(`Vendor ${i + 1}:`, {
            vendor_id: v.vendor_id,
            vendorid: v.vendorid,
            id: v.id,
            vendor_name: v.vendor_name,
            vendorname: v.vendorname,
            fullObject: v
          });
        });
      }
      
      // Try to fetch varieties, but don't fail if it doesn't work
      let varietiesResult: { data: any[] | null; error: any } = { data: null, error: null };
      try {
        const result = await fetchVarieties();
        if (result.error) {
          console.warn('Could not fetch varieties, continuing without them:', result.error);
          varietiesResult = { data: [], error: null }; // Set empty array so page still works
        } else {
          varietiesResult = result;
        }
      } catch (err) {
        console.warn('Error fetching varieties, continuing without them:', err);
        varietiesResult = { data: [], error: null };
      }

      // Normalize field names for varieties - map actual DB columns to expected names
      // Actual DB schema: varietyid, name
      // Code expects: variety_id, variety_name
      const normalizedVarieties = (varietiesResult.data || []).map((v: any) => ({
        ...v,
        variety_id: v.varietyid ?? v.variety_id, // Map varietyid to variety_id
        variety_name: v.name ?? v.variety_name ?? v.varietyname ?? '', // Map name to variety_name
      })).sort((a: any, b: any) => {
        const nameA = (a.variety_name || '').toLowerCase();
        const nameB = (b.variety_name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
      
      const normalizedVendors = (vendorsResult.data || []).map((v: any) => {
        // vendors table uses vendorid as primary key (not vendor_id)
        // and name (not vendor_name)
        const vendorId = v.vendorid || v.vendor_id || v.id;
        const vendorName = v.name || v.vendor_name || v.vendorname || '';
        
        if (!vendorId) {
          console.warn('Vendor missing ID:', v);
        }
        
        const normalized = {
          ...v,
          vendor_id: vendorId,
          vendorid: vendorId, // Keep both for compatibility
          vendor_name: vendorName,
          name: vendorName, // Keep original column name too
          vendorname: vendorName, // Keep both for compatibility
        };
        
        console.log('Normalizing vendor:', { original: v, normalized });
        return normalized;
      }).filter((v: any) => {
        // Only filter out if vendor_id is truly null/undefined (not 0)
        const isValid = v.vendor_id != null && v.vendor_id !== undefined;
        if (!isValid) {
          console.warn('Filtered out vendor (missing ID):', v);
        }
        return isValid;
      }).sort((a: any, b: any) => {
        const nameA = (a.vendor_name || a.name || '').toLowerCase();
        const nameB = (b.vendor_name || b.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });

      console.log('Normalized vendors:', normalizedVendors.length, normalizedVendors);
      console.log('Vendors that will be set in state:', normalizedVendors.map(v => ({ id: v.vendor_id, name: v.vendor_name })));
      setVarieties(normalizedVarieties);
      setVendors(normalizedVendors);
    } catch (error) {
      console.error('Error fetching form data:', error);
    }
  };

  useEffect(() => {
    fetchBatches();
    fetchFormData();
  }, []);

  // Re-fetch vendors when add dialog opens to ensure they're loaded
  useEffect(() => {
    if (isAddDialogOpen && vendors.length === 0) {
      fetchFormData();
    }
  }, [isAddDialogOpen]);

  const handleAddBatch = async () => {
    if (!newBatch.variety_id || !newBatch.quantity) return;

    setCreating(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

      // const selectedVariety = varieties.find(v => 
      //   (v.variety_id ?? v.varietyid)?.toString() === newBatch.variety_id
      // );

      // Map to actual DB column names: varietyid, vendorid, purchasedate
      const payload: any = {
        varietyid: parseInt(newBatch.variety_id), // Actual DB column
        vendorid: newBatch.vendor_id ? parseInt(newBatch.vendor_id) : null, // Actual DB column
        quantity: parseFloat(newBatch.quantity),
        lot_number: newBatch.lot_number,
        purchasedate: newBatch.purchase_date, // Actual DB column
        farm_uuid: farmUuid,
        status: 'new', // Required field with default
      };

      // Map cost to totalprice if provided (actual DB column)
      if (newBatch.cost) {
        payload.totalprice = parseFloat(newBatch.cost);
        // Calculate priceperounce if we have quantity and unit
        if (newBatch.quantity && newBatch.unit === 'oz') {
          payload.priceperounce = parseFloat(newBatch.cost) / parseFloat(newBatch.quantity);
        }
      }

      const { error } = await supabase
        .from('seedbatches')
        .insert([payload]);

      if (error) throw error;

      // Automatically add variety to farm catalog if not already there
      const varietyId = parseInt(newBatch.variety_id);
      try {
        // Check if variety is already in farm catalog
        const { data: existingCatalogEntry } = await supabase
          .from('farm_varieties')
          .select('*')
          .eq('farm_uuid', farmUuid)
          .eq('variety_id', varietyId)
          .maybeSingle();

        // If not in catalog, add it
        if (!existingCatalogEntry) {
          const { error: catalogError } = await supabase
            .from('farm_varieties')
            .insert({
              farm_uuid: farmUuid,
              variety_id: varietyId,
              is_active: true,
            });

          if (catalogError) {
            console.warn('Batch created but failed to add variety to catalog:', catalogError);
            // Don't fail the whole operation, just log the warning
          }
        }
      } catch (catalogErr) {
        console.warn('Error adding variety to catalog:', catalogErr);
        // Don't fail the batch creation if catalog update fails
      }

      setNewBatch({
        variety_id: '',
        vendor_id: '',
        quantity: '',
        unit: 'lbs',
        lot_number: '',
        purchase_date: new Date().toISOString().split('T')[0],
        cost: '',
      });
      setIsAddDialogOpen(false);
      fetchBatches();
    } catch (error) {
      console.error('Error creating batch:', error);
      alert('Failed to create batch');
    } finally {
      setCreating(false);
    }
  };

  const handleViewBatch = (batch: any) => {
    setSelectedBatch(batch);
    setIsViewDialogOpen(true);
  };

  const handleEditBatch = (batch: any) => {
    // Prepare editing batch with normalized fields
    // The batch object should already have normalized fields from fetchBatches
    const batchId = batch.batch_id || batch.batchid;
    const varietyId = batch.variety_id || batch.varietyid;
    const vendorId = batch.vendor_id || batch.vendorid;
    
    const editData = {
      batch_id: batchId,
      variety_id: varietyId ? varietyId.toString() : '',
      vendor_id: vendorId ? vendorId.toString() : '',
      quantity: batch.quantity?.toString() || '',
      unit: batch.unit || 'lbs',
      lot_number: batch.lot_number || batch.lotnumber || '',
      purchase_date: batch.purchase_date || batch.purchasedate 
        ? new Date(batch.purchase_date || batch.purchasedate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      cost: batch.totalprice?.toString() || batch.cost?.toString() || '',
    };
    
    setEditingBatch(editData);
    setIsEditDialogOpen(true);
  };

  const handleUpdateBatch = async () => {
    if (!editingBatch || !editingBatch.variety_id || !editingBatch.quantity) return;

    setUpdating(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

      const batchId = editingBatch.batch_id;

      // Map to actual DB column names: varietyid, vendorid, purchasedate
      const payload: any = {
        varietyid: parseInt(editingBatch.variety_id), // Actual DB column
        vendorid: editingBatch.vendor_id ? parseInt(editingBatch.vendor_id) : null, // Actual DB column
        quantity: parseFloat(editingBatch.quantity),
        lot_number: editingBatch.lot_number || null,
        purchasedate: editingBatch.purchase_date, // Actual DB column
      };

      // Map cost to totalprice if provided (actual DB column)
      if (editingBatch.cost) {
        payload.totalprice = parseFloat(editingBatch.cost);
        // Calculate priceperounce if we have quantity and unit
        if (editingBatch.quantity && editingBatch.unit === 'oz') {
          payload.priceperounce = parseFloat(editingBatch.cost) / parseFloat(editingBatch.quantity);
        }
      }

      const { error } = await supabase
        .from('seedbatches')
        .update(payload)
        .eq('batchid', batchId)
        .eq('farm_uuid', farmUuid);

      if (error) throw error;

      // Automatically add variety to farm catalog if not already there (in case variety changed)
      const varietyId = parseInt(editingBatch.variety_id);
      if (varietyId) {
        try {
          // Check if variety is already in farm catalog
          const { data: existingCatalogEntry } = await supabase
            .from('farm_varieties')
            .select('*')
            .eq('farm_uuid', farmUuid)
            .eq('variety_id', varietyId)
            .maybeSingle();

          // If not in catalog, add it
          if (!existingCatalogEntry) {
            const { error: catalogError } = await supabase
              .from('farm_varieties')
              .insert({
                farm_uuid: farmUuid,
                variety_id: varietyId,
                is_active: true,
              });

            if (catalogError) {
              console.warn('Batch updated but failed to add variety to catalog:', catalogError);
              // Don't fail the whole operation
            }
          }
        } catch (catalogErr) {
          console.warn('Error adding variety to catalog:', catalogErr);
          // Don't fail the batch update if catalog update fails
        }
      }

      setIsEditDialogOpen(false);
      setEditingBatch(null);
      fetchBatches();
    } catch (error) {
      console.error('Error updating batch:', error);
      alert('Failed to update batch');
    } finally {
      setUpdating(false);
    }
  };

  const filteredBatches = batches.filter(batch => {
    // Normalized field names should already be set
    const varietyName = (batch.variety_name || '') as string;
    const lotNumber = (batch.lot_number || '') as string;
    return varietyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
           lotNumber.toLowerCase().includes(searchTerm.toLowerCase());
  });

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Batches</h1>
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
          <h1 className="text-3xl font-bold tracking-tight">Batches</h1>
          <p className="text-muted-foreground">Manage your seed inventory</p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Batch
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add Seed Batch</DialogTitle>
              <DialogDescription>
                Record a new purchase of seeds.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="variety">Variety</Label>
                  <Select 
                    value={newBatch.variety_id} 
                    onValueChange={(value) => setNewBatch({ ...newBatch, variety_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select variety" />
                    </SelectTrigger>
                    <SelectContent>
                      {varieties.map((variety) => (
                        <SelectItem key={variety.variety_id} value={variety.variety_id.toString()}>
                          {variety.variety_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vendor">Vendor (Optional)</Label>
                  <Select 
                    value={newBatch.vendor_id || ''} 
                    onValueChange={(value) => setNewBatch({ ...newBatch, vendor_id: value || '' })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select vendor (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          No vendors available. Please add vendors in the Vendors page.
                        </div>
                      ) : (
                        vendors.map((vendor) => {
                          // Use vendorid (actual DB column) or vendor_id (normalized)
                          const vendorId = vendor.vendorid || vendor.vendor_id || vendor.id;
                          // Use name (actual DB column) or vendor_name (normalized)
                          const vendorName = vendor.name || vendor.vendor_name || vendor.vendorname || 'Unnamed Vendor';
                          
                          if (!vendorId) {
                            console.warn('Vendor missing ID:', vendor);
                            return null;
                          }
                          
                          return (
                            <SelectItem key={vendorId} value={vendorId.toString()}>
                              {vendorName}
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                  {vendors.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      Add vendors in the <a href="/vendors" className="underline">Vendors page</a>
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <div className="flex gap-2">
                    <Input
                      id="quantity"
                      type="number"
                      step="0.1"
                      placeholder="0.0"
                      value={newBatch.quantity}
                      onChange={(e) => setNewBatch({ ...newBatch, quantity: e.target.value })}
                    />
                    <Select 
                      value={newBatch.unit} 
                      onValueChange={(value) => setNewBatch({ ...newBatch, unit: value })}
                    >
                      <SelectTrigger className="w-[80px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lbs">lbs</SelectItem>
                        <SelectItem value="oz">oz</SelectItem>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="g">g</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                   <Label htmlFor="cost">Cost (Optional)</Label>
                   <div className="relative">
                      <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                      <Input
                        id="cost"
                        type="number"
                        step="0.01"
                        className="pl-6"
                        placeholder="0.00"
                        value={newBatch.cost}
                        onChange={(e) => setNewBatch({ ...newBatch, cost: e.target.value })}
                      />
                   </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lot">Lot Number (Optional)</Label>
                  <Input
                    id="lot"
                    placeholder="e.g., L-12345"
                    value={newBatch.lot_number}
                    onChange={(e) => setNewBatch({ ...newBatch, lot_number: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Purchase Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={newBatch.purchase_date}
                    onChange={(e) => setNewBatch({ ...newBatch, purchase_date: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddBatch} disabled={creating || !newBatch.variety_id || !newBatch.quantity}>
                {creating ? 'Creating...' : 'Create Batch'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search batches..."
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
              <TableHead>Batch ID</TableHead>
              <TableHead>Variety</TableHead>
              <TableHead>Purchase Date</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Trays</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBatches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0 border-none">
                  <div className="p-8 flex flex-col items-center justify-center text-center">
                     {searchTerm ? (
                       <>
                         <p className="text-muted-foreground mb-4">No batches found matching "{searchTerm}"</p>
                         <Button variant="outline" onClick={() => setSearchTerm('')}>Clear Search</Button>
                       </>
                     ) : (
                        <EmptyState
                          icon={<Package size={64} className="text-muted-foreground mb-4" />}
                          title="No Batches Yet"
                          description="Track your seed purchases to manage inventory. Batches help you keep track of where your seeds came from."
                          actionLabel="+ Add Your First Batch"
                          onAction={() => setIsAddDialogOpen(true)}
                          showOnboardingLink={true}
                        />
                     )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredBatches.map((batch) => (
                <TableRow key={batch.batch_id || batch.batchid}>
                  <TableCell className="font-medium">
                    <button
                      onClick={() => handleViewBatch(batch)}
                      className="text-primary hover:underline cursor-pointer"
                    >
                      B-{batch.batch_id || batch.batchid}
                    </button>
                  </TableCell>
                  <TableCell>{batch.variety_name || 'N/A'}</TableCell>
                  <TableCell>{(batch.purchase_date || batch.purchasedate) ? new Date((batch.purchase_date || batch.purchasedate) as string).toLocaleDateString() : 'N/A'}</TableCell>
                  <TableCell>{batch.quantity ? `${batch.quantity} ${batch.unit || 'units'}` : 'N/A'}</TableCell>
                  <TableCell>{batch.vendors?.vendor_name || '-'}</TableCell>
                  <TableCell>{batch.trayCount || 0}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleEditBatch(batch);
                        }}
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

      {/* View Batch Details Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Batch Details</DialogTitle>
            <DialogDescription>
              View detailed information about this seed batch.
            </DialogDescription>
          </DialogHeader>
          {selectedBatch && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Batch ID</Label>
                  <div className="font-medium">B-{selectedBatch.batch_id || selectedBatch.batchid}</div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Variety</Label>
                  <div>{selectedBatch.variety_name || 'N/A'}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Purchase Date</Label>
                  <div>
                    {(selectedBatch.purchase_date || selectedBatch.purchasedate) 
                      ? new Date((selectedBatch.purchase_date || selectedBatch.purchasedate) as string).toLocaleDateString() 
                      : 'N/A'}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Vendor</Label>
                  <div>{selectedBatch.vendors?.vendor_name || '-'}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Quantity</Label>
                  <div>{selectedBatch.quantity ? `${selectedBatch.quantity} ${selectedBatch.unit || 'units'}` : 'N/A'}</div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Lot Number</Label>
                  <div>{selectedBatch.lot_number || selectedBatch.lotnumber || '-'}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Cost</Label>
                  <div>{selectedBatch.totalprice || selectedBatch.cost ? `$${parseFloat((selectedBatch.totalprice || selectedBatch.cost).toString()).toFixed(2)}` : '-'}</div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Trays</Label>
                  <div>{selectedBatch.trayCount || 0}</div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
            {selectedBatch && (
              <Button onClick={() => {
                setIsViewDialogOpen(false);
                handleEditBatch(selectedBatch);
              }}>
                Edit Batch
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Batch Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Batch</DialogTitle>
            <DialogDescription>
              Update the batch information.
            </DialogDescription>
          </DialogHeader>
          {editingBatch && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-variety">Variety</Label>
                  <Select 
                    value={editingBatch.variety_id} 
                    onValueChange={(value) => setEditingBatch({ ...editingBatch, variety_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select variety" />
                    </SelectTrigger>
                    <SelectContent>
                      {varieties.map((variety) => (
                        <SelectItem key={variety.variety_id} value={variety.variety_id.toString()}>
                          {variety.variety_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-vendor">Vendor (Optional)</Label>
                  <Select 
                    value={editingBatch.vendor_id || 'none'} 
                    onValueChange={(value) => setEditingBatch({ ...editingBatch, vendor_id: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {vendors.length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          No vendors available. Please add vendors in the Vendors page.
                        </div>
                      ) : (
                        vendors.map((vendor) => {
                          // Check both vendorid (DB column) and vendor_id (normalized)
                          const vendorId = vendor.vendorid || vendor.vendor_id || vendor.id;
                          // Check both name (DB column) and vendor_name (normalized)
                          const vendorName = vendor.name || vendor.vendor_name || vendor.vendorname || 'Unnamed Vendor';
                          
                          if (!vendorId) {
                            console.warn('Vendor missing ID:', vendor);
                            return null;
                          }
                          
                          return (
                            <SelectItem key={vendorId} value={vendorId.toString()}>
                              {vendorName}
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-quantity">Quantity</Label>
                  <div className="flex gap-2">
                    <Input
                      id="edit-quantity"
                      type="number"
                      step="0.1"
                      placeholder="0.0"
                      value={editingBatch.quantity}
                      onChange={(e) => setEditingBatch({ ...editingBatch, quantity: e.target.value })}
                    />
                    <Select 
                      value={editingBatch.unit} 
                      onValueChange={(value) => setEditingBatch({ ...editingBatch, unit: value })}
                    >
                      <SelectTrigger className="w-[80px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lbs">lbs</SelectItem>
                        <SelectItem value="oz">oz</SelectItem>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="g">g</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                   <Label htmlFor="edit-cost">Cost (Optional)</Label>
                   <div className="relative">
                      <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                      <Input
                        id="edit-cost"
                        type="number"
                        step="0.01"
                        className="pl-6"
                        placeholder="0.00"
                        value={editingBatch.cost}
                        onChange={(e) => setEditingBatch({ ...editingBatch, cost: e.target.value })}
                      />
                   </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-lot">Lot Number (Optional)</Label>
                  <Input
                    id="edit-lot"
                    placeholder="e.g., L-12345"
                    value={editingBatch.lot_number}
                    onChange={(e) => setEditingBatch({ ...editingBatch, lot_number: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-date">Purchase Date</Label>
                  <Input
                    id="edit-date"
                    type="date"
                    value={editingBatch.purchase_date}
                    onChange={(e) => setEditingBatch({ ...editingBatch, purchase_date: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateBatch} disabled={updating || !editingBatch?.variety_id || !editingBatch?.quantity}>
              {updating ? 'Updating...' : 'Update Batch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BatchesPage;
