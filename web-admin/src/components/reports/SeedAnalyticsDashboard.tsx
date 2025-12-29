import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import { Calendar, Sprout, TrendingUp, PieChart as PieIcon } from 'lucide-react';

type ChartPoint = {
  date: string;
  sowing: number;
  harvest: number;
  waste: number;
};

type PieDatum = {
  name: string;
  value: number;
  color?: string;
};

type Props = {
  chartData: ChartPoint[];
  transactionTypeData: PieDatum[];
  varietyData: PieDatum[];
  varietySeries: { name: string; data: { date: string; value: number }[] }[];
  totalVolume?: number;
  loading?: boolean;
  usedMock?: boolean;
};

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl shadow-2xl backdrop-blur-md bg-opacity-90">
        <p className="text-slate-400 text-sm mb-2 font-medium">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 mb-1">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-slate-200 text-sm capitalize">
              {entry.name}:
            </span>
            <span className="text-white font-bold text-sm">
              {Math.round(entry.value)}g
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function SeedAnalyticsDashboard({
  chartData,
  transactionTypeData,
  varietyData,
  varietySeries,
  loading,
  usedMock,
}: Props) {
  const [activeVariety, setActiveVariety] = useState<number | undefined>(undefined);

  const onVarietyEnter = (_: any, index: number) => setActiveVariety(index);

  const varietyWithColors =
    varietyData.length === 0
      ? []
      : varietyData.map((d, i) => ({
          ...d,
          color: d.color || COLORS[i % COLORS.length],
        }));

  const hasData = chartData.length > 0 || transactionTypeData.length > 0 || varietyData.length > 0;

  return (
    <div className="p-6 bg-slate-950 text-slate-200 space-y-8 font-sans rounded-3xl border border-slate-900 min-w-0 w-full">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <Sprout className="text-emerald-400" /> Seed Transactions
          </h1>
          <p className="text-slate-400 mt-1">
            Real-time inventory flow and batch analysis
          </p>
        </div>
        {usedMock && (
          <span className="text-xs font-mono text-amber-400 bg-amber-500/10 px-2 py-1 rounded-md border border-amber-500/40">
            MOCK DATA (no transactions found)
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-12">Loading seed analytics...</div>
      ) : !hasData ? (
        <div className="text-center text-slate-500 py-12">No seed data found for this range.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full min-w-0">
          {/* Area Chart */}
          <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 rounded-3xl p-6 shadow-xl backdrop-blur-sm min-w-0">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                Usage Trends
              </h3>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-md">
                {usedMock ? 'DEMO' : 'LIVE'}
              </span>
            </div>

            <div className="w-full min-w-0">
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSown" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorHarvest" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorWaste" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#475569"
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    dy={10}
                  />
                  <YAxis
                    stroke="#475569"
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}g`}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }} />
                  <Area
                    type="monotone"
                    dataKey="sowing"
                    name="Seeded"
                    stroke="#10b981"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorSown)"
                    activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="harvest"
                    name="Harvested"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorHarvest)"
                    activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="waste"
                    name="Waste / Loss"
                    stroke="#ef4444"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorWaste)"
                    activeDot={{ r: 5, strokeWidth: 0, fill: '#fff' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Donut Chart */}
          {/* Variety Breakdown with side legend */}
          <div className="lg:col-span-1 bg-slate-900/50 border border-slate-800 rounded-3xl p-6 shadow-xl backdrop-blur-sm flex flex-col min-w-0">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-2">
              <PieIcon className="w-5 h-5 text-emerald-400" />
              Variety Mix
            </h3>
            <p className="text-sm text-slate-500 mb-6">Usage by seed variety</p>

            <div className="flex gap-6 items-start min-w-0">
              <div className="w-[55%] min-w-0 relative">
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={varietyWithColors}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={105}
                      paddingAngle={4}
                      dataKey="value"
                      onMouseEnter={onVarietyEnter}
                      stroke="none"
                    >
                      {varietyWithColors.map((entry, index) => (
                        <Cell
                          key={`variety-cell-${index}`}
                          fill={entry.color}
                          className="transition-all duration-300 outline-none"
                          fillOpacity={activeVariety === undefined || activeVariety === index ? 1 : 0.35}
                          stroke={activeVariety === index ? "#fff" : "none"}
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>

                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
                  <span className="text-3xl font-bold text-white">
                    {varietyWithColors.length}
                  </span>
                  <span className="text-xs text-slate-500 uppercase tracking-wider">
                    Varieties
                  </span>
                </div>
              </div>

              <div className="flex-1 min-w-0 space-y-2">
                {varietyWithColors.map((entry, idx) => (
                  <div key={entry.name} className="flex items-center gap-2 text-sm text-slate-200">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: entry.color, opacity: activeVariety === undefined || activeVariety === idx ? 1 : 0.4 }}
                    />
                    <span className="font-medium truncate">{entry.name}</span>
                    <span className="text-slate-400">{Math.round(entry.value)}g</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Stacked Bar */}
          <div className="lg:col-span-3 bg-slate-900/50 border border-slate-800 rounded-3xl p-6 shadow-xl backdrop-blur-sm min-w-0">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-400" />
                Batch Efficiency (Seed vs Waste)
              </h3>
            </div>

            <div className="w-full min-w-0">
              <ResponsiveContainer width="100%" height={350}>
                <BarChart
                  data={chartData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  barSize={12}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#475569"
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    dy={10}
                  />
                  <YAxis
                    stroke="#475569"
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: '#334155', opacity: 0.2 }}
                    content={<CustomTooltip />}
                  />
                  <Legend iconType="circle" />
                  <Bar
                    dataKey="sowing"
                    stackId="a"
                    fill="#10b981"
                    radius={[0, 0, 4, 4]}
                    name="Seed Used"
                  />
                  <Bar
                    dataKey="waste"
                    stackId="a"
                    fill="#ef4444"
                    radius={[4, 4, 0, 0]}
                    name="Waste / Loss"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Variety Lines */}
          <div className="lg:col-span-3 bg-slate-900/50 border border-slate-800 rounded-3xl p-6 shadow-xl backdrop-blur-sm min-w-0 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Variety Trends</h3>
              <p className="text-sm text-slate-500">Daily grams per variety</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {varietySeries.map((series) => (
                <div key={series.name} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 min-w-0">
                  <p className="text-sm text-slate-300 mb-2">{series.name}</p>
                  <div className="w-full min-w-0">
                    <ResponsiveContainer width="100%" height={150}>
                      <AreaChart data={series.data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id={`variety-${series.name}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                        <XAxis dataKey="date" stroke="#9ca3af" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                        <YAxis stroke="#9ca3af" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area type="monotone" dataKey="value" stroke="#10b981" fillOpacity={1} fill={`url(#variety-${series.name})`} strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}







