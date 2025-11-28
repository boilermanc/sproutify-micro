import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface HarvestReportProps {
  startDate: Date;
  endDate: Date;
}

interface HarvestData {
  product_name: string;
  variant_name: string;
  size: string | null;
  variety_name: string;
  total_yield: number;
  unit: string;
  harvest_date: string;
}

const HarvestReport = ({ startDate, endDate }: HarvestReportProps) => {
  const [data, setData] = useState<HarvestData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHarvestData();
  }, [startDate, endDate]);

  const fetchHarvestData = async () => {
    try {
      setLoading(true);
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // Fetch harvested trays with recipe and variety information
      // Note: order_items is not directly linked to trays, so we use recipe/variety data
      const { data: traysData, error } = await supabase
        .from('trays')
        .select(`
          harvest_date,
          yield,
          recipes!inner(
            recipe_name,
            variety_name,
            varieties!inner(varietyid, name)
          )
        `)
        .eq('farm_uuid', farmUuid)
        .not('harvest_date', 'is', null)
        .gte('harvest_date', startDate.toISOString())
        .lte('harvest_date', endDate.toISOString())
        .order('harvest_date', { ascending: false });

      if (error) throw error;

      // Group and aggregate data by variety
      const harvestMap = new Map<string, HarvestData>();

      (traysData || []).forEach((tray: any) => {
        const variety = tray.recipes?.varieties?.name || tray.recipes?.variety_name || 'Unknown';
        const recipeName = tray.recipes?.recipe_name || 'Unknown Recipe';
        // Use recipe name as product name since we don't have direct product link
        const product = recipeName;
        const key = `${product}-${variety}`;

        if (!harvestMap.has(key)) {
          harvestMap.set(key, {
            product_name: product,
            variant_name: 'Standard',
            size: null,
            variety_name: variety,
            total_yield: 0,
            unit: 'oz',
            harvest_date: tray.harvest_date,
          });
        }

        const existing = harvestMap.get(key)!;
        existing.total_yield += parseFloat(tray.yield || 0);
      });

      setData(Array.from(harvestMap.values()).sort((a, b) => {
        // Sort by product, then size
        const productCompare = a.product_name.localeCompare(b.product_name);
        if (productCompare !== 0) return productCompare;
        return (a.size || '').localeCompare(b.size || '');
      }));
    } catch (error) {
      console.error('Error fetching harvest data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading harvest data...</div>;
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No harvest data found for the selected date range.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600">
        Report Period: {startDate.toLocaleDateString()} - {endDate.toLocaleDateString()}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Variety</TableHead>
            <TableHead className="text-right">Total Yield</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item, index) => (
            <TableRow key={index}>
              <TableCell className="font-medium">{item.product_name}</TableCell>
              <TableCell>
                {item.size ? (
                  <Badge variant="outline">{item.size}</Badge>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </TableCell>
              <TableCell>{item.variety_name}</TableCell>
              <TableCell className="text-right font-semibold">
                {item.total_yield.toFixed(2)} {item.unit}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <div className="text-sm font-semibold">Total Yield: {
          data.reduce((sum, item) => sum + item.total_yield, 0).toFixed(2)
        } {data[0]?.unit || 'oz'}</div>
      </div>
    </div>
  );
};

export default HarvestReport;

