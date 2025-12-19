import { useState, useEffect } from 'react';
import { Package, Edit, Trash2, Plus, Search, Tag } from 'lucide-react';
import { getSupabaseClient } from '../lib/supabaseClient';
import EmptyState from '../components/onboarding/EmptyState';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import VariantManager from '../components/products/VariantManager';
import ProductMixEditor from '../components/products/ProductMixEditor';

interface Product {
  product_id: number;
  product_name: string;
  description: string | null;
  product_type: 'live' | 'packaged';
  is_active: boolean;
  created_at: string;
  variants?: ProductVariant[];
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

const ProductsPage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isVariantDialogOpen, setIsVariantDialogOpen] = useState(false);
  const [isMixDialogOpen, setIsMixDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [newProduct, setNewProduct] = useState({
    product_name: '',
    description: '',
    product_type: 'live' as 'live' | 'packaged',
  });

  const fetchProducts = async () => {
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

      // Fetch products with variants
      const { data: productsData, error: productsError } = await getSupabaseClient()
        .from('products')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .order('product_name', { ascending: true });

      if (productsError) throw productsError;

      // Fetch variants for each product
      if (productsData && productsData.length > 0) {
        const productIds = productsData.map(p => p.product_id);
        const { data: variantsData, error: variantsError } = await getSupabaseClient()
          .from('product_variants')
          .select('*')
          .in('product_id', productIds)
          .eq('is_active', true);

        if (variantsError) throw variantsError;

        // Group variants by product_id
        const variantsByProduct: Record<number, ProductVariant[]> = {};
        (variantsData || []).forEach((v: any) => {
          if (!variantsByProduct[v.product_id]) {
            variantsByProduct[v.product_id] = [];
          }
          variantsByProduct[v.product_id].push(v);
        });

        // Attach variants to products
        const productsWithVariants = productsData.map((p: any) => ({
          ...p,
          variants: variantsByProduct[p.product_id] || [],
        }));

        setProducts(productsWithVariants);
      } else {
        setProducts([]);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleAddProduct = async () => {
    if (!newProduct.product_name) return;

    setCreating(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);
      const { data: { user } } = await getSupabaseClient().auth.getUser();

      const payload = {
        farm_uuid: farmUuid,
        product_name: newProduct.product_name,
        description: newProduct.description || null,
        product_type: newProduct.product_type,
        is_active: true,
        created_by: user?.id || null,
      };

      const { error } = await getSupabaseClient()
        .from('products')
        .insert([payload]);

      if (error) throw error;

      setNewProduct({ product_name: '', description: '', product_type: 'live' });
      setIsAddDialogOpen(false);
      fetchProducts();
    } catch (error) {
      console.error('Error creating product:', error);
      alert('Failed to create product');
    } finally {
      setCreating(false);
    }
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setIsEditDialogOpen(true);
  };

  const handleUpdateProduct = async () => {
    if (!editingProduct || !editingProduct.product_name) return;

    setUpdating(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      const payload = {
        product_name: editingProduct.product_name,
        description: editingProduct.description || null,
        product_type: editingProduct.product_type,
      };

      const { error } = await getSupabaseClient()
        .from('products')
        .update(payload)
        .eq('product_id', editingProduct.product_id)
        .eq('farm_uuid', farmUuid);

      if (error) throw error;

      setIsEditDialogOpen(false);
      setEditingProduct(null);
      fetchProducts();
    } catch (error) {
      console.error('Error updating product:', error);
      alert('Failed to update product');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    if (!confirm(`Are you sure you want to delete "${product.product_name}"?`)) return;

    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // Soft delete by setting is_active to false
      const { error } = await getSupabaseClient()
        .from('products')
        .update({ is_active: false })
        .eq('product_id', product.product_id)
        .eq('farm_uuid', farmUuid);

      if (error) throw error;

      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Failed to delete product');
    }
  };

  const handleManageVariants = (product: Product) => {
    setSelectedProduct(product);
    setIsVariantDialogOpen(true);
  };

  const handleManageMix = (product: Product) => {
    setSelectedProduct(product);
    setIsMixDialogOpen(true);
  };

  const filteredProducts = products.filter(product =>
    product.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">Loading products...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-600 mt-1">Manage your retail products and variants</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Product</DialogTitle>
              <DialogDescription>
                Create a new product (live or packaged) for your catalog
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="product_name">Product Name *</Label>
                <Input
                  id="product_name"
                  value={newProduct.product_name}
                  onChange={(e) => setNewProduct({ ...newProduct, product_name: e.target.value })}
                  placeholder="e.g., Microgreen Mix"
                />
              </div>
              <div>
                <Label htmlFor="product_type">Product Type *</Label>
                <Select
                  value={newProduct.product_type}
                  onValueChange={(value: 'live' | 'packaged') => setNewProduct({ ...newProduct, product_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="live">Live</SelectItem>
                    <SelectItem value="packaged">Packaged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newProduct.description}
                  onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                  placeholder="Product description..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddProduct} disabled={creating}>
                {creating ? 'Creating...' : 'Create Product'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {filteredProducts.length === 0 ? (
        <EmptyState
          icon={<Package className="h-12 w-12 text-gray-400" />}
          title="No products found"
          description={searchTerm ? "Try adjusting your search" : "Get started by creating your first product"}
          actionLabel="Add Product"
          onAction={() => setIsAddDialogOpen(true)}
        />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Variants</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => (
                <TableRow key={product.product_id}>
                  <TableCell className="font-medium">{product.product_name}</TableCell>
                  <TableCell>
                    <Badge variant={product.product_type === 'live' ? 'default' : 'secondary'}>
                      {product.product_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-gray-400" />
                      <span>{product.variants?.length || 0} variant(s)</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-600">
                    {product.description || '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={product.is_active ? 'default' : 'secondary'}>
                      {product.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleManageVariants(product)}
                        title="Manage Variants"
                      >
                        <Tag className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleManageMix(product)}
                        title="Manage Mix"
                      >
                        <Package className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditProduct(product)}
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteProduct(product)}
                        title="Delete"
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

      {/* Edit Product Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>
              Update product information
            </DialogDescription>
          </DialogHeader>
          {editingProduct && (
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="edit_product_name">Product Name *</Label>
                <Input
                  id="edit_product_name"
                  value={editingProduct.product_name}
                  onChange={(e) => setEditingProduct({ ...editingProduct, product_name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit_product_type">Product Type *</Label>
                <Select
                  value={editingProduct.product_type}
                  onValueChange={(value: 'live' | 'packaged') => setEditingProduct({ ...editingProduct, product_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="live">Live</SelectItem>
                    <SelectItem value="packaged">Packaged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit_description">Description</Label>
                <Textarea
                  id="edit_description"
                  value={editingProduct.description || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateProduct} disabled={updating}>
              {updating ? 'Updating...' : 'Update Product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Variant Manager Dialog */}
      {selectedProduct && (
        <VariantManager
          product={selectedProduct}
          open={isVariantDialogOpen}
          onOpenChange={setIsVariantDialogOpen}
          onUpdate={fetchProducts}
        />
      )}

      {/* Product Mix Editor Dialog */}
      {selectedProduct && (
        <ProductMixEditor
          product={selectedProduct}
          open={isMixDialogOpen}
          onOpenChange={setIsMixDialogOpen}
          onUpdate={fetchProducts}
        />
      )}
    </div>
  );
};

export default ProductsPage;

