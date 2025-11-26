import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { checkSupplyStock } from '../services/notificationService';
import { Edit, Package, Plus, Search } from 'lucide-react';
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
  supply_name?: string;
  name?: string;
  category?: string;
  stock?: number | string;
  unit?: string;
  low_stock_threshold?: number | string;
  status?: string;
  notes?: string;
  farm_uuid?: string;
  is_active?: boolean;
  created_at?: string;
}

const SuppliesPage = () => {
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [showNeedsAttention, setShowNeedsAttention] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isAdjustDialogOpen, setIsAdjustDialogOpen] = useState(false);
  const [selectedSupply, setSelectedSupply] = useState<Supply | null>(null);
  const [creating, setCreating] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [newSupply, setNewSupply] = useState({
    supply_name: '',
    category: 'Equipment',
    stock: '',
    unit: 'pcs',
    low_stock_threshold: '',
    notes: '',
  });
  const [stockAdjustment, setStockAdjustment] = useState({
    adjustment_type: 'add', // 'add' or 'remove'
    quantity: '',
    reason: '',
  });

  const fetchSupplies = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // Actual DB columns: supply_id, supply_name, category, stock, unit, low_stock_threshold
      const { data, error } = await supabase
        .from('supplies')
        .select('*')
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
        // Calculate status based on stock levels
        const formattedSupplies = data.map((supply: Supply) => {
          const stock = Number(supply.stock || 0);
          const threshold = Number(supply.low_stock_threshold || 10);
          let status = 'In Stock';
          if (stock === 0) {
            status = 'Out of Stock';
          } else if (stock <= threshold) {
            status = 'Low Stock';
          }
          return {
            ...supply,
            supply_name: supply.supply_name || supply.name || '',
            stock: stock,
            status,
          };
        }).sort((a: Supply, b: Supply) => {
          const nameA = (a.supply_name || '').toLowerCase();
          const nameB = (b.supply_name || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });
        setSupplies(formattedSupplies);
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

  useEffect(() => {
    fetchSupplies();
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
        category: 'Equipment',
        stock: '',
        unit: 'pcs',
        low_stock_threshold: '',
        notes: '',
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
    setSelectedSupply(supply);
    setStockAdjustment({
      adjustment_type: 'add',
      quantity: '',
      reason: '',
    });
    setIsAdjustDialogOpen(true);
  };

  // Get unique categories for filter
  const categories = Array.from(new Set(supplies.map(s => s.category).filter((cat): cat is string => Boolean(cat))));

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
                Track inventory items and supplies.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Item Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., 1020 Trays (No Holes)"
                  value={newSupply.supply_name}
                  onChange={(e) => setNewSupply({ ...newSupply, supply_name: e.target.value })}
                />
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
                      <SelectItem value="Equipment">Equipment</SelectItem>
                      <SelectItem value="Growing Media">Growing Media</SelectItem>
                      <SelectItem value="Seeds">Seeds</SelectItem>
                      <SelectItem value="Supplies">Supplies</SelectItem>
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
                      <SelectItem value="pcs">pcs</SelectItem>
                      <SelectItem value="lbs">lbs</SelectItem>
                      <SelectItem value="oz">oz</SelectItem>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="g">g</SelectItem>
                      <SelectItem value="bricks">bricks</SelectItem>
                      <SelectItem value="bags">bags</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
              <TableHead>Current Stock</TableHead>
              <TableHead>Threshold</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSupplies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
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
                return (
                  <TableRow 
                    key={supply.supply_id || supply.id}
                    className={isOutOfStock ? 'bg-red-50/50' : isLowStock ? 'bg-yellow-50/50' : ''}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {isOutOfStock && <span className="text-red-500">⚠️</span>}
                        {isLowStock && !isOutOfStock && <span className="text-yellow-500">⚠️</span>}
                        {supply.supply_name || supply.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{supply.category || 'Uncategorized'}</Badge>
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
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => openAdjustDialog(supply)}
                          title="Adjust Stock"
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
    </div>
  );
};

export default SuppliesPage;
