import { useState, useEffect } from 'react';
import { Sprout, Edit, Trash2, Plus, Search, ArrowUp, ArrowDown, Package } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import EmptyState from '../components/onboarding/EmptyState';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type SortField = 'name' | 'description' | 'status' | 'stock';
type SortDirection = 'asc' | 'desc';

const VarietiesPage = () => {
  const [varieties, setVarieties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingVariety, setEditingVariety] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [newVariety, setNewVariety] = useState({
    variety_name: '',
    description: '',
    stock: 0,
    stock_unit: 'g',
  });

  const fetchVarieties = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) {
        setLoading(false);
        return;
      }

      const { farmUuid } = JSON.parse(sessionData);
      if (!farmUuid) {
        setLoading(false);
        return;
      }

      // Fetch varieties from varieties_view filtered by farm_uuid
      // The view includes is_active from farm_varieties table
      const { data, error } = await supabase
        .from('varieties_view')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .order('name', { ascending: true });

      if (error) throw error;

      // Map DB columns to expected format: varietyid -> variety_id, name -> variety_name
      const normalized = (data || []).map((v: any) => ({
        ...v,
        variety_id: v.varietyid || v.variety_id,
        variety_name: v.name || v.variety_name || '',
        stock: v.stock ?? 0,
        stock_unit: v.stock_unit || v.stockUnit || 'g',
        is_active: v.is_active ?? false, // From farm_varieties via view
      }));

      setVarieties(normalized);
    } catch (error) {
      console.error('Error fetching varieties:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVarieties();
  }, []);

  const handleAddVariety = async () => {
    if (!newVariety.variety_name) return;

    setCreating(true);
    try {
      // Use actual DB column names: name (not variety_name), no farm_uuid
      const payload = {
        name: newVariety.variety_name, // DB column is 'name'
        description: newVariety.description || null,
        stock: newVariety.stock || 0,
        stock_unit: newVariety.stock_unit || 'g',
        // No farm_uuid - varieties are global
      };

      const { error } = await supabase
        .from('varieties')
        .insert([payload]);

      if (error) throw error;

      setNewVariety({ variety_name: '', description: '', stock: 0, stock_unit: 'g' });
      setIsAddDialogOpen(false);
      fetchVarieties();
    } catch (error) {
      console.error('Error creating variety:', error);
      alert('Failed to create variety');
    } finally {
      setCreating(false);
    }
  };

  const handleEditVariety = (variety: any) => {
    setEditingVariety({
      ...variety,
      variety_name: variety.variety_name || variety.name || '',
      description: variety.description || '',
      stock: variety.stock ?? 0,
      stock_unit: variety.stock_unit || variety.stockUnit || 'g',
      // Note: is_active is farm-specific and shown in the table, not in edit dialog
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateVariety = async () => {
    if (!editingVariety || !editingVariety.variety_name) return;

    setUpdating(true);
    try {
      const varietyId = editingVariety.varietyid || editingVariety.variety_id;
      
      // Update variety details (varieties are global, so update the varieties table)
      // Note: is_active is farm-specific and handled via farm_varieties, not here
      const payload: any = {
        name: editingVariety.variety_name,
        description: editingVariety.description || null,
        stock: editingVariety.stock ?? 0,
        stock_unit: editingVariety.stock_unit || 'g',
      };

      const { error } = await supabase
        .from('varieties')
        .update(payload)
        .eq('varietyid', varietyId);

      if (error) throw error;

      setIsEditDialogOpen(false);
      setEditingVariety(null);
      fetchVarieties();
    } catch (error) {
      console.error('Error updating variety:', error);
      alert('Failed to update variety');
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleActive = async (variety: any) => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) {
        alert('Session not found. Please refresh the page.');
        return;
      }

      const { farmUuid } = JSON.parse(sessionData);
      if (!farmUuid) {
        alert('Farm UUID not found. Please refresh the page.');
        return;
      }

      // Get the actual ID from the variety object
      const varietyId = variety.varietyid || variety.variety_id || variety.id;
      const newActiveStatus = !variety.is_active;

      if (!varietyId) {
        console.error('No variety ID found', variety);
        alert('Unable to identify variety');
        return;
      }

      // Check if a farm_varieties record already exists
      const { data: existingRecord, error: checkError } = await supabase
        .from('farm_varieties')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .eq('variety_id', varietyId)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "not found" error
        throw checkError;
      }

      if (existingRecord) {
        // Update existing record
        const { error: updateError } = await supabase
          .from('farm_varieties')
          .update({ is_active: newActiveStatus })
          .eq('farm_uuid', farmUuid)
          .eq('variety_id', varietyId);

        if (updateError) throw updateError;
      } else {
        // Insert new record
        const { error: insertError } = await supabase
          .from('farm_varieties')
          .insert({
            farm_uuid: farmUuid,
            variety_id: varietyId,
            is_active: newActiveStatus,
          });

        if (insertError) throw insertError;
      }

      fetchVarieties();
    } catch (error: any) {
      console.error('Error toggling variety status:', error);
      alert(`Failed to update variety status: ${error.message || 'Unknown error'}`);
    }
  };

  const handleDeleteVariety = async (variety: any) => {
    if (!confirm(`Are you sure you want to delete "${variety.variety_name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const varietyId = variety.varietyid || variety.variety_id;

      const { error } = await supabase
        .from('varieties')
        .delete()
        .eq('varietyid', varietyId);

      if (error) throw error;

      fetchVarieties();
    } catch (error) {
      console.error('Error deleting variety:', error);
      alert('Failed to delete variety');
    }
  };

  const filteredVarieties = varieties
    .filter(v => 
      v.variety_name.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'name':
          const nameA = (a.variety_name || '').toLowerCase();
          const nameB = (b.variety_name || '').toLowerCase();
          comparison = nameA.localeCompare(nameB);
          break;
        case 'description':
          const descA = (a.description || '').toLowerCase();
          const descB = (b.description || '').toLowerCase();
          comparison = descA.localeCompare(descB);
          break;
        case 'status':
          // Active (true) comes before Inactive (false) when ascending
          const statusA = a.is_active ? 1 : 0;
          const statusB = b.is_active ? 1 : 0;
          comparison = statusA - statusB;
          break;
        case 'stock':
          const stockA = a.stock ?? 0;
          const stockB = b.stock ?? 0;
          comparison = stockA - stockB;
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Microgreen Varieties</h1>
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
          <h1 className="text-3xl font-bold tracking-tight">Microgreen Varieties</h1>
          <p className="text-muted-foreground">Manage your microgreen catalog</p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Variety
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add New Variety</DialogTitle>
              <DialogDescription>
                Add a new microgreen variety to your catalog.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Sunflower Black Oil"
                  value={newVariety.variety_name}
                  onChange={(e) => setNewVariety({ ...newVariety, variety_name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Nutty flavor, crunchy texture..."
                  value={newVariety.description}
                  onChange={(e) => setNewVariety({ ...newVariety, description: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="stock">Initial Stock</Label>
                <div className="flex gap-2">
                  <Input
                    id="stock"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={newVariety.stock}
                    onChange={(e) => setNewVariety({ ...newVariety, stock: parseFloat(e.target.value) || 0 })}
                  />
                  <Select 
                    value={newVariety.stock_unit} 
                    onValueChange={(value) => setNewVariety({ ...newVariety, stock_unit: value })}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="g">g</SelectItem>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="oz">oz</SelectItem>
                      <SelectItem value="lbs">lbs</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddVariety} disabled={creating || !newVariety.variety_name}>
                {creating ? 'Creating...' : 'Create Variety'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Edit Variety</DialogTitle>
              <DialogDescription>
                Update the variety information and stock level.
              </DialogDescription>
            </DialogHeader>
            {editingVariety && (
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    placeholder="e.g., Sunflower Black Oil"
                    value={editingVariety.variety_name}
                    onChange={(e) => setEditingVariety({ ...editingVariety, variety_name: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea
                    id="edit-description"
                    placeholder="Nutty flavor, crunchy texture..."
                    value={editingVariety.description}
                    onChange={(e) => setEditingVariety({ ...editingVariety, description: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-stock">Stock</Label>
                  <div className="flex gap-2">
                    <Input
                      id="edit-stock"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      value={editingVariety.stock}
                      onChange={(e) => setEditingVariety({ ...editingVariety, stock: parseFloat(e.target.value) || 0 })}
                    />
                    <Select 
                      value={editingVariety.stock_unit || 'g'} 
                      onValueChange={(value) => setEditingVariety({ ...editingVariety, stock_unit: value })}
                    >
                      <SelectTrigger className="w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="g">g</SelectItem>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="oz">oz</SelectItem>
                        <SelectItem value="lbs">lbs</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateVariety} disabled={updating || !editingVariety?.variety_name}>
                {updating ? 'Updating...' : 'Update Variety'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search varieties..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={sortField} onValueChange={(value) => setSortField(value as SortField)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="description">Description</SelectItem>
            <SelectItem value="status">Status</SelectItem>
            <SelectItem value="stock">Stock</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
          title={`Sort ${sortDirection === 'asc' ? 'Ascending' : 'Descending'}`}
        >
          {sortDirection === 'asc' ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div className="rounded-md border bg-card text-card-foreground shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredVarieties.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="p-0 border-none">
                  <div className="p-8 flex flex-col items-center justify-center text-center">
                     {searchTerm ? (
                       <>
                         <p className="text-muted-foreground mb-4">No varieties found matching "{searchTerm}"</p>
                         <Button variant="outline" onClick={() => setSearchTerm('')}>Clear Search</Button>
                       </>
                     ) : (
                        <EmptyState
                          icon={<Sprout size={64} className="text-muted-foreground mb-4" />}
                          title="No Varieties Yet"
                          description="Varieties are the types of microgreens you grow. Add your first variety to get started!"
                          actionLabel="+ Add Your First Variety"
                          onAction={() => setIsAddDialogOpen(true)}
                          showOnboardingLink={true}
                        />
                     )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredVarieties.map((v) => (
                <TableRow key={v.variety_id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center text-green-700">
                        <Sprout size={16} />
                      </div>
                      {v.variety_name}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{v.description || '-'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {v.stock ?? 0} {v.stock_unit || 'g'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={v.is_active ? 'default' : 'secondary'} 
                      className={cn(
                        v.is_active ? 'bg-green-500 hover:bg-green-600' : 'hover:bg-gray-400',
                        'cursor-pointer transition-colors'
                      )}
                      onClick={() => handleToggleActive(v)}
                    >
                      {v.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEditVariety(v)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteVariety(v)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default VarietiesPage;
