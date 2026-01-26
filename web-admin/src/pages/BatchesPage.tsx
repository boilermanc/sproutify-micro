import { useState, useEffect } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient';
import { Edit, Package, Plus, Search } from 'lucide-react';
import EmptyState from '../components/onboarding/EmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

const formatQuantityDisplay = (value: number | string | null | undefined) => {
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (numeric === null || numeric === undefined || !Number.isFinite(numeric)) {
    return '0';
  }
  const rounded = Math.round(numeric * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
};

const resolveVendorId = (vendor: any) => {
  const id = vendor?.vendor_id ?? vendor?.vendorid ?? vendor?.vendorID;
  if (id === undefined || id === null) return '';
  return id.toString();
};

const parseNumericValue = (value: number | string | null | undefined, fallback = 0) => {
  const numeric = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(numeric ?? NaN) ? numeric as number : fallback;
};

const toNullableNumber = (value: number | string | null | undefined): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const numeric = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(numeric as number) ? (numeric as number) : null;
};

type StockStatusTone = 'warning' | 'danger' | 'success';

const stockToneClassMap: Record<StockStatusTone, string> = {
  warning: 'text-amber-700',
  danger: 'text-rose-600',
  success: 'text-emerald-600',
};

const GRAMS_PER_POUND = 453.592;

const getStockStatusInfo = (quantity: number, lowStockThreshold: number | null) => {
  const formattedQuantity = formatQuantityDisplay(quantity);
  if (Number.isFinite(quantity) && quantity < 0.05) {
    return {
      text: `⚠️ DEPLETED - Too little to use (${formattedQuantity} lbs remaining). Consider marking this batch as inactive.`,
      tone: 'warning' as StockStatusTone,
    };
  }

  if (
    lowStockThreshold !== null &&
    Number.isFinite(lowStockThreshold) &&
    Number.isFinite(quantity) &&
    quantity <= lowStockThreshold
  ) {
    return {
      text: `🔴 LOW STOCK - Order now! (${formattedQuantity} lbs remaining)`,
      tone: 'danger' as StockStatusTone,
    };
  }

  return {
    text: '✅ Stock level good',
    tone: 'success' as StockStatusTone,
  };
};

const determineBatchStockStatus = (
  quantity: number | string | null | undefined,
  threshold: number | string | null | undefined,
  varietyId?: number | string | null | undefined,
  minSeedMap?: Record<string, number>,
  context?: { batchId?: string | number; varietyName?: string }
) => {
  const qty = parseNumericValue(quantity);
  const thresh = parseNumericValue(threshold);
  const varietyKey =
    varietyId !== undefined && varietyId !== null
      ? varietyId.toString()
      : undefined;
  const minSeedRequirement =
    varietyKey && minSeedMap && Object.prototype.hasOwnProperty.call(minSeedMap, varietyKey)
      ? minSeedMap[varietyKey]
      : undefined;
  const quantityInGrams = Number.isFinite(qty) ? qty * GRAMS_PER_POUND : undefined;

  if (qty <= 0) {
    console.log('Batch stock status', {
      batchId: context?.batchId,
      varietyName: context?.varietyName,
      quantityInGrams,
      minSeedPerTray: minSeedRequirement,
      status: 'Out of Stock',
    });
    return 'Out of Stock';
  }

  let computedStatus = 'In Stock';
  if (
    minSeedRequirement !== undefined &&
    Number.isFinite(minSeedRequirement) &&
    minSeedRequirement > 0 &&
    quantityInGrams !== undefined &&
    Number.isFinite(quantityInGrams) &&
    quantityInGrams < minSeedRequirement
  ) {
    computedStatus = "Can't Seed";
  } else if (thresh > 0 && qty <= thresh) {
    computedStatus = 'Low Stock';
  }

  console.log('Batch stock status', {
    batchId: context?.batchId,
    varietyName: context?.varietyName,
    quantityInGrams,
    minSeedPerTray: minSeedRequirement,
    status: computedStatus,
  });

  return computedStatus;
};

const getBatchStatusVariant = (status?: string) => {
  switch (status) {
    case 'In Stock':
      return 'default';
    case "Can't Seed":
      return 'warning';
    case 'Low Stock':
      return 'secondary';
    case 'Out of Stock':
      return 'destructive';
    default:
      return 'outline';
  }
};

type ActiveFilter = 'all' | 'active' | 'inactive';
type SortOption = 'purchase_date' | 'variety' | 'quantity' | 'stock_status';

const BatchesPage = () => {
  const [batches, setBatches] = useState<any[]>([]);
  const [varieties, setVarieties] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('purchase_date');
  const [minSeedPerVariety, setMinSeedPerVariety] = useState<Record<string, number>>({});
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [editingBatch, setEditingBatch] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [newBatch, setNewBatch] = useState({
    variety_id: '',
    vendor_id: '',
    quantity: '',
    unit: 'lbs',
    lot_number: '',
    purchase_date: new Date().toISOString().split('T')[0],
    cost: '',
  });
  const vendorOptions = vendors
    .map((vendor) => {
      const vendorValue = resolveVendorId(vendor);
      if (!vendorValue) return null;
      const vendorLabel = vendor.vendor_name || vendor.vendorname || vendor.name || 'Vendor';
      return { value: vendorValue, label: vendorLabel };
    })
    .filter((option): option is { value: string; label: string } => option !== null);

  const fetchMinSeedRequirements = async () => {
    try {
      const { data, error } = await getSupabaseClient()
        .from('recipes')
        .select('variety_id, seed_quantity_grams')
        .not('seed_quantity_grams', 'is', null);

      if (error) throw error;

      const minMap: Record<string, number> = {};
      (data || []).forEach((recipe) => {
        const varietyId = recipe.variety_id ?? (recipe as any).variety_id;
        if (varietyId === undefined || varietyId === null) return;

        const grams = parseNumericValue(recipe.seed_quantity_grams);
        if (!Number.isFinite(grams) || grams <= 0) return;

        const key = varietyId.toString();
        if (!Object.prototype.hasOwnProperty.call(minMap, key) || grams < minMap[key]) {
          minMap[key] = grams;
        }
      });

      setMinSeedPerVariety(minMap);
      return minMap;
    } catch (error) {
      console.error('Error fetching recipe seed requirements:', error);
      return {};
    }
  };

  const fetchBatches = async (seedRequirements?: Record<string, number>) => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);
      const recipeMinSeedMap = seedRequirements ?? minSeedPerVariety;

      // Fetch vendors first if not already loaded
      let vendorsList = vendors;
      if (vendorsList.length === 0) {
      const { data: vendorsData } = await getSupabaseClient()
        .from('vendors')
        .select('*')
        .or(`farm_uuid.eq.${farmUuid},farm_uuid.is.null`);
      vendorsList = vendorsData || [];
      console.log('Loaded vendors:', vendorsList);
      setVendors(vendorsList);
      }

      const { data, error } = await getSupabaseClient()
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
        const { data: varietiesData } = await getSupabaseClient()
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
          const { count } = await getSupabaseClient()
            .from('trays')
            .select('*', { count: 'exact', head: true })
            .eq('batch_id', batchId)
            .eq('farm_uuid', farmUuid);

          // Find vendor name if vendorid exists (actual DB column)
          const vendorId = batch.vendorid || batch.vendor_id;
          const vendor = vendorId ? vendorsList.find(v => 
            (v.vendor_id || (v as any).vendorid) === vendorId
          ) : null;
          console.log(`Batch ${batch.batchid || batch.batch_id}: vendorId=${vendorId}, found vendor:`, vendor);

          // Find variety name if varietyid exists (actual DB column)
          const varietyId = batch.varietyid || batch.variety_id;
          const variety = varietyId ? varietiesList.find((v: any) => 
            (v.variety_id || v.varietyid) === varietyId
          ) : null;

          // Normalize field names - map actual DB columns to expected names
          const thresholdValue = parseNumericValue(
            batch.low_stock_threshold ?? batch.reorderlevel ?? batch.reorder_level
          );
          const quantityValue = parseNumericValue(batch.quantity);
          const normalizedBatch = {
            ...batch,
            batch_id: batch.batchid || batch.batch_id, // Map batchid to batch_id
            variety_id: varietyId,
            variety_name: variety?.variety_name || variety?.name || '',
            purchase_date: batch.purchasedate || batch.purchase_date || null,
            lot_number: batch.lot_number || batch.lotnumber || null,
            vendor_id: vendorId,
            trayCount: count || 0,
            low_stock_threshold: thresholdValue,
            stock_quantity: quantityValue,
            stockStatus: determineBatchStockStatus(
              quantityValue,
              thresholdValue,
              varietyId,
              recipeMinSeedMap,
              {
                batchId,
                varietyName: variety?.variety_name || variety?.name || '',
              }
            ),
            vendors: vendor ? { 
              vendor_name: (vendor.name || (vendor as any).vendor_name || (vendor as any).vendorname || '') as string 
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
      const { data, error } = await getSupabaseClient()
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
          const { data, error } = await getSupabaseClient()
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

      // Fetch vendors - no ordering, will sort in JavaScript
      const fetchVendors = async () => {
        const { data, error } = await getSupabaseClient()
          .from('vendors')
          .select('*')
          .or(`farm_uuid.eq.${farmUuid},farm_uuid.is.null`);
        return { data, error };
      };

      // Fetch vendors first (this seems to work), then try varieties
      const vendorsResult = await fetchVendors();
      
      // Try to fetch varieties, but don't fail if it doesn't work
      let varietiesResult: { data: any[] | null; error: any } = { data: null, error: null };
      try {
        varietiesResult = await fetchVarieties();
        if (varietiesResult.error) {
          console.warn('Could not fetch varieties, continuing without them:', varietiesResult.error);
          varietiesResult = { data: [], error: null }; // Set empty array so page still works
        }
      } catch (err) {
        console.warn('Error fetching varieties, continuing without them:', err);
        varietiesResult = { data: [], error: null };
      }

      if (vendorsResult.error) {
        console.error('Error fetching vendors:', vendorsResult.error);
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
      
      const normalizedVendors = (vendorsResult.data || []).map((v: any) => ({
        ...v,
        vendor_name: v.vendor_name || v.vendorname || v.name || '',
      })).sort((a: any, b: any) => {
        const nameA = (a.vendor_name || '').toLowerCase();
        const nameB = (b.vendor_name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });

      setVarieties(normalizedVarieties);
      setVendors(normalizedVendors);
    } catch (error) {
      console.error('Error fetching form data:', error);
    }
  };

  useEffect(() => {
    const loadInitialData = async () => {
      const minSeedMap = await fetchMinSeedRequirements();
      await fetchBatches(minSeedMap);
      await fetchFormData();
    };

    void loadInitialData();
  }, []);

  const handleAddBatch = async () => {
    if (!newBatch.variety_id || !newBatch.quantity) return;

    setCreating(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

      // Map to actual DB column names: varietyid, vendorid, purchasedate
      const payload: any = {
        varietyid: parseInt(newBatch.variety_id), // Actual DB column
        vendorid: toNullableNumber(newBatch.vendor_id),
        quantity: parseFloat(newBatch.quantity),
        unit: newBatch.unit,
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

      const { error } = await getSupabaseClient()
        .from('seedbatches')
        .insert([payload]);

      if (error) throw error;

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
      quantity: formatQuantityDisplay(batch.quantity),
      unit: batch.unit || 'lbs',
      lot_number: batch.lot_number || batch.lotnumber || '',
      purchase_date: batch.purchase_date || batch.purchasedate 
        ? new Date(batch.purchase_date || batch.purchasedate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      cost: batch.totalprice?.toString() || batch.cost?.toString() || '',
      low_stock_threshold: batch.low_stock_threshold ?? null,
      originalQuantity: parseNumericValue(batch.quantity),
      actualQuantity: '',
      adjustmentReason: '',
      is_active: batch.is_active !== undefined ? batch.is_active : true,
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
      const session = JSON.parse(sessionData);
      const { farmUuid, userId } = session;

      const batchId = editingBatch.batch_id;
      const parsedQuantity = toNullableNumber(editingBatch.quantity) ?? 0;
      const actualQuantityInput =
        editingBatch.actualQuantity !== undefined && editingBatch.actualQuantity !== ''
          ? toNullableNumber(editingBatch.actualQuantity)
          : null;
      const hasActualQuantity = actualQuantityInput !== null && Number.isFinite(actualQuantityInput);
      const quantityForUpdate = hasActualQuantity ? actualQuantityInput as number : parsedQuantity;
      const recordedQuantity =
        Number.isFinite(editingBatch.originalQuantity) ? editingBatch.originalQuantity : parsedQuantity;

      const payload: any = {
        varietyid: parseInt(editingBatch.variety_id), // Actual DB column
        vendorid: toNullableNumber(editingBatch.vendor_id),
        quantity: quantityForUpdate,
        unit: editingBatch.unit,
        lot_number: editingBatch.lot_number || null,
        purchasedate: editingBatch.purchase_date, // Actual DB column
      };
      const isActiveValue = editingBatch.is_active !== undefined ? editingBatch.is_active : true;
      payload.is_active = isActiveValue;
      payload.status = isActiveValue ? 'active' : 'inactive';

      // Map cost to totalprice if provided (actual DB column)
      if (editingBatch.cost) {
        payload.totalprice = parseFloat(editingBatch.cost);
        // Calculate priceperounce if we have quantity and unit
        if (quantityForUpdate > 0 && editingBatch.unit === 'oz') {
          payload.priceperounce = parseFloat(editingBatch.cost) / quantityForUpdate;
        }
      }

      const adjustmentDifference =
        hasActualQuantity && Number.isFinite(recordedQuantity)
          ? actualQuantityInput! - recordedQuantity
          : null;

      if (adjustmentDifference !== null && Math.abs(adjustmentDifference) >= 0.0001) {
        const adjustmentNotes = editingBatch.adjustmentReason?.trim() || null;
        const { error: txError } = await getSupabaseClient()
          .from('seed_transactions')
          .insert([
            {
              transaction_type: 'manual_adjustment',
              quantity_grams: adjustmentDifference * 453.592,
              notes: adjustmentNotes,
              batch_id: batchId,
              farm_uuid: farmUuid,
              created_by: userId || null,
            },
          ]);
        if (txError) throw txError;
      }

      const { error } = await getSupabaseClient()
        .from('seedbatches')
        .update(payload)
        .eq('batchid', batchId)
        .eq('farm_uuid', farmUuid);

      if (error) throw error;

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

  const filteredBatches = batches
    .filter(batch => {
      // Normalized field names should already be set
      const varietyName = (batch.variety_name || '') as string;
      const lotNumber = (batch.lot_number || '') as string;
      const matchesSearch = varietyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
             lotNumber.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Apply active filter
      const isActive = batch.is_active !== undefined ? batch.is_active : true;
      const matchesActiveFilter = 
        activeFilter === 'all' ? true :
        activeFilter === 'active' ? isActive :
        !isActive;
      
      return matchesSearch && matchesActiveFilter;
    })
    .sort((a, b) => {
      // Apply sorting
      switch (sortBy) {
        case 'variety':
          return (a.variety_name || '').localeCompare(b.variety_name || '');
        case 'quantity':
          return parseNumericValue(b.quantity) - parseNumericValue(a.quantity);
        case 'stock_status':
          const statusOrder = { 'Out of Stock': 0, "Can't Seed": 1, 'Low Stock': 2, 'In Stock': 3 };
          const aStatus = statusOrder[a.stockStatus as keyof typeof statusOrder] ?? 4;
          const bStatus = statusOrder[b.stockStatus as keyof typeof statusOrder] ?? 4;
          return aStatus - bStatus;
        case 'purchase_date':
        default:
          const dateA = a.purchasedate || a.purchase_date || '';
          const dateB = b.purchasedate || b.purchase_date || '';
          if (!dateA && !dateB) return 0;
          if (!dateA) return 1;
          if (!dateB) return -1;
          return new Date(dateB).getTime() - new Date(dateA).getTime();
      }
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
                    value={newBatch.vendor_id} 
                    onValueChange={(value) => setNewBatch({ ...newBatch, vendor_id: value })}
                    disabled={vendorOptions.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={vendorOptions.length === 0 ? "No vendors" : "Select vendor"} />
                    </SelectTrigger>
                    <SelectContent>
                    {vendorOptions.length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">No vendors</div>
                      ) : (
                        vendorOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
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

      <div className="space-y-4">
        {/* Filter and Sort Chips */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Status:</span>
          <div className="flex gap-2">
            <Badge
              variant={activeFilter === 'all' ? 'default' : 'outline'}
              className="cursor-pointer hover:bg-primary/90"
              onClick={() => setActiveFilter('all')}
            >
              All
            </Badge>
            <Badge
              variant={activeFilter === 'active' ? 'default' : 'outline'}
              className="cursor-pointer hover:bg-primary/90"
              onClick={() => setActiveFilter('active')}
            >
              Active
            </Badge>
            <Badge
              variant={activeFilter === 'inactive' ? 'default' : 'outline'}
              className="cursor-pointer hover:bg-primary/90"
              onClick={() => setActiveFilter('inactive')}
            >
              Inactive
            </Badge>
          </div>
          
          <span className="text-sm font-medium text-muted-foreground ml-4">Sort by:</span>
          <div className="flex gap-2">
            <Badge
              variant={sortBy === 'purchase_date' ? 'default' : 'outline'}
              className="cursor-pointer hover:bg-primary/90"
              onClick={() => setSortBy('purchase_date')}
            >
              Purchase Date
            </Badge>
            <Badge
              variant={sortBy === 'variety' ? 'default' : 'outline'}
              className="cursor-pointer hover:bg-primary/90"
              onClick={() => setSortBy('variety')}
            >
              Variety
            </Badge>
            <Badge
              variant={sortBy === 'quantity' ? 'default' : 'outline'}
              className="cursor-pointer hover:bg-primary/90"
              onClick={() => setSortBy('quantity')}
            >
              Quantity
            </Badge>
            <Badge
              variant={sortBy === 'stock_status' ? 'default' : 'outline'}
              className="cursor-pointer hover:bg-primary/90"
              onClick={() => setSortBy('stock_status')}
            >
              Stock Status
            </Badge>
          </div>
        </div>

        {/* Search Bar */}
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
      </div>

      <div className="rounded-md border bg-card text-card-foreground shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Batch ID</TableHead>
              <TableHead>Variety</TableHead>
              <TableHead>Purchase Date</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Stock Status</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Trays</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBatches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="p-0 border-none">
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
                  <TableCell>
                    {batch.quantity ? `${formatQuantityDisplay(batch.quantity)} ${batch.unit || 'units'}` : 'N/A'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getBatchStatusVariant(batch.stockStatus)} className="capitalize text-center">
                      {batch.stockStatus || 'Unknown'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={(batch.is_active !== undefined ? batch.is_active : true) ? 'default' : 'secondary'}
                      className="capitalize"
                    >
                      {(batch.is_active !== undefined ? batch.is_active : true) ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
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
                  <div>{selectedBatch.quantity ? `${parseFloat(selectedBatch.quantity).toFixed(2)} ${selectedBatch.unit || 'lbs'}` : 'N/A'}</div>
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
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
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
                      {vendorOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
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
              {(() => {
                const isActiveValue = editingBatch.is_active !== undefined ? editingBatch.is_active : true;
                const recordedQuantity = toNullableNumber(editingBatch.quantity) ?? 0;
                const lowStockThreshold = toNullableNumber(editingBatch.low_stock_threshold);
                const stockInfo = getStockStatusInfo(recordedQuantity, lowStockThreshold);
                const stockToneClass = stockToneClassMap[stockInfo.tone] ?? 'text-slate-900';
                const actualQuantityValue =
                  editingBatch.actualQuantity !== undefined && editingBatch.actualQuantity !== ''
                    ? toNullableNumber(editingBatch.actualQuantity)
                    : null;
                const recordedForDifference = editingBatch.originalQuantity ?? recordedQuantity;
                const difference =
                  actualQuantityValue !== null && recordedForDifference !== null
                    ? actualQuantityValue - recordedForDifference
                    : null;
                const differenceText =
                  difference !== null ? `${difference >= 0 ? '+' : '-'}${formatQuantityDisplay(Math.abs(difference))} lbs` : '';
                const inactiveSwitchId = 'edit-inactive';

                return (
                  <>
                    <div className={`rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm ${stockToneClass}`}>
                      {stockInfo.text}
                    </div>
                    <div className="mt-3 flex items-start gap-3 px-4 py-3">
                      <Switch
                        id={inactiveSwitchId}
                        checked={!isActiveValue}
                        onCheckedChange={(checked) =>
                          setEditingBatch({ ...editingBatch, is_active: checked ? false : true })
                        }
                      />
                      <div className="space-y-1 text-sm">
                        <Label
                          htmlFor={inactiveSwitchId}
                          className="text-sm font-semibold text-slate-900 leading-none"
                        >
                          Mark as Inactive
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Inactive batches won't appear in seeding workflows
                        </p>
                      </div>
                    </div>
                    <details className="group mt-3 rounded-md border border-slate-200 bg-white">
                      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700">
                        <span>Adjust Inventory</span>
                        <span className="inline-block text-xs text-muted-foreground transition-transform duration-150 group-open:rotate-90">
                          ▼
                        </span>
                      </summary>
                      <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="adjust-actual-quantity">Actual Quantity on Hand (lbs)</Label>
                          <Input
                            id="adjust-actual-quantity"
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={editingBatch.actualQuantity ?? ''}
                            onChange={(e) =>
                              setEditingBatch({ ...editingBatch, actualQuantity: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="adjust-reason">Adjustment Reason</Label>
                          <Textarea
                            id="adjust-reason"
                            rows={3}
                            value={editingBatch.adjustmentReason ?? ''}
                            onChange={(e) =>
                              setEditingBatch({ ...editingBatch, adjustmentReason: e.target.value })
                            }
                          />
                        </div>
                        <p
                          className={`text-sm ${
                            difference !== null
                              ? difference >= 0
                                ? 'text-emerald-600'
                                : 'text-rose-600'
                              : 'text-slate-400'
                          }`}
                        >
                          {difference !== null
                            ? `Difference: ${differenceText}`
                            : 'Enter an actual quantity to calculate the adjustment.'}
                        </p>
                      </div>
                    </details>
                  </>
                );
              })()}
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
