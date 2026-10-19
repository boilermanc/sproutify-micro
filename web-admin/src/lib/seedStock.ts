import { seedBatchAvailableGrams } from '@/services/workerTasks';

export function seedStockByVariety(
  batches: Array<{batchid:number; varietyid:number; quantity:number|string; unit:string|null}>,
  transactions: Array<{batch_id:number; quantity_grams:number|string}>,
): Map<number, number> {
  const totals = new Map<number, number>();
  for (const batch of batches) {
    const available = seedBatchAvailableGrams(Number(batch.quantity), transactions.filter(row => row.batch_id === batch.batchid), batch.unit || 'lbs');
    totals.set(batch.varietyid, (totals.get(batch.varietyid) ?? 0) + available);
  }
  return totals;
}
