import { getSupabaseClient } from '../lib/supabaseClient';

interface ReportParams {
  reportType: 'harvest' | 'delivery' | 'sales' | 'seed-usage';
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
 * Generate a report via getSupabaseClient() function (which calls n8n)
 */
export const generateReport = async (params: ReportParams): Promise<ReportResult> => {
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) {
      return { success: false, message: 'No session found' };
    }

    const { farmUuid } = JSON.parse(sessionData);
    const { data: { user } } = await getSupabaseClient().auth.getUser();

    // Call getSupabaseClient() function to generate report
    const { data, error } = await getSupabaseClient().functions.invoke('generate-report', {
      body: {
        farm_uuid: farmUuid,
        report_type: params.reportType,
        start_date: params.startDate.toISOString(),
        end_date: params.endDate.toISOString(),
        filters: params.filters || {},
        user_id: user?.id,
      },
    });

    if (error) {
      // Provide more user-friendly error messages
      const errorMsg = error.message || String(error);
      if (errorMsg.includes('Failed to send a request') || 
          errorMsg.includes('fetch') || 
          errorMsg.includes('CORS') ||
          errorMsg.includes('ERR_FAILED') ||
          errorMsg.includes('FunctionsFetchError')) {
        throw new Error('Unable to connect to the report service. This may be due to:\n• No data available for the selected date range\n• The report service being temporarily unavailable\n• Network connectivity issues\n\nPlease try again later or contact support if the issue persists.');
      }
      throw error;
    }

    // Save to report history
    await getSupabaseClient().from('report_history').insert({
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
    
    // Provide user-friendly error messages
    let userMessage = 'Failed to generate report';
    const errorMsg = error.message || String(error);
    
    if (errorMsg.includes('no data') || errorMsg.includes('No data')) {
      userMessage = 'No data available for the selected date range. Try selecting a different date range or ensure you have harvests, orders, or sales data.';
    } else if (errorMsg.includes('connect') || 
               errorMsg.includes('network') || 
               errorMsg.includes('Failed to send') ||
               errorMsg.includes('CORS') ||
               errorMsg.includes('ERR_FAILED') ||
               errorMsg.includes('FunctionsFetchError')) {
      userMessage = 'Unable to connect to the report service. This may be due to:\n• No data available for the selected date range\n• The report service being temporarily unavailable\n• Network connectivity issues\n\nPlease try again later or contact support if the issue persists.';
    } else if (errorMsg) {
      userMessage = errorMsg;
    }
    
    return {
      success: false,
      message: userMessage,
    };
  }
};

