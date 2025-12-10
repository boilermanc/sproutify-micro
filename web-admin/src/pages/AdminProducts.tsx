import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  RefreshCcw, 
  Package,
  Search,
  X,
  Building2
} from 'lucide-react';

interface Product {
  product_id: number;
  product_name: string;
  description: string | null;
  farm_uuid: string;
  is_active: boolean;
  created_at: string;
  farm_name?: string;
}

interface Farm {
  farm_uuid: string;
  farmname: string;
}

interface FarmStats {
  farm_uuid: string;
  farm_name: string;
  product_count: number;
}

const AdminProducts = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmStats, setFarmStats] = useState<FarmStats[]>([]);
  const [selectedFarmUuid, setSelectedFarmUuid] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch all farms
      const { data: farmsData, error: farmsError } = await supabase
        .from('farms')
        .select('farm_uuid, farmname')
        .order('farmname', { ascending: true });

      if (farmsError) {
        console.error('Farms error:', farmsError);
      } else {
        setFarms(farmsData || []);
      }

      // Fetch products with farm names (only if farm is selected)
      const productsQuery = supabase
        .from('products')
        .select(`
          *,
          farms (
            farmname
          )
        `)
        .order('created_at', { ascending: false });

      if (selectedFarmUuid) {
        productsQuery.eq('farm_uuid', selectedFarmUuid);
      }

      const { data: productsData, error: productsError } = await productsQuery.limit(selectedFarmUuid ? 1000 : 100);

      if (productsError) {
        console.error('Products error:', productsError);
        // Products table might not exist, that's okay
        if (productsError.code === 'PGRST116' || productsError.message.includes('does not exist')) {
          setProducts([]);
        } else if (productsError.code === 'PGRST301' || productsError.message.includes('permission denied')) {
          throw new Error('Admin RLS policies not configured. Please run migration 033_add_admin_rls_policies.sql');
        } else {
          setProducts([]);
        }
      } else {
        const productsWithFarmNames = (productsData || []).map((product: any) => ({
          ...product,
          farm_name: product.farms?.farmname || 'Unknown Farm'
        }));

        setProducts(productsWithFarmNames);

        // Calculate stats per farm
        const statsMap = new Map<string, FarmStats>();
        
        // Initialize stats for all farms
        (farmsData || []).forEach((farm: any) => {
          statsMap.set(farm.farm_uuid, {
            farm_uuid: farm.farm_uuid,
            farm_name: farm.farmname || 'Unknown Farm',
            product_count: 0
          });
        });

        // Count products per farm
        productsWithFarmNames.forEach((product: Product) => {
          const stats = statsMap.get(product.farm_uuid);
          if (stats) {
            stats.product_count++;
          } else {
            statsMap.set(product.farm_uuid, {
              farm_uuid: product.farm_uuid,
              farm_name: product.farm_name || 'Unknown Farm',
              product_count: 1
            });
          }
        });

        setFarmStats(Array.from(statsMap.values()));
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      if (error instanceof Error && error.message.includes('RLS')) {
        alert('Admin access not configured. Please contact support to set up admin RLS policies.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedFarmUuid]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredProducts = products.filter(product => {
    const productName = (product.product_name || '').toLowerCase();
    const description = (product.description || '').toLowerCase();
    const farmName = (product.farm_name || '').toLowerCase();
    const searchLower = searchTerm.toLowerCase();
    return productName.includes(searchLower) || 
           description.includes(searchLower) || 
           farmName.includes(searchLower);
  });

  const totalProducts = farmStats.reduce((sum, stat) => sum + stat.product_count, 0);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-gray-100 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Products</h1>
          <p className="text-gray-500 font-medium mt-1">View products by farm</p>
        </div>
        <Button variant="outline" onClick={fetchData}>
          <RefreshCcw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-none shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Products</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{totalProducts}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                <Package className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Farms</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{farms.length}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Farm Selector */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Farm</label>
          <select
            value={selectedFarmUuid || ''}
            onChange={(e) => setSelectedFarmUuid(e.target.value || null)}
            className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          >
            <option value="">All Farms</option>
            {farms.map((farm) => {
              const stats = farmStats.find(s => s.farm_uuid === farm.farm_uuid);
              return (
                <option key={farm.farm_uuid} value={farm.farm_uuid}>
                  {farm.farmname} ({stats?.product_count || 0} products)
                </option>
              );
            })}
          </select>
        </div>
        {selectedFarmUuid && (
          <Button
            variant="outline"
            onClick={() => setSelectedFarmUuid(null)}
            className="mt-6 md:mt-0"
          >
            <X className="h-4 w-4 mr-2" />
            Clear Filter
          </Button>
        )}
      </div>

      {/* Farm Stats Grid */}
      {!selectedFarmUuid && farmStats.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Farm Statistics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {farmStats
              .sort((a, b) => b.product_count - a.product_count)
              .map((stat) => (
                <Card 
                  key={stat.farm_uuid} 
                  className="border-none shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedFarmUuid(stat.farm_uuid)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-lg">{stat.farm_name}</h3>
                      <Building2 className="h-5 w-5 text-gray-400" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Products:</span>
                        <span className="font-semibold text-gray-900">{stat.product_count}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>
      )}

      {/* Products List - Only show if farm is selected */}
      {selectedFarmUuid && (
        <>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredProducts.map((product) => (
                <Card key={product.product_id} className="border-none shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{product.product_name}</h3>
                          <Badge variant={product.is_active ? 'default' : 'secondary'}>
                            {product.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-sm text-gray-600">
                          {product.description && (
                            <div key="description" className="flex items-center gap-2">
                              <span className="font-medium">Description:</span>
                              <span className="text-gray-500">{product.description}</span>
                            </div>
                          )}
                          <div key="created" className="flex items-center gap-2">
                            <span className="font-medium">Created:</span>
                            <span>{new Date(product.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredProducts.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  {searchTerm ? 'No products found matching your search' : 'No products found for this farm'}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminProducts;
