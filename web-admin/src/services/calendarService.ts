import { supabase } from '../lib/supabaseClient';

export interface CalendarDaySummary {
  farm_uuid: string;
  task_date: string; // YYYY-MM-DD
  harvest_count: number;
  seed_count: number;
  prep_count: number;
  water_count: number;
  warning_count: number;
}

export interface CalendarDayTask {
  task_date: string;
  task_name?: string | null;
  task_source?: string | null;
  step_type?: string | null;
  recipe_name?: string | null;
  variety_name?: string | null;
  quantity?: number | null;
  customer_name?: string | null;
}

export async function fetchCalendarMonth(
  farmUuid: string,
  year: number,
  month: number
): Promise<CalendarDaySummary[]> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('calendar_day_pivoted')
    .select('*')
    .eq('farm_uuid', farmUuid)
    .gte('task_date', startDate)
    .lte('task_date', endDate)
    .order('task_date', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export async function fetchDayTasks(farmUuid: string, date: string): Promise<CalendarDayTask[]> {
  const { data, error } = await supabase
    .from('daily_flow_aggregated')
    .select('*')
    .eq('farm_uuid', farmUuid)
    .eq('task_date', date)
    .order('task_name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}
