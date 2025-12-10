// Recipe Builder Types

export interface StepDescription {
  description_id: number;
  description_name: string; // e.g., 'Seeding', 'Blackout', 'Watering'
  step_color: string; // Hex code
  description_details?: string;
}

export interface Variety {
  variety_id: number;
  variety_name: string;
}

export interface RecipeStep {
  // Frontend specific ID for Drag & Drop / Editing tracking
  ui_id: string;
  
  // Database Fields (optional because new steps won't have DB IDs yet)
  step_id?: number;
  recipe_id?: number;
  
  sequence_order: number;
  description_id: number;
  description_name: string; // Denormalized for display
  duration: number;
  duration_unit: 'Days' | 'Hours';
  instructions?: string;
  
  // Conditional: Blackout
  requires_weight?: boolean;
  weight_lbs?: number;
  do_not_disturb_days?: number;
  misting_frequency?: 'none' | '1x daily' | '2x daily' | '3x daily' | 'custom' | 'mist' | 'water';
  misting_start_day?: number;
  
  // Conditional: Watering
  water_type?: 'water' | 'nutrients';
  water_method?: 'top' | 'bottom'; // For growing steps: top water or bottom water
  water_frequency?: '1x daily' | '2x daily' | '3x daily' | 'custom'; // For growing steps: times per day
  
  // Medium type for seeding/soaking steps
  medium_type?: 'soil' | 'coco coir' | 'hemp mat' | 'paper towel' | 'other';
  
  // UI Helper
  color?: string;
}

export interface RecipeMetadata {
  recipe_name: string;
  variety_id: string | number; // select value is usually string
  type: 'Standard' | 'Custom';
  seed_quantity: number;
  seed_quantity_unit: 'grams' | 'oz';
}

