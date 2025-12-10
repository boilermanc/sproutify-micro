import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { checkSupplyStock } from '../services/notificationService';
import { Edit, Package, Plus, Search, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Supply {
  supply_id?: number;
  id?: number;
  batch_id?: number;
  supply_name?: string;
  name?: string;
  category?: string;
  stock?: number | string;
  unit?: string;
  low_stock_threshold?: number | string;
  status?: string;
  notes?: string;
  color?: string;
  vendor_id?: number | null;
  vendor_name?: string | null;
  farm_uuid?: string;
  is_active?: boolean;
  created_at?: string;
  is_seed_batch?: boolean;
}

interface SupplyTemplate {
  template_id: number;
  template_name: string;
  category: string;
  unit: string;
  color?: string | null;
  default_low_stock_threshold: number;
  description?: string | null;
  is_global: boolean;
}

interface Vendor {
  vendor_id: number;
  vendor_name: string;
  name?: string;
}

// Common tray colors
const TRAY_COLORS = ['Black', 'White', 'Green', 'Blue', 'Red', 'Yellow', 'Clear', 'Other'];
const DEFAULT_CATEGORIES = ['Growing Supplies', 'Growing Media', 'Trays', 'Packaging', 'Seeds', 'Equipment', 'Other'];

const addStatusToSupply = (supply: Supply) => {
  const stock = Number(supply.stock || 0);
  const threshold = Number(supply.low_stock_threshold ?? 10);
  let status = 'In Stock';
  if (stock === 0) {
    status = 'Out of Stock';
  } else if (stock <= threshold) {
    status = 'Low Stock';
  }

  return {
    ...supply,
    stock,
    low_stock_threshold: threshold,
    status,
  };
};

const getPresetsForCategory = (category: string, templates: SupplyTemplate[]) => {
  // Filter templates by category
  const categoryTemplates = templates.filter(t => t.category === category);
  
  // If no templates for this category, return empty array (user can type custom)
  return categoryTemplates;
};

const SuppliesPage = () => {
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [templates, setTemplates] = useState<SupplyTemplate[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [showNeedsAttention, setShowNeedsAttention] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isAdjustDialogOpen, setIsAdjustDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedSupply, setSelectedSupply] = useState<Supply | null>(null);
  const [creating, setCreating] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [newSupply, setNewSupply] = useState({
    supply_name: '',
    category: 'Growing Supplies',
    stock: '',
    unit: 'pcs',
    low_stock_threshold: '',
    notes: '',
    color: '',
    vendor_id: '',
  });
  const [stockAdjustment, setStockAdjustment] = useState({
    adjustment_type: 'add', // 'add' or 'remove'
    quantity: '',
    reason: '',
  });

  const fetchSeedSupplies = async (farmUuid: string): Promise<Supply[]> => {
    try {
      const [{ data: seedBatches, error: seedError }, { data: varietiesData }] = await Promise.all([
        supabase.from('seedbatches').select('*').eq('farm_uuid', farmUuid),
        supabase.from('varieties').select('*'),
      ]);

      if (seedError) {
        console.warn('Error fetching seed batches for supplies:', seedError);
        return [];
      }

      const varieties = (varietiesData || []).map((v: any) => ({
        ...v,
        variety_id: v.varietyid ?? v.variety_id,
        variety_name: v.name ?? v.variety_name ?? v.varietyname ?? '',
      }));

      return (seedBatches || []).map((batch: any) => {
        const batchId = batch.batchid || batch.batch_id;
        const varietyId = batch.varietyid || batch.variety_id;
        const variety = varieties.find((v: any) => (v.variety_id || v.varietyid) === varietyId);
        const supplyName = variety?.variety_name
          ? `${variety.variety_name} Seeds`
          : batchId
            ? `Seed Batch ${batchId}`
            : 'Seeds';

        // Smart unit detection: handle cases where quantity doesn't match the stored unit
        // This happens when deductions convert to grams but the unit field still says 'lbs'
        let displayUnit = batch.unit || 'lbs';
        let displayQuantity = batch.quantity ?? 0;
        const quantityNum = parseFloat(displayQuantity.toString());

        // Only convert in specific cases where we're confident the unit is wrong:
        
        // Case 1: Unit is 'grams' but quantity is 1 (likely 1 lb mislabeled as grams)
        // This happens when batches were created before unit field was properly saved
        if ((displayUnit === 'grams' || displayUnit === 'g') && quantityNum === 1) {
          // 1 gram is extremely small for a seed batch - more likely it's 1 lb
          displayUnit = 'lbs';
          // Quantity stays 1, just change the unit
        }
        // Case 2: Unit is 'lbs' but quantity is < 1 lb (has been partially used)
        // After deductions, the trigger should convert back to lbs, so 0.5 lbs is valid
        // But if it's a whole number like 160, 200, etc., it's likely grams mislabeled as lbs
        else if ((displayUnit === 'lbs' || displayUnit === 'lb') && quantityNum > 0 && quantityNum < 1) {
          // Check if it's a suspicious whole number (like 160, 200) vs a decimal (like 0.56)
          // If it's a whole number < 1, it's definitely wrong - should be grams
          if (quantityNum === Math.floor(quantityNum)) {
            // Whole number less than 1 - this is definitely grams, not lbs
            displayQuantity = quantityNum * 453.592; // Convert to grams
            displayUnit = 'grams';
          }
          // Otherwise it's a decimal like 0.56 lbs, which is correct after conversions
        }
        // Case 3: Unit is 'lbs' but quantity is a whole number 50-500
        // These are likely grams mislabeled as lbs (e.g., 160 grams showing as 160 lbs)
        // We exclude 1-49 because those could be valid lbs (1 lb, 2 lbs, etc.)
        // We exclude 500+ because those could be valid large batches
        else if ((displayUnit === 'lbs' || displayUnit === 'lb') && quantityNum >= 50 && quantityNum < 500) {
          // Check if it's a whole number (not a decimal like 1.5 lbs)
          if (quantityNum === Math.floor(quantityNum)) {
            // Whole number in suspicious range - likely grams
            displayUnit = 'grams';
            // Quantity is already in grams, no conversion needed
          }
        }
        // Case 4: Unit is 'grams' but quantity is very large (2000+), might actually be lbs
        // But be conservative - only convert if it's a whole number and very large
        else if ((displayUnit === 'grams' || displayUnit === 'g') && quantityNum >= 2000) {
          // 2000+ grams = 4.4+ lbs - if it's a whole number like 2000, 3000,
          // it's more likely to be lbs mislabeled as grams
          if (quantityNum === Math.floor(quantityNum)) {
            displayUnit = 'lbs';
            displayQuantity = quantityNum / 453.592; // Convert grams to lbs
          }
        }

        return addStatusToSupply({
          id: batchId,
          batch_id: batchId,
          supply_name: supplyName,
          category: 'Seeds',
          stock: displayQuantity,
          unit: displayUnit,
          low_stock_threshold: batch.low_stock_threshold ?? batch.reorderlevel ?? 0,
          notes: batch.lot_number || batch.lotnumber ? `Lot ${batch.lot_number || batch.lotnumber}` : undefined,
          is_seed_batch: true,
          created_at: batch.purchasedate || batch.purchase_date,
        });
      });
    } catch (error) {
      console.warn('Error building seed supplies:', error);
      return [];
    }
  };

  const fetchSupplies = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // Fetch supplies with vendor information
      // Try both vendorid and vendor_id column names
      const { data, error } = await supabase
        .from('supplies')
        .select(`
          *,
          vendors:vendor_id (*)
        `)
        .eq('farm_uuid', farmUuid)
        .eq('is_active', true);

      // Handle table not found (404) or table doesn't exist (42P01)
      if (error && (error.code === '42P01' || error.message?.includes('does not exist') || error.message?.includes('404'))) {
        // Table doesn't exist, use mock data for demonstration
        console.warn('Supplies table does not exist. Using mock data for demonstration.');
        setSupplies([
          { supply_id: 1, supply_name: '1020 Trays (No Holes)', category: 'Equipment', stock: 150, unit: 'pcs', status: 'In Stock' },
          { supply_id: 2, supply_name: 'Coco Coir Bricks', category: 'Growing Media', stock: 25, unit: 'bricks', status: 'Low Stock' },
          { supply_id: 3, supply_name: 'Sunflower Seeds (Black Oil)', category: 'Seeds', stock: 0, unit: 'lbs', status: 'Out of Stock' },
        ]);
      } else if (error) {
        throw error;
      } else if (data) {
        const formattedSupplies = data.map((supply: Supply & { vendors?: { vendorid?: number; vendor_id?: number; name?: string; vendor_name?: string } }) => {
          // Extract vendor name if vendor relationship exists
          // Handle both vendorid and vendor_id column names, and name/vendor_name
          const vendorName = supply.vendors?.name || supply.vendors?.vendor_name || null;
          
          return addStatusToSupply({
            ...supply,
            supply_name: supply.supply_name || supply.name || '',
            vendor_name: vendorName,
          });
        }).sort((a: Supply, b: Supply) => {
          const nameA = (a.supply_name || '').toLowerCase();
          const nameB = (b.supply_name || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });

        // Fetch seed batches and show them alongside supplies so Seeds appear in the list
        const seedSupplies: Supply[] = await fetchSeedSupplies(farmUuid);
        setSupplies(
          [...formattedSupplies, ...seedSupplies].sort((a, b) =>
            (a.supply_name || '').toLowerCase().localeCompare((b.supply_name || '').toLowerCase())
          )
        );
      }
    } catch (error: unknown) {
      console.error('Error fetching supplies:', error);
      // If it's a 404 or table doesn't exist, use mock data
      const err = error as { code?: string; message?: string };
      if (err.code === '42P01' || err.message?.includes('does not exist') || err.message?.includes('404')) {
        setSupplies([
          { supply_id: 1, supply_name: '1020 Trays (No Holes)', category: 'Equipment', stock: 150, unit: 'pcs', status: 'In Stock' },
          { supply_id: 2, supply_name: 'Coco Coir Bricks', category: 'Growing Media', stock: 25, unit: 'bricks', status: 'Low Stock' },
          { supply_id: 3, supply_name: 'Sunflower Seeds (Black Oil)', category: 'Seeds', stock: 0, unit: 'lbs', status: 'Out of Stock' },
        ]);
      } else {
        setSupplies([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // Fetch global templates (Sproutify-managed) and farm-specific templates
      const { data, error } = await supabase
        .from('supply_templates')
        .select('*')
        .eq('is_active', true)
        .or(`is_global.eq.true,farm_uuid.eq.${farmUuid}`)
        .order('is_global', { ascending: false }) // Global templates first
        .order('template_name', { ascending: true });

      if (error) {
        console.warn('Error fetching supply templates:', error);
        // Fallback to empty array if table doesn't exist yet
        setTemplates([]);
        return;
      }

      setTemplates((data || []) as SupplyTemplate[]);
    } catch (error) {
      console.error('Error fetching templates:', error);
      setTemplates([]);
    }
  };

  const fetchVendors = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      const { data, error } = await supabase
        .from('vendors')
        .select('vendorid, name')
        .eq('farm_uuid', farmUuid)
        .order('name', { ascending: true });

      if (error) {
        console.warn('Error fetching vendors:', error);
        setVendors([]);
        return;
      }

      // Normalize vendor data
      const normalized = (data || []).map((v: { vendorid?: number; vendor_id?: number; name?: string; vendor_name?: string }) => ({
        vendor_id: v.vendorid || v.vendor_id || 0,
        vendor_name: v.name || v.vendor_name || '',
      }));

      setVendors(normalized);
    } catch (error) {
      console.error('Error fetching vendors:', error);
      setVendors([]);
    }
  };

  useEffect(() => {
    fetchSupplies();
    fetchTemplates();
    fetchVendors();
  }, []);

  const handleAddSupply = async () => {
    if (!newSupply.supply_name) return;

    setCreating(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

      const payload = {
        supply_name: newSupply.supply_name,
        category: newSupply.category || null,
        stock: newSupply.stock ? parseFloat(newSupply.stock) : 0,
        unit: newSupply.unit || 'pcs',
        low_stock_threshold: newSupply.low_stock_threshold ? parseFloat(newSupply.low_stock_threshold) : 10,
        notes: newSupply.notes || null,
        color: newSupply.color || null,
        vendor_id: newSupply.vendor_id ? parseInt(newSupply.vendor_id) : null,
        farm_uuid: farmUuid,
        is_active: true,
      };

      const { error } = await supabase
        .from('supplies')
        .insert([payload]);

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist') || error.message?.includes('404')) {
          alert('The supplies table does not exist. Please run the migration file: supabase/migrations/003_create_supplies_table.sql');
        } else {
          throw error;
        }
        return;
      }

      setNewSupply({
        supply_name: '',
        category: 'Growing Supplies',
        stock: '',
        unit: 'pcs',
        low_stock_threshold: '',
        notes: '',
        color: '',
        vendor_id: '',
      });
      setIsAddDialogOpen(false);
      fetchSupplies();
    } catch (error) {
      console.error('Error creating supply:', error);
      alert('Failed to create supply');
    } finally {
      setCreating(false);
    }
  };

  const handleAdjustStock = async () => {
    if (!selectedSupply || !stockAdjustment.quantity) return;

    setAdjusting(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const currentStock = Number(selectedSupply.stock || 0);
      const adjustment = Number(stockAdjustment.quantity || 0);
      
      let newStock: number;
      if (stockAdjustment.adjustment_type === 'add') {
        newStock = currentStock + adjustment;
      } else {
        newStock = Math.max(0, currentStock - adjustment); // Don't go below 0
      }

      // Build notes update - append adjustment history
      const timestamp = new Date().toLocaleString();
      const adjustmentNote = `[${timestamp}] ${stockAdjustment.adjustment_type === 'add' ? 'Added' : 'Removed'} ${adjustment} ${selectedSupply.unit || 'units'}${stockAdjustment.reason ? `: ${stockAdjustment.reason}` : ''}`;
      const updatedNotes = selectedSupply.notes 
        ? `${selectedSupply.notes}\n${adjustmentNote}`
        : adjustmentNote;

      const { error } = await supabase
        .from('supplies')
        .update({ 
          stock: newStock,
          notes: updatedNotes
        })
        .eq('supply_id', selectedSupply.supply_id);

      if (error) throw error;

      setStockAdjustment({
        adjustment_type: 'add',
        quantity: '',
        reason: '',
      });
      setIsAdjustDialogOpen(false);
      const updatedSupplyId = selectedSupply.supply_id;
      setSelectedSupply(null);
      fetchSupplies();
      
      // Check if stock is now low/out and create notification
      if (updatedSupplyId) {
        checkSupplyStock(updatedSupplyId);
      }
    } catch (error: unknown) {
      console.error('Error adjusting stock:', error);
      alert('Failed to adjust stock');
    } finally {
      setAdjusting(false);
    }
  };

  const openAdjustDialog = (supply: Supply) => {
    if (supply.is_seed_batch) return; // Seed batches are managed separately
    setSelectedSupply(supply);
    setStockAdjustment({
      adjustment_type: 'add',
      quantity: '',
      reason: '',
    });
    setIsAdjustDialogOpen(true);
  };

  const openEditDialog = (supply: Supply) => {
    if (supply.is_seed_batch) return; // Seed batches are managed separately
    setSelectedSupply(supply);
    setIsEditDialogOpen(true);
  };

  const handleUpdateSupply = async () => {
    if (!selectedSupply || !selectedSupply.supply_id) return;

    setUpdating(true);
    try {
      const { error } = await supabase
        .from('supplies')
        .update({
          supply_name: selectedSupply.supply_name,
          category: selectedSupply.category,
          unit: selectedSupply.unit,
          low_stock_threshold: selectedSupply.low_stock_threshold ? parseFloat(selectedSupply.low_stock_threshold.toString()) : 10,
          color: selectedSupply.color || null,
          vendor_id: selectedSupply.vendor_id || null,
          notes: selectedSupply.notes || null,
        })
        .eq('supply_id', selectedSupply.supply_id);

      if (error) throw error;

      setIsEditDialogOpen(false);
      setSelectedSupply(null);
      fetchSupplies();
      
      // Check if stock is now low/out and create notification
      checkSupplyStock(selectedSupply.supply_id);
    } catch (error: unknown) {
      console.error('Error updating supply:', error);
      alert('Failed to update supply');
    } finally {
      setUpdating(false);
    }
  };

  // Get unique categories for filter (include defaults so dropdown is always populated)
  const categories = Array.from(new Set([
    ...DEFAULT_CATEGORIES,
    ...supplies.map(s => s.category).filter((cat): cat is string => Boolean(cat)),
  ]));

  const filteredSupplies = supplies.filter(supply => {
    const matchesSearch = (supply.supply_name || supply.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (supply.category && supply.category.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || supply.category === selectedCategory;
    
    // If showing needs attention, only show low stock and out of stock
    if (showNeedsAttention) {
      const needsAttention = supply.status === 'Low Stock' || supply.status === 'Out of Stock';
      return matchesSearch && matchesCategory && needsAttention;
    }
    
    const matchesStatus = selectedStatus === 'all' || supply.status === selectedStatus;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Calculate summary stats
  const totalSupplies = supplies.length;
  const lowStockCount = supplies.filter(s => s.status === 'Low Stock').length;
  const outOfStockCount = supplies.filter(s => s.status === 'Out of Stock').length;

  const getStatusVariant = (status?: string) => {
    switch (status) {
      case 'In Stock': return 'default';
      case 'Low Stock': return 'secondary';
      case 'Out of Stock': return 'destructive';
      default: return 'outline';
    }
  };

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Supplies</h1>
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
          <h1 className="text-3xl font-bold tracking-tight">Supplies</h1>
          <p className="text-muted-foreground">
            Manage your inventory and supplies
            {supplies.length > 0 && supplies[0]?.supply_id === 1 && supplies[0]?.supply_name === '1020 Trays (No Holes)' && (
              <span className="ml-2 text-xs text-yellow-600">(Using demo data - supplies table not found)</span>
            )}
          </p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Supply
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add New Supply</DialogTitle>
              <DialogDescription>
                Track inventory items including growing supplies (trays, domes), growing media (soil, coco coir), and packaging (containers, lids).
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Item Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., 1020 Trays (No Holes), 2oz Containers, Coco Coir"
                  value={newSupply.supply_name}
                  onChange={(e) => setNewSupply({ ...newSupply, supply_name: e.target.value })}
                />
                <div className="text-xs text-muted-foreground mt-1">
                  <p className="font-medium mb-1">Quick Add from Templates:</p>
                  {getPresetsForCategory(newSupply.category, templates).length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {getPresetsForCategory(newSupply.category, templates).map((template) => (
                        <Button
                          key={template.template_id}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setNewSupply({
                              ...newSupply,
                              supply_name: template.template_name,
                              category: template.category,
                              unit: template.unit,
                              color: template.color || '',
                              low_stock_threshold: template.default_low_stock_threshold.toString(),
                            });
                          }}
                        >
                          {template.template_name}
                          {template.is_global && (
                            <span className="ml-1 text-[10px] opacity-60">(Sproutify)</span>
                          )}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs italic">No templates for this category. You can add a custom supply.</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select 
                    value={newSupply.category} 
                    onValueChange={(value) => setNewSupply({ ...newSupply, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Growing Supplies">Growing Supplies</SelectItem>
                      <SelectItem value="Growing Media">Growing Media</SelectItem>
                      <SelectItem value="Trays">Trays</SelectItem>
                      <SelectItem value="Packaging">Packaging</SelectItem>
                      <SelectItem value="Seeds">Seeds</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit">Unit</Label>
                  <Select 
                    value={newSupply.unit} 
                    onValueChange={(value) => setNewSupply({ ...newSupply, unit: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pcs">pcs (pieces)</SelectItem>
                      <SelectItem value="lbs">lbs (pounds)</SelectItem>
                      <SelectItem value="oz">oz (ounces)</SelectItem>
                      <SelectItem value="kg">kg (kilograms)</SelectItem>
                      <SelectItem value="g">g (grams)</SelectItem>
                      <SelectItem value="bricks">bricks</SelectItem>
                      <SelectItem value="bags">bags</SelectItem>
                      <SelectItem value="cubic ft">cubic ft</SelectItem>
                      <SelectItem value="cases">cases</SelectItem>
                      <SelectItem value="packs">packs</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {(newSupply.category === 'Trays' || newSupply.category === 'Packaging') && (
                <div className="grid gap-2">
                  <Label htmlFor="color">Color (Optional)</Label>
                  <Select 
                    value={newSupply.color || ''} 
                    onValueChange={(value) => setNewSupply({ ...newSupply, color: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select color" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Color / N/A</SelectItem>
                      {TRAY_COLORS.map((color) => (
                        <SelectItem key={color} value={color}>{color}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="vendor">Vendor (Optional)</Label>
                <Select 
                  value={newSupply.vendor_id || ''} 
                  onValueChange={(value) => setNewSupply({ ...newSupply, vendor_id: value === 'none' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select vendor (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Vendor</SelectItem>
                    {vendors.map((vendor) => (
                      <SelectItem key={vendor.vendor_id} value={vendor.vendor_id.toString()}>
                        {vendor.vendor_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stock">Current Stock</Label>
                  <Input
                    id="stock"
                    type="number"
                    step="0.1"
                    placeholder="0"
                    value={newSupply.stock}
                    onChange={(e) => setNewSupply({ ...newSupply, stock: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="threshold">Low Stock Threshold</Label>
                  <Input
                    id="threshold"
                    type="number"
                    step="0.1"
                    placeholder="10"
                    value={newSupply.low_stock_threshold}
                    onChange={(e) => setNewSupply({ ...newSupply, low_stock_threshold: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddSupply} disabled={creating || !newSupply.supply_name}>
                {creating ? 'Creating...' : 'Create Supply'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Stock Adjustment Dialog */}
        <Dialog open={isAdjustDialogOpen} onOpenChange={setIsAdjustDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Adjust Stock</DialogTitle>
              <DialogDescription>
                {selectedSupply && `Adjust inventory for: ${selectedSupply.supply_name}`}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Current Stock</Label>
                <div className="text-2xl font-bold">
                  {selectedSupply?.stock || 0} {selectedSupply?.unit || 'units'}
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="adjustment_type">Adjustment Type</Label>
                <Select 
                  value={stockAdjustment.adjustment_type} 
                  onValueChange={(value) => setStockAdjustment({ ...stockAdjustment, adjustment_type: value as 'add' | 'remove' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">Add Stock</SelectItem>
                    <SelectItem value="remove">Remove Stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="0.1"
                  placeholder="0"
                  value={stockAdjustment.quantity}
                  onChange={(e) => setStockAdjustment({ ...stockAdjustment, quantity: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="reason">Reason (Optional)</Label>
                <Input
                  id="reason"
                  placeholder="e.g., Received shipment, Used for trays"
                  value={stockAdjustment.reason}
                  onChange={(e) => setStockAdjustment({ ...stockAdjustment, reason: e.target.value })}
                />
              </div>
              {selectedSupply && stockAdjustment.quantity && (
                <div className="rounded-lg bg-muted p-3">
                  <div className="text-sm text-muted-foreground">New Stock:</div>
                  <div className="text-lg font-semibold">
                    {stockAdjustment.adjustment_type === 'add'
                      ? (Number(selectedSupply.stock || 0) + Number(stockAdjustment.quantity || 0)).toFixed(2)
                      : Math.max(0, Number(selectedSupply.stock || 0) - Number(stockAdjustment.quantity || 0)).toFixed(2)
                    } {selectedSupply.unit || 'units'}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAdjustDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAdjustStock} disabled={adjusting || !stockAdjustment.quantity}>
                {adjusting ? 'Adjusting...' : 'Adjust Stock'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Supply Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Edit Supply</DialogTitle>
              <DialogDescription>
                Update supply details and threshold settings.
              </DialogDescription>
            </DialogHeader>
            {selectedSupply && (
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-name">Item Name</Label>
                  <Input
                    id="edit-name"
                    value={selectedSupply.supply_name || ''}
                    onChange={(e) => setSelectedSupply({ ...selectedSupply, supply_name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-category">Category</Label>
                    <Select 
                      value={selectedSupply.category || ''} 
                      onValueChange={(value) => setSelectedSupply({ ...selectedSupply, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Growing Supplies">Growing Supplies</SelectItem>
                        <SelectItem value="Growing Media">Growing Media</SelectItem>
                        <SelectItem value="Trays">Trays</SelectItem>
                        <SelectItem value="Packaging">Packaging</SelectItem>
                        <SelectItem value="Seeds">Seeds</SelectItem>
                        <SelectItem value="Equipment">Equipment</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-unit">Unit</Label>
                    <Select 
                      value={selectedSupply.unit || 'pcs'} 
                      onValueChange={(value) => setSelectedSupply({ ...selectedSupply, unit: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pcs">pcs (pieces)</SelectItem>
                        <SelectItem value="lbs">lbs (pounds)</SelectItem>
                        <SelectItem value="oz">oz (ounces)</SelectItem>
                        <SelectItem value="kg">kg (kilograms)</SelectItem>
                        <SelectItem value="g">g (grams)</SelectItem>
                        <SelectItem value="bricks">bricks</SelectItem>
                        <SelectItem value="bags">bags</SelectItem>
                        <SelectItem value="cubic ft">cubic ft</SelectItem>
                        <SelectItem value="cases">cases</SelectItem>
                        <SelectItem value="packs">packs</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {(selectedSupply.category === 'Trays' || selectedSupply.category === 'Packaging') && (
                  <div className="grid gap-2">
                    <Label htmlFor="edit-color">Color (Optional)</Label>
                    <Select 
                      value={selectedSupply.color || ''} 
                      onValueChange={(value) => setSelectedSupply({ ...selectedSupply, color: value === 'none' ? '' : value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select color" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Color / N/A</SelectItem>
                        {TRAY_COLORS.map((color) => (
                          <SelectItem key={color} value={color}>{color}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid gap-2">
                  <Label htmlFor="edit-vendor">Vendor (Optional)</Label>
                  <Select 
                    value={selectedSupply.vendor_id?.toString() || ''} 
                    onValueChange={(value) => setSelectedSupply({ ...selectedSupply, vendor_id: value === 'none' ? null : parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select vendor (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Vendor</SelectItem>
                      {vendors.map((vendor) => (
                        <SelectItem key={vendor.vendor_id} value={vendor.vendor_id.toString()}>
                          {vendor.vendor_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-threshold">Low Stock Threshold</Label>
                  <Input
                    id="edit-threshold"
                    type="number"
                    step="0.1"
                    placeholder="10"
                    value={selectedSupply.low_stock_threshold || ''}
                    onChange={(e) => setSelectedSupply({ ...selectedSupply, low_stock_threshold: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Alert when stock falls below this amount</p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateSupply} disabled={updating || !selectedSupply?.supply_name}>
                {updating ? 'Updating...' : 'Update Supply'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm text-muted-foreground">Total Supplies</div>
          <div className="text-2xl font-bold">{totalSupplies}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm text-muted-foreground">In Stock</div>
          <div className="text-2xl font-bold text-green-600">{totalSupplies - lowStockCount - outOfStockCount}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm text-muted-foreground">Low Stock</div>
          <div className="text-2xl font-bold text-yellow-600">{lowStockCount}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm text-muted-foreground">Out of Stock</div>
          <div className="text-2xl font-bold text-red-600">{outOfStockCount}</div>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search supplies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((cat: string) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!showNeedsAttention && (
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="In Stock">In Stock</SelectItem>
              <SelectItem value="Low Stock">Low Stock</SelectItem>
              <SelectItem value="Out of Stock">Out of Stock</SelectItem>
            </SelectContent>
          </Select>
        )}
        {(lowStockCount > 0 || outOfStockCount > 0) && (
          <>
            <Button 
              variant="outline" 
              onClick={() => {
                setSelectedStatus('all');
                setSelectedCategory('all');
                setSearchTerm('');
                setShowNeedsAttention(false);
              }}
            >
              Clear Filters
            </Button>
            <Button 
              variant={showNeedsAttention ? "default" : "destructive"} 
              onClick={() => {
                setShowNeedsAttention(!showNeedsAttention);
                if (!showNeedsAttention) {
                  setSelectedStatus('all');
                  setSelectedCategory('all');
                }
              }}
            >
              {showNeedsAttention ? 'Show All' : `Needs Attention (${lowStockCount + outOfStockCount})`}
            </Button>
          </>
        )}
      </div>

      <div className="rounded-md border bg-card text-card-foreground shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Current Stock</TableHead>
              <TableHead>Threshold</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSupplies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <Package className="h-8 w-8 mb-2 opacity-50" />
                    <p>No supplies found.</p>
                    {searchTerm && (
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => setSearchTerm('')}>
                        Clear Search
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredSupplies.map((supply) => {
                const isLowStock = supply.status === 'Low Stock';
                const isOutOfStock = supply.status === 'Out of Stock';
                const isSeedBatch = supply.is_seed_batch;
                return (
                  <TableRow 
                    key={supply.supply_id || supply.id}
                    className={isOutOfStock ? 'bg-red-50/50' : isLowStock ? 'bg-yellow-50/50' : ''}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {isOutOfStock && <span className="text-red-500">⚠️</span>}
                        {isLowStock && !isOutOfStock && <span className="text-yellow-500">⚠️</span>}
                        <span>{supply.supply_name || supply.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{supply.category || 'Uncategorized'}</Badge>
                    </TableCell>
                    <TableCell>
                      {supply.color ? (
                        <Badge variant="secondary" className="capitalize">
                          {supply.color}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {supply.vendor_name ? (
                        <span className="text-sm">{supply.vendor_name}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${isOutOfStock ? 'text-red-600' : isLowStock ? 'text-yellow-600' : ''}`}>
                          {supply.stock || 0}
                        </span>
                        <span className="text-muted-foreground text-sm">{supply.unit || 'units'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{supply.low_stock_threshold || 10}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(supply.status)}>
                        {supply.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {!isSeedBatch && (
                          <>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => openEditDialog(supply)}
                              title="Edit Supply Details"
                            >
                              <Settings className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => openAdjustDialog(supply)}
                              title="Adjust Stock"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {isSeedBatch && (
                          <span className="text-xs text-muted-foreground">Manage on Batches page</span>
                        )}
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

export default SuppliesPage;
