import { supabase } from '../lib/supabaseClient';

interface ReportParams {
  reportType: 'harvest' | 'delivery' | 'sales';
  startDate: Date;
  endDate: Date;
  filters?: Record<string, any>;
}

interface ReportResult {
  success: boolean;
  message?: string;
  reportUrl?: string;
}

/**
 * Generate a report via Supabase function (which calls n8n)
 */
export const generateReport = async (params: ReportParams): Promise<ReportResult> => {
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) {
      return { success: false, message: 'No session found' };
    }

    const { farmUuid } = JSON.parse(sessionData);
    const { data: { user } } = await supabase.auth.getUser();

    // Call Supabase function to generate report
    const { data, error } = await supabase.functions.invoke('generate-report', {
      body: {
        farm_uuid: farmUuid,
        report_type: params.reportType,
        start_date: params.startDate.toISOString(),
        end_date: params.endDate.toISOString(),
        filters: params.filters || {},
        user_id: user?.id,
      },
    });

    if (error) throw error;

    // Save to report history
    await supabase.from('report_history').insert({
      farm_uuid: farmUuid,
      report_type: params.reportType,
      parameters: {
        start_date: params.startDate.toISOString(),
        end_date: params.endDate.toISOString(),
        filters: params.filters || {},
      },
      generated_by: user?.id || null,
      status: 'completed',
      report_url: data?.reportUrl || null,
    });

    return {
      success: true,
      message: data?.message || 'Report generated successfully',
      reportUrl: data?.reportUrl,
    };
  } catch (error: any) {
    console.error('Error generating report:', error);
    return {
      success: false,
      message: error.message || 'Failed to generate report',
    };
  }
};

