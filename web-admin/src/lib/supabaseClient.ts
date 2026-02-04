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
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  global: {
    fetch: (...args: Parameters<typeof fetch>) => {
      return fetch(...args).catch((err) => {
        console.error('[Supabase] Fetch failed, connection may be stale:', err);
        throw err;
      });
    },
  },
  db: {
    schema: 'public' as const,
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

// Handle tab visibility changes to recover stale connections
if (typeof document !== 'undefined' && supabase) {
  let lastVisibilityChange = Date.now();

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      const timeSinceHidden = Date.now() - lastVisibilityChange;
      const minutesHidden = Math.round(timeSinceHidden / 1000 / 60);

      // If tab was hidden for more than 30 minutes, force a full reload immediately
      if (timeSinceHidden > 30 * 60 * 1000) {
        console.log('[Supabase] Tab restored after', minutesHidden, 'minutes - forcing page reload');
        window.location.reload();
        return;
      }

      // If tab was hidden for more than 5 seconds, do a health check
      // Lower threshold catches more stale connection scenarios
      if (timeSinceHidden > 5 * 1000) {
        const secondsHidden = Math.round(timeSinceHidden / 1000);
        console.log('[Supabase] Tab restored after', secondsHidden, 'seconds - checking connection health');

        try {
          // Race between a simple query and a 3-second timeout
          // Using limit(1) without single() to avoid errors if no/multiple rows
          const healthCheck = Promise.race([
            supabase.from('farms').select('farm_uuid').limit(1),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Health check timeout')), 3000)
            )
          ]);

          await healthCheck;
          console.log('[Supabase] Connection healthy');

          // Connection is healthy, just refresh the session
          const { error } = await supabase.auth.refreshSession();
          if (error) {
            console.error('[Supabase] Session refresh failed:', error);
          }
        } catch (err) {
          console.error('[Supabase] Connection unhealthy, forcing reload:', err);
          window.location.reload();
          return;
        }
      }
    } else {
      lastVisibilityChange = Date.now();
    }
  });
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
