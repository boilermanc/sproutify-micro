import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, DollarSign } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface Product {
  product_id: number;
  product_name: string;
}

interface ProductVariant {
  variant_id: number;
  product_id: number;
  variant_name: string;
  size: string | null;
  price: number;
  unit: string;
  is_active: boolean;
}

interface VariantManagerProps {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

const VariantManager = ({ product, open, onOpenChange, onUpdate }: VariantManagerProps) => {
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [newVariant, setNewVariant] = useState({
    variant_name: '',
    size: '',
    price: '',
    unit: 'oz',
  });

  const fetchVariants = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await getSupabaseClient()
        .from('product_variants')
        .select('*')
        .eq('product_id', product.product_id)
        .order('price', { ascending: true });

      if (error) throw error;
      setVariants(data || []);
    } catch (error) {
      console.error('Error fetching variants:', error);
    } finally {
      setLoading(false);
    }
  }, [product]);

  useEffect(() => {
    if (open && product) {
      fetchVariants();
    }
  }, [open, product, fetchVariants]);

  const handleAddVariant = async () => {
    if (!newVariant.variant_name || !newVariant.price) return;

    setCreating(true);
    try {
      const payload = {
        product_id: product.product_id,
        variant_name: newVariant.variant_name,
        size: newVariant.size || null,
        price: parseFloat(newVariant.price),
        unit: newVariant.unit,
        is_active: true,
      };

      const { error } = await getSupabaseClient()
        .from('product_variants')
        .insert([payload]);

      if (error) throw error;

      setNewVariant({ variant_name: '', size: '', price: '', unit: 'oz' });
      setIsAddDialogOpen(false);
      fetchVariants();
      onUpdate();
    } catch (error) {
      console.error('Error creating variant:', error);
      alert('Failed to create variant');
    } finally {
      setCreating(false);
    }
  };

  const handleEditVariant = (variant: ProductVariant) => {
    setEditingVariant(variant);
    setIsEditDialogOpen(true);
  };

  const handleUpdateVariant = async () => {
    if (!editingVariant || !editingVariant.variant_name || !editingVariant.price) return;

    setUpdating(true);
    try {
      const payload = {
        variant_name: editingVariant.variant_name,
        size: editingVariant.size || null,
        price: editingVariant.price,
        unit: editingVariant.unit,
      };

      const { error } = await getSupabaseClient()
        .from('product_variants')
        .update(payload)
        .eq('variant_id', editingVariant.variant_id);

      if (error) throw error;

      setIsEditDialogOpen(false);
      setEditingVariant(null);
      fetchVariants();
      onUpdate();
    } catch (error) {
      console.error('Error updating variant:', error);
      alert('Failed to update variant');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteVariant = async (variant: ProductVariant) => {
    if (!confirm(`Are you sure you want to delete "${variant.variant_name}"?`)) return;

    try {
      // Soft delete
      const { error } = await getSupabaseClient()
        .from('product_variants')
        .update({ is_active: false })
        .eq('variant_id', variant.variant_id);

      if (error) throw error;

      fetchVariants();
      onUpdate();
    } catch (error) {
      console.error('Error deleting variant:', error);
      alert('Failed to delete variant');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Variants - {product.product_name}</DialogTitle>
          <DialogDescription>
            Add and manage product variants (sizes and prices)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Variant
            </Button>
          </div>

          {loading ? (
            <div className="text-center py-8">Loading variants...</div>
          ) : variants.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No variants yet. Add your first variant to get started.
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Variant Name</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {variants.map((variant) => (
                    <TableRow key={variant.variant_id}>
                      <TableCell className="font-medium">{variant.variant_name}</TableCell>
                      <TableCell>{variant.size || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-4 w-4 text-gray-400" />
                          {variant.price.toFixed(2)}
                        </div>
                      </TableCell>
                      <TableCell>{variant.unit}</TableCell>
                      <TableCell>
                        <Badge variant={variant.is_active ? 'default' : 'secondary'}>
                          {variant.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditVariant(variant)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteVariant(variant)}
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>

        {/* Add Variant Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Variant</DialogTitle>
              <DialogDescription>
                Add a new variant for {product.product_name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="variant_name">Variant Name *</Label>
                <Input
                  id="variant_name"
                  value={newVariant.variant_name}
                  onChange={(e) => setNewVariant({ ...newVariant, variant_name: e.target.value })}
                  placeholder="e.g., Small, Medium, Large"
                />
              </div>
              <div>
                <Label htmlFor="size">Size</Label>
                <Input
                  id="size"
                  value={newVariant.size}
                  onChange={(e) => setNewVariant({ ...newVariant, size: e.target.value })}
                  placeholder="e.g., 2oz, 4oz"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="price">Price *</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={newVariant.price}
                    onChange={(e) => setNewVariant({ ...newVariant, price: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label htmlFor="unit">Unit</Label>
                  <Input
                    id="unit"
                    value={newVariant.unit}
                    onChange={(e) => setNewVariant({ ...newVariant, unit: e.target.value })}
                    placeholder="oz"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddVariant} disabled={creating}>
                {creating ? 'Creating...' : 'Create Variant'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Variant Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Variant</DialogTitle>
              <DialogDescription>
                Update variant information
              </DialogDescription>
            </DialogHeader>
            {editingVariant && (
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="edit_variant_name">Variant Name *</Label>
                  <Input
                    id="edit_variant_name"
                    value={editingVariant.variant_name}
                    onChange={(e) => setEditingVariant({ ...editingVariant, variant_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit_size">Size</Label>
                  <Input
                    id="edit_size"
                    value={editingVariant.size || ''}
                    onChange={(e) => setEditingVariant({ ...editingVariant, size: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit_price">Price *</Label>
                    <Input
                      id="edit_price"
                      type="number"
                      step="0.01"
                      value={editingVariant.price}
                      onChange={(e) => setEditingVariant({ ...editingVariant, price: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit_unit">Unit</Label>
                    <Input
                      id="edit_unit"
                      value={editingVariant.unit}
                      onChange={(e) => setEditingVariant({ ...editingVariant, unit: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateVariant} disabled={updating}>
                {updating ? 'Updating...' : 'Update Variant'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};

export default VariantManager;

