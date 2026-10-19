import { localDateString } from '@/lib/dateUtils';
import { useState } from 'react';
import { subDays } from 'date-fns';
import { FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import HarvestReport from '../components/reports/HarvestReport';
import DeliveryReport from '../components/reports/DeliveryReport';
import SalesReport from '../components/reports/SalesReport';
import SeedUsageReport from '../components/reports/SeedUsageReport';

type ReportType = 'harvest' | 'delivery' | 'sales' | 'seed-usage';

const ReportsPage = () => {
  const [reportType, setReportType] = useState<ReportType>('harvest');
  const [startDate, setStartDate] = useState<string>(
    localDateString(subDays(new Date(), 7))
  );
  const [endDate, setEndDate] = useState<string>(
    localDateString()
  );
  const [revision, setRevision] = useState(0);
  const rangeStart = new Date(startDate + 'T00:00:00');
  const rangeEnd = new Date(endDate + 'T23:59:59.999');
  const validRange = Boolean(startDate && endDate && Number.isFinite(rangeStart.getTime()) && Number.isFinite(rangeEnd.getTime()) && rangeStart <= rangeEnd);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-600 mt-1">View and print reports for your farm</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Report Configuration</CardTitle>
          <CardDescription>
            Select report type and date range
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="report_type">Report Type</Label>
              <Select value={reportType} onValueChange={(value: ReportType) => setReportType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="harvest">Harvest Report</SelectItem>
                  <SelectItem value="delivery">Delivery Report</SelectItem>
                  <SelectItem value="sales">Sales Report</SelectItem>
                  <SelectItem value="seed-usage">Seed Usage Report</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
            <Button onClick={() => setRevision(value => value + 1)} disabled={!validRange}>
              <FileText className="h-4 w-4 mr-2" />
              Refresh Preview
            </Button>
            <Button variant="outline" onClick={() => {
              // Preview report
              window.print();
            }}>
              <Download className="h-4 w-4 mr-2" />
              Print/Export
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Report Preview</CardTitle>
          <CardDescription>
            {reportType === 'harvest' && 'Harvested weight by recipe and variety'}
            {reportType === 'delivery' && 'Delivery report listed by customer, product, size, and price'}
            {reportType === 'sales' && 'Sales report by customer, product, and size'}
            {reportType === 'seed-usage' && 'Seed inventory usage over time by variety'}
          </CardDescription>
        </CardHeader>
        <CardContent key={`${revision}-${startDate}-${endDate}`}>
          {!validRange && <p role="alert" className="text-red-700">Choose a start date on or before the end date.</p>}
          {validRange && reportType === 'harvest' && (
            <HarvestReport startDate={rangeStart} endDate={rangeEnd} />
          )}
          {validRange && reportType === 'delivery' && (
            <DeliveryReport startDate={rangeStart} endDate={rangeEnd} />
          )}
          {validRange && reportType === 'sales' && (
            <SalesReport startDate={rangeStart} endDate={rangeEnd} />
          )}
          {validRange && reportType === 'seed-usage' && (
            <SeedUsageReport startDate={rangeStart} endDate={rangeEnd} />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportsPage;

