import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabaseClient';
import SeedAnalyticsDashboard from './SeedAnalyticsDashboard';

type Props = {
  startDate: Date;
  endDate: Date;
};

type TxRow = {
  created_at: string;
  quantity_grams: number | string;
  transaction_type?: string | null;
  batch_id?: string | null;
  seedbatches?: {
    varietyid?: string | null;
    varieties?: { name?: string | null } | null;
  } | null;
};

const SeedUsageReport = ({ startDate, endDate }: Props) => {
  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState<{ date: string; sowing: number; harvest: number; waste: number }[]>([]);
  const [pieData, setPieData] = useState<{ name: string; value: number; color?: string }[]>([]);
  const [varietyData, setVarietyData] = useState<{ name: string; value: number; color?: string }[]>([]);
  const [varietySeries, setVarietySeries] = useState<{ name: string; data: { date: string; value: number }[] }[]>([]);
  const [totalVolume, setTotalVolume] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const session = JSON.parse(localStorage.getItem('sproutify_session') || '{}');
        const farmUuid = session.farmUuid;
        if (!farmUuid) {
          setChartData([]);
          setPieData([]);
          setVarietyData([]);
          setVarietySeries([]);
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
              varietyid,
              varieties!left(name)
            )
          `)
          .eq('farm_uuid', farmUuid)
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .order('created_at', { ascending: true });

        if (error) {
          console.error('[SeedUsageReport] fetch error', error);
          throw error;
        }

        // Map the raw data to handle Supabase's array-style joins
        const rows: TxRow[] = (txData || []).map((row: any) => ({
          ...row,
          seedbatches: Array.isArray(row.seedbatches) ? row.seedbatches[0] : row.seedbatches,
        }));
        const toNum = (v: any) => Math.abs(parseFloat(String(v ?? 0))) || 0;

        const dailyMap: Record<string, { date: string; sowing: number; harvest: number; waste: number }> = {};
        const typeMap: Record<string, number> = {};
        const varietyMap: Record<string, number> = {};
        const varietySeriesMap: Record<string, Record<string, number>> = {};
        let total = 0;

        rows.forEach((row) => {
          const dateKey = new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
          const grams = toNum(row.quantity_grams);
          const t = (row.transaction_type || '').toString().toLowerCase();
          const isHarvest = t.includes('harvest');
          const isWaste = t.includes('waste') || t.includes('discard');
          if (!dailyMap[dateKey]) dailyMap[dateKey] = { date: dateKey, sowing: 0, harvest: 0, waste: 0 };
          if (isHarvest) dailyMap[dateKey].harvest += grams;
          else if (isWaste) dailyMap[dateKey].waste += grams;
          else dailyMap[dateKey].sowing += grams;

          const typeLabel = isHarvest ? 'Harvest' : isWaste ? 'Waste / Loss' : 'Seeding';
          typeMap[typeLabel] = (typeMap[typeLabel] || 0) + grams;

          const varietyName =
            row.seedbatches?.varieties?.name ||
            (row.seedbatches as any)?.name ||
            'Unknown';
          varietyMap[varietyName] = (varietyMap[varietyName] || 0) + grams;
          if (!varietySeriesMap[varietyName]) varietySeriesMap[varietyName] = {};
          varietySeriesMap[varietyName][dateKey] = (varietySeriesMap[varietyName][dateKey] || 0) + grams;

          total += grams;
        });

        const chartPoints = Object.values(dailyMap).sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        const pie = Object.entries(typeMap).map(([name, value]) => ({ name, value }));
        const variety = Object.entries(varietyMap).map(([name, value]) => ({ name, value }));
        const varietySeriesArr = Object.entries(varietySeriesMap).map(([name, dateMap]) => {
          const points = Object.entries(dateMap)
            .map(([date, value]) => ({ date, value }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          return { name, data: points };
        });

        setChartData(chartPoints);
        setPieData(pie);
        setVarietyData(variety);
        setVarietySeries(varietySeriesArr);
        setTotalVolume(total);
      } catch (err) {
        console.error('[SeedUsageReport] error', err);
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
    <SeedAnalyticsDashboard
      chartData={chartData}
      transactionTypeData={pieData}
      varietyData={varietyData}
      varietySeries={varietySeries}
      totalVolume={totalVolume}
      loading={loading}
      usedMock={false}
    />
  );
};

export default SeedUsageReport;








