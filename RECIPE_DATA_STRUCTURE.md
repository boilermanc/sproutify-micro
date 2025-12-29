# Recipe Data Structure Overview

This document provides a comprehensive overview of how recipe data is structured in the Sproutify system.

## Database Schema

### 1. **Recipes Table** (`recipes`)

The main table storing recipe information:

```sql
recipes
├── recipe_id (SERIAL PRIMARY KEY)
├── recipe_name (TEXT NOT NULL)
├── description (TEXT)
├── type (TEXT) - 'Standard' or 'Custom'
├── variety_id (INTEGER) - Foreign key to varieties table
├── variety_name (TEXT) - Denormalized for backward compatibility
├── seed_quantity (NUMERIC(10,2)) - Seed quantity per tray
├── seed_quantity_unit (TEXT) - 'grams' or 'oz'
├── farm_uuid (UUID) - Foreign key to farms table
├── is_active (BOOLEAN DEFAULT TRUE)
├── notes (TEXT)
├── created_by (UUID) - Foreign key to profile table
└── created_at (TIMESTAMP WITH TIME ZONE)
```

**Key Points:**
- Each recipe belongs to a specific farm (`farm_uuid`)
- Recipes are linked to a variety via `variety_id` (with `variety_name` for backward compatibility)
- `type` can be 'Standard' (common template) or 'Custom' (user's variation)
- `seed_quantity` and `seed_quantity_unit` define how much seed is needed per tray

---

### 2. **Steps Table** (`steps`)

Stores individual steps that make up a recipe:

```sql
steps
├── step_id (SERIAL PRIMARY KEY)
├── recipe_id (INTEGER) - Foreign key to recipes (CASCADE DELETE)
├── sequence_order (INTEGER NOT NULL) - Order of step execution
├── description_id (INTEGER) - Foreign key to step_descriptions
├── description_name (VARCHAR) - Denormalized step name (e.g., "Blackout", "Watering")
├── duration (NUMERIC(10,2)) - Duration value
├── duration_unit (VARCHAR(20)) - 'Days' or 'Hours'
├── instructions (TEXT) - Optional additional notes
│
├── -- Blackout-specific fields (conditional)
├── requires_weight (BOOLEAN DEFAULT FALSE)
├── weight_lbs (NUMERIC(5,2)) - Weight in pounds for weighted dome
├── do_not_disturb_days (INTEGER DEFAULT 0) - Days at start where tray shouldn't be disturbed
├── misting_frequency (TEXT) - 'none', '1x daily', '2x daily', '3x daily', 'custom'
├── misting_start_day (INTEGER DEFAULT 0) - Day within step when misting starts
│
└── -- Watering-specific fields (conditional)
    └── water_type (TEXT) - 'water' or 'nutrients'
```

**Key Points:**
- Steps are ordered by `sequence_order` (1, 2, 3, ...)
- Each step references a `step_descriptions` entry via `description_id`
- Conditional fields:
  - **Blackout fields**: Only used when `description_name = 'Blackout'`
  - **Water type**: Only used for watering-related steps
- Steps are deleted when their recipe is deleted (CASCADE)

---

### 3. **Step Descriptions Table** (`step_descriptions`)

Reference table for available step types:

```sql
step_descriptions
├── description_id (SERIAL PRIMARY KEY)
├── description_name (VARCHAR) - e.g., "Seeding", "Blackout", "Watering", "Harvest"
├── description_details (TEXT) - Detailed explanation
└── step_color (VARCHAR) - Color code for UI display
```

**Common Step Types:**
- Seeding
- Soaking
- Pre-sprouting
- Blackout
- Watering
- Growing
- Harvest

---

### 4. **Varieties Table** (`varieties`)

The plant varieties that recipes are associated with:

```sql
varieties
├── variety_id (SERIAL PRIMARY KEY)
├── variety_name (TEXT NOT NULL)
├── description (TEXT)
├── farm_uuid (UUID) - Foreign key to farms
├── is_active (BOOLEAN DEFAULT TRUE)
└── created_at (TIMESTAMP WITH TIME ZONE)
```

---

## Data Flow: Creating a Recipe

### Step 1: User Input (UI State)

When a user creates a recipe, the following state is maintained:

```typescript
// Recipe metadata
newRecipe = {
  recipe_name: string,
  variety_id: string,  // Selected variety ID
  type: 'Standard' | 'Custom',
  seed_quantity: number | null,
  seed_quantity_unit: 'grams' | 'oz'
}

// Steps array
newRecipeSteps = [
  {
    sequence_order: 1,
    description_id: number | null,
    description_name: string,
    duration: number,
    duration_unit: 'Days' | 'Hours',
    instructions: string,
    // Conditional fields
    requires_weight: boolean,
    weight_lbs: number | null,
    misting_frequency: 'none' | '1x daily' | '2x daily' | '3x daily' | 'custom',
    misting_start_day: number,
    do_not_disturb_days: number,
    water_type: 'water' | 'nutrients' | null
  },
  // ... more steps
]
```

### Step 2: Recipe Creation (Database Insert)

1. **Insert Recipe Record:**
   ```typescript
   const payload = {
     recipe_name: newRecipe.recipe_name,
     variety_id: varietyId,  // From selected variety
     variety_name: varietyName,  // Denormalized for compatibility
     type: newRecipe.type,
     seed_quantity: newRecipe.seed_quantity || null,
     seed_quantity_unit: newRecipe.seed_quantity_unit || 'grams',
     farm_uuid: farmUuid,
     is_active: true
   };
   
   const { data: createdRecipe } = await supabase
     .from('recipes')
     .insert([payload])
     .select()
     .single();
   ```

2. **Insert Steps (if any):**
   ```typescript
   const stepsData = newRecipeSteps.map((step) => ({
     recipe_id: createdRecipe.recipe_id,  // Link to created recipe
     sequence_order: step.sequence_order,
     description_id: step.description_id || null,
     description_name: step.description_name || 'Untitled Step',
     duration: step.duration || 0,
     duration_unit: step.duration_unit || 'Days',
     instructions: step.instructions || null,
     requires_weight: step.requires_weight || false,
     weight_lbs: step.weight_lbs || null,
     misting_frequency: step.misting_frequency || 'none',
     misting_start_day: step.misting_start_day || 0,
     do_not_disturb_days: step.do_not_disturb_days || 0,
     water_type: step.water_type || null,
   }));
   
   await supabase.from('steps').insert(stepsData);
   ```

---

## Relationships

```
farms (1) ──< (many) recipes
varieties (1) ──< (many) recipes
recipes (1) ──< (many) steps
step_descriptions (1) ──< (many) steps
```

**Visual Hierarchy:**
```
Farm
└── Recipe (recipe_id, recipe_name, variety_id, type, seed_quantity)
    └── Step 1 (sequence_order: 1, description_id, duration, ...)
    └── Step 2 (sequence_order: 2, description_id, duration, ...)
    └── Step 3 (sequence_order: 3, description_id, duration, ...)
```

---

## Conditional Field Logic

### Blackout-Specific Fields

These fields are only relevant when `description_name = 'Blackout'`:

- `requires_weight`: Whether a weighted dome is needed
- `weight_lbs`: Weight in pounds (e.g., 5.0)
- `do_not_disturb_days`: Days at start where tray shouldn't be disturbed
- `misting_frequency`: How often to mist during blackout
- `misting_start_day`: When misting begins within the step

**Example:**
```typescript
{
  description_name: 'Blackout',
  duration: 4,
  duration_unit: 'Days',
  requires_weight: true,
  weight_lbs: 5.0,
  do_not_disturb_days: 3,
  misting_frequency: '2x daily',
  misting_start_day: 3  // Start misting on day 3 of the blackout step
}
```

### Watering-Specific Fields

The `water_type` field is only relevant for watering-related steps:

- `water_type: 'water'` - Plain water
- `water_type: 'nutrients'` - Nutrient solution

**Example:**
```typescript
{
  description_name: 'Watering',
  duration: 1,
  duration_unit: 'Days',
  water_type: 'nutrients'  // Use nutrient solution
}
```

---

## Global Recipes System

The system also supports **Global Recipes** (pre-built Sproutify recipes):

### Tables:
- `global_recipes` - Pre-built recipes (not farm-specific)
- `global_steps` - Steps for global recipes
- `farm_global_recipes` - Junction table linking farms to global recipes

### Workflow:
1. User selects a global recipe
2. System copies it to create a farm-specific recipe (type: 'Custom')
3. Steps are copied from `global_steps` to `steps`
4. Recipe is linked to the farm via `farm_uuid`

---

## Data Validation

### Required Fields:
- `recipe_name` - Must not be empty
- `variety_id` - Must select a valid variety
- `type` - Must be 'Standard' or 'Custom'

### Step Validation:
- `sequence_order` - Must be unique within a recipe (1, 2, 3, ...)
- `description_id` - Should reference a valid `step_descriptions` entry
- `duration` - Should be >= 0
- `duration_unit` - Must be 'Days' or 'Hours'

### Conditional Validation:
- If `description_name = 'Blackout'` and `requires_weight = true`, then `weight_lbs` should be provided
- If `description_name` includes 'water'/'irrigat'/'nutrient'/'growing', then `water_type` should be set

---

## Usage in Daily Flow

When a tray is created with a recipe, the steps are used to generate daily tasks:

1. **Task Generation**: Steps are processed by `dailyFlowService.ts`
2. **Recurring Tasks**: Steps with `misting_frequency` generate recurring "Mist" tasks
3. **Weighted Dome**: Steps with `requires_weight = true` generate a "Setup Weighted Dome" task on day 1
4. **Watering Tasks**: Steps with `water_type` generate tasks labeled "(Plain)" or "(Nutrients)"

---

## Summary

**Recipe Creation Flow:**
1. User fills recipe metadata (name, variety, type, seed quantity)
2. User adds steps via Step Builder modal
3. On save:
   - Recipe record is inserted into `recipes` table
   - Step records are inserted into `steps` table (linked via `recipe_id`)
4. Steps are ordered by `sequence_order` and executed in sequence
5. Conditional fields enable specific behaviors (misting, weighted domes, water types)

**Key Design Decisions:**
- Steps are stored separately from recipes (normalized design)
- Conditional fields allow step-specific configurations
- `variety_name` is denormalized for backward compatibility
- `description_name` is denormalized in steps for easier querying
- Seed quantity moved from varieties to recipes (allows different densities per recipe)













