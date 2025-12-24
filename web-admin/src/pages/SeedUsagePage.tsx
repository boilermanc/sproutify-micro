import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { getSupabaseClient } from '../lib/supabaseClient';
import SeedAnalyticsDashboard from '../components/reports/SeedAnalyticsDashboard';

const SeedUsagePage = () => {
  const [startDate, setStartDate] = useState<string>(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [loading, setLoading] = useState(false);
  const [usedMock, setUsedMock] = useState(false);
  const [chartData, setChartData] = useState<{ date: string; sowing: number; harvest: number; waste: number; }[]>([]);
  const [pieData, setPieData] = useState<{ name: string; value: number; color?: string }[]>([]);
  const [varietyData, setVarietyData] = useState<{ name: string; value: number; color?: string }[]>([]);
  const [varietySeries, setVarietySeries] = useState<{ name: string; data: { date: string; value: number }[] }[]>([]);
  const [totalVolume, setTotalVolume] = useState(0);

  const formatDateKey = (d: string | Date) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const session = JSON.parse(localStorage.getItem('sproutify_session') || '{}');
        const farmUuid = session.farmUuid;
        if (!farmUuid) {
          console.warn('[SeedAnalytics] missing farmUuid in sproutify_session');
          // No farm — show empty state (no mock)
          setUsedMock(false);
          setChartData([]);
          setPieData([]);
          setVarietyData([]);
          setTotalVolume(0);
          return;
        }

        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const { data: txData, error } = await getSupabaseClient()
          .from('seed_transactions')
          .select(`
            created_at,
            quantity_grams,
            transaction_type,
            batch_id,
            seedbatches!left(
              batchid,
              varietyid,
              varieties!left(name)
            )
          `)
          .eq('farm_uuid', farmUuid)
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .order('created_at', { ascending: true });

        if (error) {
          console.error('[SeedAnalytics] fetch error', error);
          throw error;
        }

        const rows = txData || [];
        console.info('[SeedAnalytics] fetched seed_transactions', {
          farmUuid,
          range: { start: start.toISOString(), end: end.toISOString() },
          count: rows.length,
          transactionTypes: [...new Set(rows.map((r: any) => r.transaction_type || ''))],
          sample: rows.slice(0, 3),
        });
        const toNum = (v: any) => Math.abs(parseFloat(String(v ?? 0))) || 0;

        const dailyMap: Record<string, { date: string; sowing: number; harvest: number; waste: number }> = {};
        const typeMap: Record<string, number> = {};
        const varietyMap: Record<string, number> = {};
        const varietySeriesMap: Record<string, Record<string, number>> = {};
        let total = 0;

        rows.forEach((row) => {
          const key = formatDateKey(row.created_at);
          const grams = toNum(row.quantity_grams);
          const t = (row.transaction_type || '').toString().toLowerCase();
          const isHarvest = t.includes('harvest');
          const isWaste = t.includes('waste') || t.includes('discard');
          if (!dailyMap[key]) {
            dailyMap[key] = { date: key, sowing: 0, harvest: 0, waste: 0 };
          }
          if (isHarvest) dailyMap[key].harvest += grams;
          else if (isWaste) dailyMap[key].waste += grams;
          else dailyMap[key].sowing += grams;

          const typeLabel = isHarvest ? 'Harvest' : isWaste ? 'Waste / Loss' : 'Seeding';
          typeMap[typeLabel] = (typeMap[typeLabel] || 0) + grams;
          total += grams;

          const varietyName =
            (row as any)?.seedbatches?.varieties?.name ||
            (row as any)?.seedbatches?.name ||
            'Unknown';
          varietyMap[varietyName] = (varietyMap[varietyName] || 0) + grams;
          if (!varietySeriesMap[varietyName]) {
            varietySeriesMap[varietyName] = {};
          }
          varietySeriesMap[varietyName][key] = (varietySeriesMap[varietyName][key] || 0) + grams;
        });

        const chartPoints = Object.values(dailyMap).sort((a, b) => {
          const da = new Date(a.date);
          const db = new Date(b.date);
          return da.getTime() - db.getTime();
        });

        const pie = Object.entries(typeMap).map(([name, value]) => ({ name, value }));
        const variety = Object.entries(varietyMap).map(([name, value]) => ({ name, value }));
        const varietySeriesArr = Object.entries(varietySeriesMap).map(([name, dateMap]) => {
          const points = Object.entries(dateMap)
            .map(([date, value]) => ({ date, value }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          return { name, data: points };
        });

        setUsedMock(false);
        setChartData(chartPoints);
        setPieData(pie);
        setVarietyData(variety);
        setVarietySeries(varietySeriesArr);
        setTotalVolume(total);
      } catch (err) {
        console.error('[SeedAnalytics] error', err);
        setUsedMock(false);
        setChartData([]);
        setPieData([]);
        setVarietyData([]);
        setVarietySeries([]);
        setTotalVolume(0);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [startDate, endDate]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Seed Analytics</h1>
        <p className="text-gray-600 mt-1">Usage trends, transaction mix, and variety breakdowns</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Select a date range. Data updates automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="end_date">End Date</Label>
              <Input
                id="end_date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Download className="h-4 w-4 mr-2" />
              Print/Export
            </Button>
          </div>
        </CardContent>
      </Card>

      <SeedAnalyticsDashboard
        chartData={chartData}
        transactionTypeData={pieData}
        varietyData={varietyData}
        varietySeries={varietySeries}
        totalVolume={totalVolume}
        loading={loading}
        usedMock={usedMock}
      />
    </div>
  );
};

export default SeedUsagePage;





