import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || import.meta.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || import.meta.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl) {
  throw new Error(
    'Missing Supabase URL. Please set VITE_SUPABASE_URL in your .env file. ' +
    'Create a .env file in the web-admin directory with: VITE_SUPABASE_URL=your_supabase_url'
  );
}

if (!supabaseAnonKey) {
  throw new Error(
    'Missing Supabase Anon Key. Please set VITE_SUPABASE_ANON_KEY in your .env file. ' +
    'Create a .env file in the web-admin directory with: VITE_SUPABASE_ANON_KEY=your_supabase_anon_key'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      profile: {
        Row: {
          id: string;
          email: string;
          name: string;
          farm_uuid: string;
          role: string;
          is_active: boolean;
          created_at: string;
          last_active: string;
        };
      };
      farms: {
        Row: {
          farm_uuid: string;
          farm_name: string;
          created_at: string;
          is_active: boolean;
        };
      };
      varieties: {
        Row: {
          variety_id: number;
          variety_name: string;
          description: string;
          farm_uuid: string;
          is_active: boolean;
          stock: number;
          stock_unit: string;
          created_at: string;
        };
      };
      recipes: {
        Row: {
          recipe_id: number;
          recipe_name: string;
          description: string;
          type: string;
          variety_name: string;
          farm_uuid: string;
          is_active: boolean;
          notes: string;
          created_by: string;
          created_at: string;
        };
      };
      steps: {
        Row: {
          step_id: number;
          recipe_id: number;
          step_order: number;
          step_description: string;
          duration_days: number;
        };
      };
      trays: {
        Row: {
          tray_id: number;
          farm_uuid: string;
          tray_unique_id: string;
          recipe_id: number;
          customer_id: number;
          sow_date: string;
          harvest_date: string;
          yield: number;
          batch_id: number;
          created_by: string;
          created_at: string;
        };
      };
      customers: {
        Row: {
          customer_id: number;
          farm_uuid: string;
          customer_name: string;
          email: string;
          phone: string;
          address: string;
          created_at: string;
        };
      };
      vendors: {
        Row: {
          vendor_id: number;
          farm_uuid: string;
          vendor_name: string;
          email: string;
          phone: string;
          address: string;
          created_at: string;
        };
      };
      seedbatches: {
        Row: {
          batch_id: number;
          farm_uuid: string;
          variety_name: string;
          purchase_date: string;
          quantity: number;
          vendor_id: number;
          notes: string;
        };
      };
      daily_tasks_view: {
        Row: {
          task_id: number;
          farm_uuid: string;
          task_date: string;
          task_description: string;
          is_completed: boolean;
          tray_id: number;
        };
      };
    };
    Views: {
      profile_with_farm: {
        Row: {
          id: string;
          email: string;
          name: string;
          farm_uuid: string;
          farm_name: string;
          role: string;
        };
      };
      recipes_with_creator_name: {
        Row: {
          recipe_id: number;
          recipe_name: string;
          creator_name: string;
          variety_name: string;
        };
      };
    };
  };
};

