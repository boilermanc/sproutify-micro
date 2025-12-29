import { useState } from 'react';
import { addDays, format } from 'date-fns';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { generateSeedingRequestsFromOrders, type GeneratedSeedingRequest } from '@/services/seedingService';

interface GenerateRequestsButtonProps {
  farmUuid: string | null;
  onGenerated?: () => void;
}

export function GenerateSeedingRequestsButton({ farmUuid, onGenerated }: GenerateRequestsButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<GeneratedSeedingRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!farmUuid) {
      setError('Session missing farm ID');
      return;
    }
    setIsLoading(true);
    setResults(null);
    setError(null);
    try {
      const created = await generateSeedingRequestsFromOrders(farmUuid, startDate, endDate);
      setResults(created);
      onGenerated?.();
    } catch (err: any) {
      setError(err?.message || 'Failed to generate seeding requests');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setResults(null);
    setError(null);
  };

  return (
    <>
      <Button onClick={() => setIsOpen(true)} variant="outline">
        <CalendarPlus className="w-4 h-4 mr-2" />
        Generate Week&apos;s Tasks
      </Button>

      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Seeding Requests</DialogTitle>
            <DialogDescription>
              Create seeding requests from standing orders for the selected date range. Requests respect seeding days
              and avoid duplicates.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>

            {error && (
              <div className="p-3 border border-red-200 bg-red-50 text-red-700 rounded-md text-sm">{error}</div>
            )}

            {results && (
              <div
                className={`mt-2 p-3 rounded-lg border ${
                  results.length === 0
                    ? 'bg-blue-50 border-blue-200 text-blue-800'
                    : 'bg-green-50 border-green-200 text-green-800'
                }`}
              >
                {results.length === 0 ? (
                  <p className="text-sm">
                    All standing orders in this range already have seeding requests.
                  </p>
                ) : (
                  <>
                    <h4 className="font-semibold text-sm mb-2">
                      Created {results.length} request{results.length > 1 ? 's' : ''}:
                    </h4>
                    <ul className="text-sm space-y-1 max-h-40 overflow-y-auto">
                      {results.map((r) => (
                        <li key={r.request_id}>
                          {r.recipe_name} × {r.quantity} — {r.seed_date} ({r.customer_name})
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              {results ? 'Close' : 'Cancel'}
            </Button>
            {!results && (
              <Button onClick={handleGenerate} disabled={isLoading}>
                {isLoading ? 'Generating...' : 'Generate Requests'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}







