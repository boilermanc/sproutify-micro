import { Sprout } from 'lucide-react';

interface PlantingSchedule {
  sow_date: Date;
  delivery_date: Date;
  recipe_id: number;
  recipe_name: string;
  quantity: number;
  days_before_delivery: number;
  standing_order_id: number;
  order_name: string;
  customer_name?: string;
  product_name?: string;
  variant_name?: string;
  seed_quantity?: number;
  seed_quantity_unit?: string;
}

interface SeedingPlanPrintProps {
  schedules: PlantingSchedule[];
  selectedDate: string;
  farmName?: string;
}

const SeedingPlanPrint = ({ schedules, selectedDate, farmName }: SeedingPlanPrintProps) => {
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatSeedQuantity = (grams: number) => {
    if (grams >= 1000) {
      return `${(grams / 1000).toFixed(2)} kg`;
    }
    return `${grams.toFixed(1)} g`;
  };

  // Helper to get local date key (YYYY-MM-DD) from a Date object
  const getLocalDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Filter schedules for the selected date (using local time to match scheduler)
  const dateSchedules = schedules.filter(s => {
    return getLocalDateKey(new Date(s.sow_date)) === selectedDate;
  });

  // Group by recipe for consolidated view
  const groupedByRecipe = dateSchedules.reduce((acc, schedule) => {
    const key = schedule.recipe_id;
    if (!acc[key]) {
      acc[key] = {
        recipe_id: schedule.recipe_id,
        recipe_name: schedule.recipe_name,
        seed_quantity: schedule.seed_quantity || 0,
        seed_quantity_unit: schedule.seed_quantity_unit || 'grams',
        total_trays: 0,
        orders: [] as { order_name: string; customer_name?: string; quantity: number; delivery_date: Date; days_before_delivery: number }[],
      };
    }
    acc[key].total_trays += Math.ceil(schedule.quantity);
    acc[key].orders.push({
      order_name: schedule.order_name,
      customer_name: schedule.customer_name,
      quantity: Math.ceil(schedule.quantity),
      delivery_date: schedule.delivery_date,
      days_before_delivery: schedule.days_before_delivery,
    });
    return acc;
  }, {} as Record<number, any>);

  const consolidatedSchedules = Object.values(groupedByRecipe);

  const sowDate = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date();

  return (
    <div className="print-only hidden print:block p-8 bg-white text-black font-sans">
      {/* Header */}
      <div className="text-center mb-8 border-b-2 border-black pb-4">
        <div className="flex items-center justify-center gap-3 mb-2">
          <Sprout className="h-8 w-8" />
          <h1 className="text-3xl font-bold tracking-tight">SEEDING PLAN</h1>
        </div>
        {farmName && <p className="text-lg text-gray-600">{farmName}</p>}
        <p className="text-xl font-semibold mt-2">{formatDate(sowDate)}</p>
        <p className="text-sm text-gray-500 mt-1">
          Generated: {new Date().toLocaleString()}
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8 text-center">
        <div className="border border-gray-300 rounded p-3">
          <p className="text-sm text-gray-600">Total Varieties</p>
          <p className="text-2xl font-bold">{consolidatedSchedules.length}</p>
        </div>
        <div className="border border-gray-300 rounded p-3">
          <p className="text-sm text-gray-600">Total Trays</p>
          <p className="text-2xl font-bold">
            {consolidatedSchedules.reduce((sum, s) => sum + s.total_trays, 0)}
          </p>
        </div>
        <div className="border border-gray-300 rounded p-3">
          <p className="text-sm text-gray-600">Total Seed Needed</p>
          <p className="text-2xl font-bold">
            {formatSeedQuantity(
              consolidatedSchedules.reduce((sum, s) => sum + (s.seed_quantity * s.total_trays), 0)
            )}
          </p>
        </div>
      </div>

      {/* Seeding Tasks */}
      <div className="space-y-6">
        {consolidatedSchedules.map((schedule, index) => {
          const seedPerTray = schedule.seed_quantity;
          const totalSeed = seedPerTray * schedule.total_trays;

          return (
            <div key={schedule.recipe_id} className="border border-gray-400 rounded-lg p-4 break-inside-avoid">
              {/* Task Header */}
              <div className="flex items-start gap-4 mb-4">
                <div className="flex-shrink-0 w-8 h-8 border-2 border-gray-600 rounded flex items-center justify-center text-lg font-bold">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold">{schedule.recipe_name}</h2>
                  <div className="grid grid-cols-3 gap-4 mt-2 text-sm">
                    <div>
                      <span className="text-gray-600">Trays:</span>{' '}
                      <span className="font-semibold">{schedule.total_trays}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Seed/Tray:</span>{' '}
                      <span className="font-semibold">{formatSeedQuantity(seedPerTray)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Total Seed:</span>{' '}
                      <span className="font-semibold">{formatSeedQuantity(totalSeed)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Details */}
              <div className="ml-12 mb-4">
                <p className="text-sm text-gray-600 mb-1">For Orders:</p>
                <ul className="text-sm space-y-1">
                  {schedule.orders.map((order: any, i: number) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                      <span>
                        {order.order_name}
                        {order.customer_name && ` (${order.customer_name})`}
                        {' - '}
                        {order.quantity} {order.quantity === 1 ? 'tray' : 'trays'}
                        {' - '}
                        Delivery: {order.delivery_date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {' '}({order.days_before_delivery} days)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recording Section */}
              <div className="ml-12 border-t border-gray-300 pt-3 mt-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="text-gray-600 block mb-1">Batch Used:</label>
                    <div className="border-b border-gray-400 h-6"></div>
                  </div>
                  <div>
                    <label className="text-gray-600 block mb-1">Actual Quantity:</label>
                    <div className="border-b border-gray-400 h-6"></div>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="text-gray-600 block mb-1">Notes:</label>
                  <div className="border border-gray-300 h-12 rounded"></div>
                </div>
              </div>

              {/* Completion Checkbox */}
              <div className="ml-12 mt-4 flex items-center gap-3">
                <div className="w-6 h-6 border-2 border-gray-600 rounded"></div>
                <span className="text-sm font-medium">Completed</span>
                <span className="text-sm text-gray-500 ml-4">Time: __________</span>
                <span className="text-sm text-gray-500 ml-4">By: __________</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-gray-300 text-center text-sm text-gray-500">
        <p>Sproutify Micro - Seeding Plan</p>
        <p>Please enter completed data back into the system after seeding.</p>
      </div>
    </div>
  );
};

export default SeedingPlanPrint;
