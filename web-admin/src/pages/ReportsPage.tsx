import { useState } from 'react';
import { FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import HarvestReport from '../components/reports/HarvestReport';
import DeliveryReport from '../components/reports/DeliveryReport';
import SalesReport from '../components/reports/SalesReport';
import { generateReport } from '../services/reportService';

type ReportType = 'harvest' | 'delivery' | 'sales';

const ReportsPage = () => {
  const [reportType, setReportType] = useState<ReportType>('harvest');
  const [startDate, setStartDate] = useState<string>(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [generating, setGenerating] = useState(false);

  const handleGenerateReport = async () => {
    setGenerating(true);
    try {
      const result = await generateReport({
        reportType,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });

      if (result.success) {
        alert(`Report generated successfully! ${result.message || ''}`);
      } else {
        // Show a more helpful error message
        const errorMsg = result.message || 'Unknown error';
        if (errorMsg.includes('no data') || errorMsg.includes('No data')) {
          alert(`No data available for the selected date range.\n\nTry:\n• Selecting a different date range\n• Ensuring you have ${reportType === 'harvest' ? 'harvested trays' : reportType === 'delivery' ? 'completed orders' : 'sales data'} in that period`);
        } else if (errorMsg.includes('CORS') || errorMsg.includes('connect') || errorMsg.includes('network')) {
          alert(`Unable to connect to the report service.\n\nThis may be due to:\n• The service being temporarily unavailable\n• Network connectivity issues\n• No data available for the selected date range\n\nPlease try again later or contact support if the issue persists.`);
        } else {
          alert(`Unable to generate report:\n\n${errorMsg}\n\nIf this persists, the report service may be temporarily unavailable.`);
        }
      }
    } catch (error: any) {
      console.error('Error generating report:', error);
      const errorMsg = error.message || 'Unknown error occurred';
      if (errorMsg.includes('no data') || errorMsg.includes('No data')) {
        alert(`No data available for the selected date range.\n\nTry selecting a different date range or ensure you have data for the selected period.`);
      } else if (errorMsg.includes('CORS') || errorMsg.includes('connect') || errorMsg.includes('network') || errorMsg.includes('ERR_FAILED')) {
        alert(`Unable to connect to the report service.\n\nThis may be due to:\n• The service being temporarily unavailable\n• Network connectivity issues\n• No data available for the selected date range\n\nPlease try again later or contact support if the issue persists.`);
      } else {
        alert(`Failed to generate report:\n\n${errorMsg}`);
      }
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-600 mt-1">Generate and view reports for your farm</p>
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
            <Button onClick={handleGenerateReport} disabled={generating}>
              <FileText className="h-4 w-4 mr-2" />
              {generating ? 'Generating...' : 'Generate Report'}
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
            {reportType === 'harvest' && 'Harvest report sorted by product and size'}
            {reportType === 'delivery' && 'Delivery report listed by customer, product, size, and price'}
            {reportType === 'sales' && 'Sales report by customer, product, and size'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reportType === 'harvest' && (
            <HarvestReport startDate={new Date(startDate)} endDate={new Date(endDate)} />
          )}
          {reportType === 'delivery' && (
            <DeliveryReport startDate={new Date(startDate)} endDate={new Date(endDate)} />
          )}
          {reportType === 'sales' && (
            <SalesReport startDate={new Date(startDate)} endDate={new Date(endDate)} />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportsPage;

