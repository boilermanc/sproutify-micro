import { useState, useEffect } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient';
import { Edit, History, Package, Plus, Search } from 'lucide-react';
import EmptyState from '../components/onboarding/EmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
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

// Common adjustment reasons for seed inventory
const ADJUSTMENT_REASONS = [
  { value: 'physical_count', label: 'Physical count correction' },
  { value: 'spillage', label: 'Spillage / waste' },
  { value: 'quality_issue', label: 'Quality issue (discarded)' },
  { value: 'sample_testing', label: 'Sample / testing' },
  { value: 'received_stock', label: 'Received additional stock' },
  { value: 'data_entry_error', label: 'Data entry error' },
  { value: 'other', label: 'Other' },
] as const;

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
  // History modal state
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [historyBatch, setHistoryBatch] = useState<any>(null);
  const [historyTransactions, setHistoryTransactions] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize] = useState(10);
  const [historySortField, setHistorySortField] = useState<'date' | 'type' | 'amount'>('date');
  const [historySortDir, setHistorySortDir] = useState<'asc' | 'desc'>('desc');
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

      // Fetch seed_transactions aggregated by batch_id to calculate remaining inventory
      // Transactions store negative values for seed usage (deductions)
      const { data: transactionsData, error: transError } = await getSupabaseClient()
        .from('seed_transactions')
        .select('batch_id, quantity_grams')
        .eq('farm_uuid', farmUuid);

      if (transError) {
        console.error('Error fetching seed_transactions:', transError);
      }

      // Build a map of batch_id -> total_used_grams (sum of all transactions)
      const transactionTotalsByBatch = new Map<number, number>();
      if (transactionsData) {
        for (const tx of transactionsData) {
          if (tx.batch_id != null) {
            const current = transactionTotalsByBatch.get(tx.batch_id) || 0;
            transactionTotalsByBatch.set(tx.batch_id, current + parseNumericValue(tx.quantity_grams));
          }
        }
      }

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
          const originalQuantityValue = parseNumericValue(batch.quantity);
          const batchUnit = batch.unit || 'lbs';

          // Convert original quantity to grams
          let originalQuantityGrams = originalQuantityValue;
          if (batchUnit === 'lbs') {
            originalQuantityGrams = originalQuantityValue * GRAMS_PER_POUND;
          } else if (batchUnit === 'oz') {
            originalQuantityGrams = originalQuantityValue * 28.3495;
          } else if (batchUnit === 'kg') {
            originalQuantityGrams = originalQuantityValue * 1000;
          }
          // else assume already in grams

          // Get transaction total for this batch (negative values = seed usage)
          const transactionTotal = transactionTotalsByBatch.get(batchId) || 0;

          // Calculate remaining quantity in grams
          const remainingQuantityGrams = originalQuantityGrams + transactionTotal;

          // Convert remaining quantity back to lbs for stock status calculation
          // (determineBatchStockStatus expects quantity in lbs and converts to grams internally)
          const remainingQuantityLbs = remainingQuantityGrams / GRAMS_PER_POUND;

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
            stock_quantity: remainingQuantityLbs, // Use remaining quantity, not original
            original_quantity: originalQuantityValue, // Keep original for reference
            remaining_quantity_grams: remainingQuantityGrams, // Store for debugging
            stockStatus: determineBatchStockStatus(
              remainingQuantityLbs,
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
      stock_quantity: batch.stock_quantity, // Remaining inventory in lbs
      current_quantity_display: formatQuantityDisplay(batch.stock_quantity), // Editable current quantity
      current_quantity_unit: 'lbs', // Default to lbs for editing
      stockStatus: batch.stockStatus,
      actualQuantity: '',
      adjustmentReasonType: 'physical_count', // Default to most common reason
      adjustmentReasonCustom: '', // For "Other" option
      is_active: batch.is_active !== undefined ? batch.is_active : true,
      updated_at: batch.updated_at || null,
      created_at: batch.created_at || null,
    };

    setEditingBatch(editData);
    setIsEditDialogOpen(true);
  };

  const handleViewHistory = async (batch: any) => {
    const batchId = batch.batch_id || batch.batchid;
    setHistoryBatch(batch);
    setIsHistoryDialogOpen(true);
    setLoadingHistory(true);
    setHistoryTransactions([]);
    setHistoryPage(1); // Reset to first page
    setHistorySortField('date');
    setHistorySortDir('desc');

    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

      const { data, error } = await getSupabaseClient()
        .from('seed_transactions')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .eq('batch_id', batchId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHistoryTransactions(data || []);
    } catch (error) {
      console.error('Error fetching batch history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const formatTransactionType = (type: string | null) => {
    if (!type) return 'Unknown';
    const typeMap: Record<string, string> = {
      'sowing': 'Seeding',
      'seeding': 'Seeding',
      'manual_adjustment': 'Manual Adjustment',
      'harvest': 'Harvest',
      'waste': 'Waste/Loss',
      'discard': 'Discarded',
    };
    return typeMap[type.toLowerCase()] || type.charAt(0).toUpperCase() + type.slice(1);
  };

  const handleUpdateBatch = async () => {
    if (!editingBatch || !editingBatch.variety_id) return;

    setUpdating(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) {
        console.error('No session data found');
        return;
      }
      const session = JSON.parse(sessionData);
      const { farmUuid, userId } = session;
      console.log('[handleUpdateBatch] Starting update for batch:', editingBatch.batch_id);

      const batchId = editingBatch.batch_id;

      // Convert entered quantity to lbs
      const enteredQty = toNullableNumber(editingBatch.current_quantity_display);
      const enteredUnit = editingBatch.current_quantity_unit ?? 'lbs';
      let newCurrentQtyLbs = enteredQty;
      if (enteredQty !== null) {
        if (enteredUnit === 'g') {
          newCurrentQtyLbs = enteredQty / GRAMS_PER_POUND;
        } else if (enteredUnit === 'oz') {
          newCurrentQtyLbs = enteredQty / 16;
        } else if (enteredUnit === 'kg') {
          newCurrentQtyLbs = (enteredQty * 1000) / GRAMS_PER_POUND;
        }
      }

      const oldCurrentQtyLbs = toNullableNumber(editingBatch.stock_quantity);

      // Calculate adjustment if current quantity changed
      if (
        newCurrentQtyLbs !== null &&
        oldCurrentQtyLbs !== null &&
        Math.abs(newCurrentQtyLbs - oldCurrentQtyLbs) >= 0.01
      ) {
        const adjustmentLbs = newCurrentQtyLbs - oldCurrentQtyLbs;
        const adjustmentGrams = adjustmentLbs * GRAMS_PER_POUND;

        // Build adjustment notes from selected reason
        const reasonType = editingBatch.adjustmentReasonType || 'physical_count';
        let adjustmentNotes: string;
        if (reasonType === 'other') {
          adjustmentNotes = editingBatch.adjustmentReasonCustom?.trim() || 'Manual inventory correction';
        } else {
          const reasonLabel = ADJUSTMENT_REASONS.find(r => r.value === reasonType)?.label || 'Manual inventory correction';
          adjustmentNotes = reasonLabel;
        }

        console.log('[handleUpdateBatch] Inserting adjustment transaction:', { adjustmentGrams, adjustmentNotes, batchId });
        const { error: txError } = await getSupabaseClient()
          .from('seed_transactions')
          .insert([
            {
              transaction_type: 'manual_adjustment',
              quantity_grams: adjustmentGrams,
              notes: adjustmentNotes,
              batch_id: batchId,
              farm_uuid: farmUuid,
              created_by: userId || null,
            },
          ]);
        if (txError) {
          console.error('[handleUpdateBatch] Transaction insert error:', txError);
          throw txError;
        }
        console.log('[handleUpdateBatch] Transaction inserted successfully');
      }

      // Update batch metadata (NOT the original quantity - that stays as the purchase record)
      const payload: any = {
        varietyid: parseInt(editingBatch.variety_id),
        vendorid: toNullableNumber(editingBatch.vendor_id),
        lot_number: editingBatch.lot_number || null,
        purchasedate: editingBatch.purchase_date,
        updated_at: new Date().toISOString(),
        updated_by: userId || null,
      };
      const isActiveValue = editingBatch.is_active !== undefined ? editingBatch.is_active : true;
      payload.is_active = isActiveValue;
      payload.status = isActiveValue ? 'active' : 'inactive';

      // Map cost to totalprice if provided
      if (editingBatch.cost) {
        payload.totalprice = parseFloat(editingBatch.cost);
      }

      console.log('[handleUpdateBatch] Updating batch metadata:', payload);
      const { error } = await getSupabaseClient()
        .from('seedbatches')
        .update(payload)
        .eq('batchid', batchId)
        .eq('farm_uuid', farmUuid);

      if (error) {
        console.error('[handleUpdateBatch] Batch update error:', error);
        throw error;
      }
      console.log('[handleUpdateBatch] Batch updated successfully, closing dialog');

      setIsEditDialogOpen(false);
      setEditingBatch(null);
      fetchBatches();
    } catch (error) {
      console.error('[handleUpdateBatch] Error updating batch:', error);
      alert('Failed to update batch');
    } finally {
      console.log('[handleUpdateBatch] Finally block - resetting updating state');
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
          return parseNumericValue(b.stock_quantity) - parseNumericValue(a.stock_quantity);
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
                    {batch.stock_quantity !== undefined ? `${formatQuantityDisplay(batch.stock_quantity)} lbs` : 'N/A'}
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
                        title="View History"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleViewHistory(batch);
                        }}
                      >
                        <History className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        title="Edit Batch"
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
                  <Label className="text-muted-foreground">Original Purchase</Label>
                  <div>{selectedBatch.original_quantity ? `${parseFloat(selectedBatch.original_quantity).toFixed(2)} ${selectedBatch.unit || 'lbs'}` : (selectedBatch.quantity ? `${parseFloat(selectedBatch.quantity).toFixed(2)} ${selectedBatch.unit || 'lbs'}` : 'N/A')}</div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Remaining Inventory</Label>
                  <div>{selectedBatch.stock_quantity !== undefined ? `${formatQuantityDisplay(selectedBatch.stock_quantity)} lbs` : 'N/A'}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Lot Number</Label>
                  <div>{selectedBatch.lot_number || selectedBatch.lotnumber || '-'}</div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Stock Status</Label>
                  <Badge variant={getBatchStatusVariant(selectedBatch.stockStatus)} className="capitalize">
                    {selectedBatch.stockStatus || 'Unknown'}
                  </Badge>
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
                    onValueChange={(value) => setEditingBatch((prev: any) => ({ ...prev, variety_id: value }))}
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
                    onValueChange={(value) => setEditingBatch((prev: any) => ({ ...prev, vendor_id: value === 'none' ? '' : value }))}
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

              {/* Current Stock - main editable field */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-quantity">Current Quantity</Label>
                  <div className="flex gap-2">
                    <Input
                      id="edit-quantity"
                      type="number"
                      step="0.1"
                      placeholder="0.0"
                      value={editingBatch.current_quantity_display ?? formatQuantityDisplay(editingBatch.stock_quantity)}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        setEditingBatch((prev: any) => ({ ...prev, current_quantity_display: newValue }));
                      }}
                      className={`${(parseFloat(editingBatch.current_quantity_display ?? editingBatch.stock_quantity) ?? 0) <= 0 ? 'border-rose-300' : ''}`}
                    />
                    <Select
                      value={editingBatch.current_quantity_unit ?? 'lbs'}
                      onValueChange={(value) => setEditingBatch((prev: any) => ({ ...prev, current_quantity_unit: value }))}
                    >
                      <SelectTrigger className="w-[80px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lbs">lbs</SelectItem>
                        <SelectItem value="oz">oz</SelectItem>
                        <SelectItem value="g">g</SelectItem>
                        <SelectItem value="kg">kg</SelectItem>
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
                        onChange={(e) => setEditingBatch((prev: any) => ({ ...prev, cost: e.target.value }))}
                      />
                   </div>
                </div>
              </div>

              {/* Original Purchase Reference & Last Modified */}
              <div className="text-sm text-muted-foreground space-y-1">
                <div>Original purchase: {formatQuantityDisplay(editingBatch.originalQuantity)} {editingBatch.unit}</div>
                {editingBatch.updated_at ? (
                  <div>Last modified: {new Date(editingBatch.updated_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}</div>
                ) : editingBatch.created_at ? (
                  <div>Created: {new Date(editingBatch.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}</div>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-lot">Lot Number (Optional)</Label>
                  <Input
                    id="edit-lot"
                    placeholder="e.g., L-12345"
                    value={editingBatch.lot_number}
                    onChange={(e) => setEditingBatch((prev: any) => ({ ...prev, lot_number: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-date">Purchase Date</Label>
                  <Input
                    id="edit-date"
                    type="date"
                    value={editingBatch.purchase_date}
                    onChange={(e) => setEditingBatch((prev: any) => ({ ...prev, purchase_date: e.target.value }))}
                  />
                </div>
              </div>
              {(() => {
                const isActiveValue = editingBatch.is_active !== undefined ? editingBatch.is_active : true;

                // Convert entered quantity to lbs for calculations
                const enteredQty = toNullableNumber(editingBatch.current_quantity_display) ?? 0;
                const enteredUnit = editingBatch.current_quantity_unit ?? 'lbs';
                let currentQuantityLbs = enteredQty;
                if (enteredUnit === 'g') {
                  currentQuantityLbs = enteredQty / GRAMS_PER_POUND;
                } else if (enteredUnit === 'oz') {
                  currentQuantityLbs = enteredQty / 16;
                } else if (enteredUnit === 'kg') {
                  currentQuantityLbs = (enteredQty * 1000) / GRAMS_PER_POUND;
                }

                const lowStockThreshold = toNullableNumber(editingBatch.low_stock_threshold);
                const stockInfo = getStockStatusInfo(currentQuantityLbs, lowStockThreshold);
                const stockToneClass = stockToneClassMap[stockInfo.tone] ?? 'text-slate-900';
                const inactiveSwitchId = 'edit-inactive';

                // Calculate adjustment preview
                const oldQuantityLbs = toNullableNumber(editingBatch.stock_quantity) ?? 0;
                const adjustmentLbs = currentQuantityLbs - oldQuantityLbs;
                const hasAdjustment = Math.abs(adjustmentLbs) >= 0.01;

                return (
                  <>
                    <div className={`rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm ${stockToneClass}`}>
                      {stockInfo.text}
                    </div>
                    {hasAdjustment && (
                      <div className={`rounded-md border px-4 py-3 text-sm ${adjustmentLbs > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                        Adjustment: {adjustmentLbs > 0 ? '+' : ''}{formatQuantityDisplay(adjustmentLbs)} lbs will be recorded
                      </div>
                    )}
                    <div className="mt-3 flex items-start gap-3 px-4 py-3">
                      <Switch
                        id={inactiveSwitchId}
                        checked={!isActiveValue}
                        onCheckedChange={(checked) =>
                          setEditingBatch((prev: any) => ({ ...prev, is_active: checked ? false : true }))
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
                    {hasAdjustment && (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="adjust-reason">Adjustment Reason</Label>
                          <Select
                            value={editingBatch.adjustmentReasonType ?? 'physical_count'}
                            onValueChange={(value) =>
                              setEditingBatch((prev: any) => ({ ...prev, adjustmentReasonType: value }))
                            }
                          >
                            <SelectTrigger id="adjust-reason">
                              <SelectValue placeholder="Select reason" />
                            </SelectTrigger>
                            <SelectContent>
                              {ADJUSTMENT_REASONS.map((reason) => (
                                <SelectItem key={reason.value} value={reason.value}>
                                  {reason.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {editingBatch.adjustmentReasonType === 'other' && (
                          <div className="space-y-2">
                            <Label htmlFor="adjust-reason-custom">Please specify</Label>
                            <Input
                              id="adjust-reason-custom"
                              placeholder="Enter reason for adjustment"
                              value={editingBatch.adjustmentReasonCustom ?? ''}
                              onChange={(e) =>
                                setEditingBatch((prev: any) => ({ ...prev, adjustmentReasonCustom: e.target.value }))
                              }
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateBatch} disabled={updating || !editingBatch?.variety_id}>
              {updating ? 'Updating...' : 'Update Batch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction History Dialog */}
      <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transaction History</DialogTitle>
            <DialogDescription>
              {historyBatch && (
                <>
                  Seed usage history for <strong>{historyBatch.variety_name}</strong> (B-{historyBatch.batch_id})
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {loadingHistory ? (
            <div className="py-8 text-center text-muted-foreground">Loading history...</div>
          ) : historyTransactions.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No transactions recorded for this batch yet.
            </div>
          ) : (
            (() => {
              // Sort transactions
              const sortedTransactions = [...historyTransactions].sort((a, b) => {
                let comparison = 0;
                if (historySortField === 'date') {
                  comparison = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
                } else if (historySortField === 'type') {
                  comparison = (a.transaction_type || '').localeCompare(b.transaction_type || '');
                } else if (historySortField === 'amount') {
                  comparison = parseNumericValue(a.quantity_grams) - parseNumericValue(b.quantity_grams);
                }
                return historySortDir === 'asc' ? comparison : -comparison;
              });

              // Paginate
              const totalPages = Math.ceil(sortedTransactions.length / historyPageSize);
              const startIndex = (historyPage - 1) * historyPageSize;
              const paginatedTransactions = sortedTransactions.slice(startIndex, startIndex + historyPageSize);

              const handleSort = (field: 'date' | 'type' | 'amount') => {
                if (historySortField === field) {
                  setHistorySortDir(historySortDir === 'asc' ? 'desc' : 'asc');
                } else {
                  setHistorySortField(field);
                  setHistorySortDir('desc');
                }
                setHistoryPage(1); // Reset to first page on sort change
              };

              const SortIcon = ({ field }: { field: 'date' | 'type' | 'amount' }) => {
                if (historySortField !== field) return <span className="ml-1 text-slate-300">↕</span>;
                return <span className="ml-1">{historySortDir === 'asc' ? '↑' : '↓'}</span>;
              };

              return (
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Total Transactions:</span>
                        <span className="ml-2 font-medium">{historyTransactions.length}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Total Used:</span>
                        <span className="ml-2 font-medium text-rose-600">
                          {formatQuantityDisplay(
                            Math.abs(historyTransactions.reduce((sum, tx) => {
                              const qty = parseNumericValue(tx.quantity_grams);
                              return qty < 0 ? sum + qty : sum;
                            }, 0))
                          )} g
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Adjustments:</span>
                        <span className="ml-2 font-medium text-emerald-600">
                          +{formatQuantityDisplay(
                            historyTransactions.reduce((sum, tx) => {
                              const qty = parseNumericValue(tx.quantity_grams);
                              return qty > 0 ? sum + qty : sum;
                            }, 0)
                          )} g
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Transaction List */}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead
                          className="cursor-pointer hover:bg-slate-100 select-none"
                          onClick={() => handleSort('date')}
                        >
                          Date <SortIcon field="date" />
                        </TableHead>
                        <TableHead
                          className="cursor-pointer hover:bg-slate-100 select-none"
                          onClick={() => handleSort('type')}
                        >
                          Type <SortIcon field="type" />
                        </TableHead>
                        <TableHead
                          className="text-right cursor-pointer hover:bg-slate-100 select-none"
                          onClick={() => handleSort('amount')}
                        >
                          Amount <SortIcon field="amount" />
                        </TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedTransactions.map((tx, index) => {
                        const qty = parseNumericValue(tx.quantity_grams);
                        const isDeduction = qty < 0;
                        return (
                          <TableRow key={tx.id || index}>
                            <TableCell className="text-sm">
                              {tx.created_at
                                ? new Date(tx.created_at).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })
                                : 'N/A'}
                            </TableCell>
                            <TableCell>
                              <Badge variant={isDeduction ? 'secondary' : 'outline'} className="text-xs">
                                {formatTransactionType(tx.transaction_type)}
                              </Badge>
                            </TableCell>
                            <TableCell className={`text-right font-medium ${isDeduction ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {isDeduction ? '' : '+'}{formatQuantityDisplay(qty)} g
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate" title={tx.notes || ''}>
                              {tx.notes || '-'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-2">
                      <div className="text-sm text-muted-foreground">
                        Showing {startIndex + 1}-{Math.min(startIndex + historyPageSize, sortedTransactions.length)} of {sortedTransactions.length}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                          disabled={historyPage === 1}
                        >
                          Previous
                        </Button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            // Show pages around current page
                            let pageNum: number;
                            if (totalPages <= 5) {
                              pageNum = i + 1;
                            } else if (historyPage <= 3) {
                              pageNum = i + 1;
                            } else if (historyPage >= totalPages - 2) {
                              pageNum = totalPages - 4 + i;
                            } else {
                              pageNum = historyPage - 2 + i;
                            }
                            return (
                              <Button
                                key={pageNum}
                                variant={historyPage === pageNum ? 'default' : 'outline'}
                                size="sm"
                                className="w-8 h-8 p-0"
                                onClick={() => setHistoryPage(pageNum)}
                              >
                                {pageNum}
                              </Button>
                            );
                          })}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setHistoryPage(p => Math.min(totalPages, p + 1))}
                          disabled={historyPage === totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsHistoryDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BatchesPage;
