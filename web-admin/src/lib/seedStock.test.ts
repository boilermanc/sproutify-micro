import { expect, it, vi } from 'vitest';
vi.mock('@/services/dailyFlowService', () => ({}));
import { seedStockByVariety } from './seedStock';

it('totals remaining stock across batches with declared units and usage', () => {
  const totals = seedStockByVariety([
    {batchid:34,varietyid:1,quantity:2,unit:'lbs'},
    {batchid:35,varietyid:1,quantity:100,unit:'g'},
    {batchid:36,varietyid:2,quantity:1,unit:'kg'},
  ], [{batch_id:34,quantity_grams:-60},{batch_id:35,quantity_grams:-20}]);
  expect(totals.get(1)).toBeCloseTo(927.184);
  expect(totals.get(2)).toBe(1000);
});
it('does not borrow stock from another batch or show negative availability', () => {
  expect(seedStockByVariety([{batchid:34,varietyid:1,quantity:10,unit:'g'}],
    [{batch_id:34,quantity_grams:-20},{batch_id:999,quantity_grams:500}]).get(1)).toBe(0);
});
