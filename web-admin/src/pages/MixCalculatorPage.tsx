import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Calculator } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { calculateMixRequirements, formatCalculationResults } from '../services/mixCalculatorService';

interface Product {
  product_id: number;
  product_name: string;
  product_type: string;
}

interface MixMapping {
  recipe_id: number;
  variety_id: number;
  ratio: number;
  recipe_name: string;
  variety_name: string;
}

interface Recipe {
  recipe_id: number | string; // Can be number for farm recipes or string like "global_123" for global recipes
  recipe_name: string;
  variety_name: string;
  total_days: number;
  average_yield: number; // Yield per tray in oz
  is_global?: boolean;
  global_recipe_id?: number;
  expected_yield_oz?: number; // For global recipes, this comes from global_recipes.expected_yield_oz
}

interface CalculationResult {
  variety_id: number;
  variety_name: string;
  recipe_id: number;
  recipe_name: string;
  trays_needed: number;
  total_yield: number; // Required yield in oz
  expected_yield_per_tray: number; // Expected yield per tray in oz
  sow_date: Date;
  ratio: number;
}

const MixCalculatorPage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [productMix, setProductMix] = useState<MixMapping[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [orderQuantity, setOrderQuantity] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [unit, setUnit] = useState('oz');
  const [calculations, setCalculations] = useState<CalculationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    fetchProducts();
    fetchRecipes();
  }, []);

  useEffect(() => {
    if (selectedProductId) {
      fetchProductMix(parseInt(selectedProductId));
    } else {
      setProductMix([]);
    }
  }, [selectedProductId]);

  const fetchProducts = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) {
        console.warn('No session data found');
        setLoading(false);
        setProducts([]);
        return;
      }

      const { farmUuid } = JSON.parse(sessionData);
      if (!farmUuid) {
        console.warn('No farmUuid in session data');
        setLoading(false);
        setProducts([]);
        return;
      }

      console.log('Fetching products for farm:', farmUuid);

      // Don't filter by is_active - let users see all products (matching ProductsPage behavior)
      const { data, error } = await supabase
        .from('products')
        .select('product_id, product_name, product_type')
        .eq('farm_uuid', farmUuid)
        .order('product_name', { ascending: true });

      if (error) {
        console.error('Error fetching products:', error);
        setProducts([]);
        return;
      }

      console.log('Products fetched:', data?.length || 0, data);
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecipes = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) {
        setRecipes([]);
        return;
      }

      const { farmUuid } = JSON.parse(sessionData);
      if (!farmUuid) {
        setRecipes([]);
        return;
      }

      // Fetch farm recipes with steps to calculate total days
      // Include global_recipe_id to look up expected_yield_oz
      const { data: farmRecipesData, error: recipesError } = await supabase
        .from('recipes')
        .select('recipe_id, recipe_name, variety_name, global_recipe_id')
        .eq('farm_uuid', farmUuid)
        .eq('is_active', true);

      if (recipesError) {
        console.error('Error fetching recipes:', recipesError);
        setRecipes([]);
        return;
      }

      // Fetch enabled global recipes with expected_yield_oz
      const { data: enabledGlobalRecipes, error: globalError } = await supabase
        .from('farm_global_recipes')
        .select(`
          global_recipe_id,
          global_recipes!inner(
            global_recipe_id,
            recipe_name,
            variety_name,
            expected_yield_oz,
            is_active,
            global_steps(duration, duration_unit, sequence_order)
          )
        `)
        .eq('farm_uuid', farmUuid)
        .eq('is_active', true);

      if (globalError) {
        console.error('Error fetching enabled global recipes:', globalError);
      }

      // Fetch all global recipes with expected_yield_oz for lookup by global_recipe_id
      const { data: allGlobalRecipes, error: allGlobalError } = await supabase
        .from('global_recipes')
        .select('global_recipe_id, recipe_name, variety_name, expected_yield_oz')
        .eq('is_active', true);

      if (allGlobalError) {
        console.error('Error fetching all global recipes:', allGlobalError);
      }

      // Create a map for quick lookup by global_recipe_id
      const globalRecipesMap = new Map(
        (allGlobalRecipes || []).map((gr: { global_recipe_id: number; expected_yield_oz?: number }) => [
          gr.global_recipe_id,
          gr
        ])
      );

      // Process farm recipes
      const recipesWithDetails: Recipe[] = [];
      for (const recipe of farmRecipesData || []) {
        try {
          // Fetch steps using actual schema (duration, duration_unit, sequence_order)
          const { data: stepsData, error: stepsError } = await supabase
            .from('steps')
            .select('duration, duration_unit, sequence_order')
            .eq('recipe_id', recipe.recipe_id);
          
          // Sort steps by sequence_order
          const sortedStepsData = stepsData ? [...stepsData].sort((a, b) => {
            const orderA = (a as any).sequence_order ?? 0;
            const orderB = (b as any).sequence_order ?? 0;
            return orderA - orderB;
          }) : null;

          if (stepsError) {
            console.warn(`Error fetching steps for recipe ${recipe.recipe_id}:`, stepsError);
            // Look up expected_yield_oz using global_recipe_id if available
            const globalRecipe = recipe.global_recipe_id 
              ? globalRecipesMap.get(recipe.global_recipe_id)
              : null;
            
            recipesWithDetails.push({
              recipe_id: recipe.recipe_id,
              recipe_name: recipe.recipe_name,
              variety_name: recipe.variety_name || '',
              total_days: 10,
              average_yield: globalRecipe?.expected_yield_oz || 4.0,
              is_global: false,
            });
            continue;
          }

          // Calculate total days, accounting for duration_unit
          const totalDays = (sortedStepsData || []).reduce((sum: number, step: { duration?: number; duration_unit?: string }) => {
            const duration = step.duration || 0;
            const unit = (step.duration_unit || 'Days').toUpperCase();
            
            if (unit === 'DAYS') {
              return sum + duration;
            } else if (unit === 'HOURS') {
              return sum + (duration >= 12 ? 1 : 0);
            }
            return sum + duration;
          }, 0);

          // Look up expected_yield_oz using global_recipe_id if available
          const globalRecipe = recipe.global_recipe_id 
            ? globalRecipesMap.get(recipe.global_recipe_id)
            : null;

          recipesWithDetails.push({
            recipe_id: recipe.recipe_id,
            recipe_name: recipe.recipe_name,
            variety_name: recipe.variety_name || '',
            total_days: totalDays || 10,
            average_yield: globalRecipe?.expected_yield_oz || 4.0, // Use global recipe's expected_yield_oz if found
            is_global: false,
          });
        } catch (stepError) {
          console.warn(`Error processing steps for recipe ${recipe.recipe_id}:`, stepError);
          // Look up expected_yield_oz using global_recipe_id if available
          const globalRecipe = recipe.global_recipe_id 
            ? globalRecipesMap.get(recipe.global_recipe_id)
            : null;

          recipesWithDetails.push({
            recipe_id: recipe.recipe_id,
            recipe_name: recipe.recipe_name,
            variety_name: recipe.variety_name || '',
            total_days: 10,
            average_yield: globalRecipe?.expected_yield_oz || 4.0,
            is_global: false,
          });
        }
      }

      // Process global recipes
      for (const item of enabledGlobalRecipes || []) {
        const globalRecipe = (item as any).global_recipes;
        if (!globalRecipe || !globalRecipe.is_active) continue;

        // Calculate total days from global_steps
        const steps = (globalRecipe.global_steps || []) as Array<{ duration?: number; duration_unit?: string; sequence_order?: number }>;
        const sortedSteps = [...steps].sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));
        
        const totalDays = sortedSteps.reduce((sum: number, step: { duration?: number; duration_unit?: string }) => {
          const duration = step.duration || 0;
          const unit = (step.duration_unit || 'Days').toUpperCase();
          
          if (unit === 'DAYS') {
            return sum + duration;
          } else if (unit === 'HOURS') {
            return sum + (duration >= 12 ? 1 : 0);
          }
          return sum + duration;
        }, 0);

        recipesWithDetails.push({
          recipe_id: `global_${item.global_recipe_id}`,
          recipe_name: globalRecipe.recipe_name || '',
          variety_name: globalRecipe.variety_name || '',
          total_days: totalDays || 10,
          average_yield: globalRecipe.expected_yield_oz || 4.0, // Use expected_yield_oz from global_recipes
          is_global: true,
          global_recipe_id: item.global_recipe_id,
          expected_yield_oz: globalRecipe.expected_yield_oz,
        });
      }

      setRecipes(recipesWithDetails);
    } catch (error) {
      console.error('Error fetching recipes:', error);
      setRecipes([]);
    }
  };

  const fetchProductMix = async (productId: number) => {
    try {
      const { data, error } = await supabase
        .from('product_recipe_mapping')
        .select(`
          *,
          recipes!inner(recipe_id, recipe_name, variety_name),
          varieties!inner(varietyid, name)
        `)
        .eq('product_id', productId);

      if (error) throw error;

      const normalizedMappings: MixMapping[] = (data || []).map((m: { recipe_id: number; variety_id: number; ratio?: number; recipes?: { recipe_name?: string }; varieties?: { name?: string; variety_name?: string } }) => ({
        recipe_id: m.recipe_id,
        variety_id: m.variety_id,
        ratio: m.ratio || 1.0,
        recipe_name: (m.recipes?.recipe_name || '').replace(' (Copy)', ' (Global)'),
        variety_name: m.varieties?.name || m.varieties?.variety_name || '',
      }));

      setProductMix(normalizedMappings);
    } catch (error) {
      console.error('Error fetching product mix:', error);
      setProductMix([]);
    }
  };

  const handleCalculate = async () => {
    if (!selectedProductId || !orderQuantity || !deliveryDate || productMix.length === 0) {
      alert('Please select a product, enter order quantity and delivery date');
      return;
    }

    setCalculating(true);
    try {
      const selectedProduct = products.find(p => p.product_id.toString() === selectedProductId);
      if (!selectedProduct) return;

      const input = {
        product_id: parseInt(selectedProductId),
        order_quantity: parseFloat(orderQuantity),
        delivery_date: new Date(deliveryDate),
        unit,
      };

      const productMixData = {
        product_id: selectedProduct.product_id,
        product_name: selectedProduct.product_name,
        mappings: productMix,
      };

      const results = await calculateMixRequirements(input, productMixData, recipes);
      setCalculations(results);
    } catch (error) {
      console.error('Error calculating mix:', error);
      alert('Failed to calculate mix requirements');
    } finally {
      setCalculating(false);
    }
  };

  const handleExport = () => {
    if (calculations.length === 0) return;

    const output = formatCalculationResults(calculations);
    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mix-calculation-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    setCalculations([]);
    setOrderQuantity('');
    setDeliveryDate('');
  };

  const selectedProduct = products.find(p => p.product_id.toString() === selectedProductId);
  const totalTrays = calculations.reduce((sum, c) => sum + c.trays_needed, 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Mix Calculator</h1>
        <p className="text-gray-600 mt-1">Calculate crop amounts needed for product mixes</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="flex flex-col max-h-[calc(100vh-12rem)]">
          <CardHeader className="flex-shrink-0">
            <CardTitle>Order Details</CardTitle>
            <CardDescription>Enter order information to calculate requirements</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 overflow-y-auto flex-1 min-h-0">
            <div>
              <Label htmlFor="product">Product *</Label>
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger>
                  <SelectValue placeholder={products.length === 0 ? "No products available" : "Select a product"} />
                </SelectTrigger>
                <SelectContent>
                  {products.length === 0 ? (
                    <SelectItem value="none" disabled>No products found. Create products in the Products page.</SelectItem>
                  ) : (
                    products.map((product) => (
                      <SelectItem key={product.product_id} value={product.product_id.toString()}>
                        {product.product_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {products.length === 0 && !loading && (
                <p className="text-sm text-amber-600 mt-1">
                  No products found. Go to the <Link to="/products" className="underline">Products page</Link> to create products.
                </p>
              )}
            </div>

            {selectedProduct && productMix.length > 0 && (
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-blue-900">Product Mix:</p>
                <div className="mt-2 max-h-48 overflow-y-auto">
                  <ul className="text-sm text-blue-700 list-disc list-inside">
                    {productMix.map((mapping, index) => (
                      <li key={index}>
                        {mapping.variety_name} ({mapping.recipe_name}) - Ratio: {mapping.ratio}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {selectedProduct && productMix.length === 0 && (
              <div className="p-3 bg-yellow-50 rounded-lg">
                <p className="text-sm text-yellow-800">
                  No mix configured for this product. Configure the mix in the Products page.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="quantity">Order Quantity *</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="0.1"
                  value={orderQuantity}
                  onChange={(e) => setOrderQuantity(e.target.value)}
                  placeholder="0.0"
                />
              </div>
              <div>
                <Label htmlFor="unit">Unit</Label>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="oz">oz</SelectItem>
                    <SelectItem value="lbs">lbs</SelectItem>
                    <SelectItem value="g">g</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="delivery_date">Delivery Date *</Label>
              <Input
                id="delivery_date"
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            <Button
              onClick={handleCalculate}
              disabled={calculating || !selectedProductId || !orderQuantity || !deliveryDate || productMix.length === 0}
              className="w-full"
            >
              <Calculator className="h-4 w-4 mr-2" />
              {calculating ? 'Calculating...' : 'Calculate Requirements'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Calculation Results</CardTitle>
            <CardDescription>Sowing requirements based on your order</CardDescription>
          </CardHeader>
          <CardContent>
            {calculations.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Enter order details and click Calculate to see requirements
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <span className="font-semibold text-green-900">Total Trays Required:</span>
                  <Badge variant="default" className="text-lg">{totalTrays}</Badge>
                </div>

                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Variety</TableHead>
                        <TableHead>Trays</TableHead>
                        <TableHead>Required (oz)</TableHead>
                        <TableHead>Yield/Tray (oz)</TableHead>
                        <TableHead>Sow Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {calculations.map((calc, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">
                            {calc.variety_name}
                            <br />
                            <span className="text-xs text-gray-500">{calc.recipe_name.replace(' (Copy)', ' (Global)')}</span>
                          </TableCell>
                          <TableCell>
                            <Badge>{calc.trays_needed}</Badge>
                          </TableCell>
                          <TableCell>{calc.total_yield.toFixed(2)}</TableCell>
                          <TableCell>{calc.expected_yield_per_tray.toFixed(1)}</TableCell>
                          <TableCell>
                            {calc.sow_date.toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleClear} variant="outline" className="flex-1">
                    Clear Calculations
                  </Button>
                  <Button onClick={handleExport} variant="outline" className="flex-1" disabled={calculations.length === 0}>
                    Export Calculation
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MixCalculatorPage;

