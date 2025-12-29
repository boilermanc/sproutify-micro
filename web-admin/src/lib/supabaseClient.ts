import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Define Json type locally since it's not exported from @supabase/supabase-js
type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || import.meta.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || import.meta.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// NEVER throw during module initialization - this prevents other modules from loading
// This ensures session.ts and other modules can always expose their exports
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file. ' +
    'Create a .env file in the web-admin directory with these variables.'
  );
}

// Export a safe client that may be null if not configured
// This allows the module to always initialize successfully
const supabaseOptions = {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
    lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
      return fn();
    },
  },
};

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, supabaseOptions)
    : null;

// Helper function to ensure supabase is not null
// Throws an error if supabase is not configured
export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase client is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
  }
  return supabase;
}

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
          onboarding_status: Json | null;
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

