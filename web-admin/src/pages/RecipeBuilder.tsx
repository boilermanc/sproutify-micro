import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabaseClient';
import { RecipeStack } from '../components/recipes/builder/RecipeStack';
import { StepComposer } from '../components/recipes/builder/StepComposer';
import { ErrorModal } from '../components/ui/ErrorModal';
import type { RecipeStep, StepDescription, Variety, RecipeMetadata } from '@/types/recipe';

export const RecipeBuilderPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const recipeId = searchParams.get('id');

  // --- State ---
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorModal, setErrorModal] = useState<{ isOpen: boolean; title: string; message: string; type?: 'error' | 'success' }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'error'
  });
  
  // Reference Data
  const [descriptions, setDescriptions] = useState<StepDescription[]>([]);
  const [varieties, setVarieties] = useState<Variety[]>([]);
  
  // Recipe Data
  const [metadata, setMetadata] = useState<RecipeMetadata>({
    recipe_name: '',
    variety_id: '',
    type: 'Standard',
    seed_quantity: 0,
    seed_quantity_unit: 'grams'
  });
  
  const [steps, setSteps] = useState<RecipeStep[]>([]);
  const [editingStep, setEditingStep] = useState<RecipeStep | null>(null);

  // --- Initial Load ---
  useEffect(() => {
    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId, location.state]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Reference Tables
      const { data: descData } = await getSupabaseClient().from('step_descriptions').select('*').order('description_name');
      const { data: varData } = await getSupabaseClient().from('varieties').select('varietyid, name').order('name');
      
      setDescriptions(descData || []);
      
      // Normalize variety data
      const normalized = (varData || []).map((v: { varietyid?: number; variety_id?: number; name?: string; variety_name?: string }) => ({
        variety_id: v.varietyid ?? v.variety_id ?? 0,
        variety_name: v.name ?? v.variety_name ?? '',
      }));
      setVarieties(normalized);

      // 2. Handle Global Recipe Copy (from location state)
      if (location.state?.globalRecipe) {
        const { globalRecipe, globalSteps } = location.state;
        const matchingVariety = normalized.find((v: Variety) => {
          const vName = v.variety_name.toLowerCase();
          const gName = (globalRecipe.variety_name || '').toLowerCase();
          return vName === gName;
        });

        setMetadata({
          recipe_name: `${globalRecipe.recipe_name} (Custom)`,
          variety_id: matchingVariety ? matchingVariety.variety_id.toString() : '',
          type: 'Custom',
          seed_quantity: 0,
          seed_quantity_unit: 'grams'
        });

        // Map global steps to RecipeStep format
        const mappedSteps: RecipeStep[] = (globalSteps || []).map((step: {
          description_id: number;
          description_name: string;
          sequence_order: number;
          duration: number;
          duration_unit: string;
          instructions?: string;
          requires_weight?: boolean;
          weight_lbs?: number;
          do_not_disturb_days?: number;
          misting_frequency?: string;
          misting_start_day?: number;
          water_type?: string;
        }, index: number) => {
          const desc = (descData || []).find((d: StepDescription) => d.description_id === step.description_id);
          return {
            ui_id: `step-${Date.now()}-${index}`,
            sequence_order: step.sequence_order || index + 1,
            description_id: step.description_id,
            description_name: step.description_name || desc?.description_name || '',
            duration: step.duration || 0,
            duration_unit: (step.duration_unit === 'Days' || step.duration_unit === 'Hours' ? step.duration_unit : 'Days') as 'Days' | 'Hours',
            instructions: step.instructions || '',
            color: desc?.step_color,
            requires_weight: step.requires_weight,
            weight_lbs: step.weight_lbs,
            do_not_disturb_days: step.do_not_disturb_days,
            misting_frequency: step.misting_frequency,
            misting_start_day: step.misting_start_day,
            water_type: step.water_type,
          };
        });
        setSteps(mappedSteps);
        setLoading(false);
        return;
      }

      // 3. Fetch Existing Recipe (if editing)
      if (recipeId) {
        const { data: recipe } = await getSupabaseClient().from('recipes').select('*').eq('recipe_id', recipeId).single();
        const { data: existingSteps } = await getSupabaseClient().from('steps').select('*').eq('recipe_id', recipeId).order('sequence_order');
        
        if (recipe) {
          setMetadata({
            recipe_name: recipe.recipe_name,
            variety_id: recipe.variety_id?.toString() || '',
            type: recipe.type || 'Standard',
            seed_quantity: recipe.seed_quantity || 0,
            seed_quantity_unit: recipe.seed_quantity_unit || 'grams'
          });
        }

        if (existingSteps) {
          // Map DB steps to UI steps (add color from descriptions)
          // First pass: map all steps and get their colors
          const stepsWithColors = existingSteps.map((s: {
            step_id: number;
            description_id: number;
            description_name: string;
            sequence_order: number;
            duration: number;
            duration_unit: string;
            instructions?: string;
            requires_weight?: boolean;
            weight_lbs?: number;
            misting_frequency?: string;
            misting_start_day?: number;
            do_not_disturb_days?: number;
            water_type?: string;
            water_method?: string;
            water_frequency?: string;
          }) => {
            const desc = (descData || []).find((d: StepDescription) => d.description_id === s.description_id);
            return {
              step: s,
              desc,
              defaultColor: desc?.step_color
            };
          });
          
          // Check if any step already has orange
          const orangeColor = '#FFA500';
          const hasOrange = stepsWithColors.some(({ desc }) => 
            desc?.step_color?.toLowerCase() === orangeColor.toLowerCase()
          );
          
          // Second pass: assign colors, using orange for germination if not already used
          const mappedSteps: RecipeStep[] = stepsWithColors.map(({ step: s, desc, defaultColor }) => {
            const descName = (desc?.description_name || s.description_name || '').toLowerCase();
            const isGermination = descName.includes('germination');
            
            // For germination steps: use orange if no other step has orange, otherwise use default color
            const stepColor = (isGermination && !hasOrange) ? orangeColor : defaultColor;
            
            return {
              ...s,
              ui_id: s.step_id.toString(), // Use DB ID as UI ID for existing
              description_name: desc?.description_name || s.description_name,
              color: stepColor,
              duration_unit: (s.duration_unit === 'Days' || s.duration_unit === 'Hours' ? s.duration_unit : 'Days') as 'Days' | 'Hours',
              misting_frequency: (s.misting_frequency === 'none' || s.misting_frequency === '1x daily' || s.misting_frequency === '2x daily' || s.misting_frequency === '3x daily' || s.misting_frequency === 'custom' ? s.misting_frequency : undefined) as 'none' | '1x daily' | '2x daily' | '3x daily' | 'custom' | undefined,
              water_type: (s.water_type === 'water' || s.water_type === 'nutrients' ? s.water_type : undefined) as 'water' | 'nutrients' | undefined,
              water_method: (s.water_method === 'top' || s.water_method === 'bottom' ? s.water_method : undefined) as 'top' | 'bottom' | undefined,
              water_frequency: (s.water_frequency === '1x daily' || s.water_frequency === '2x daily' || s.water_frequency === '3x daily' || s.water_frequency === 'custom' ? s.water_frequency : undefined) as '1x daily' | '2x daily' | '3x daily' | 'custom' | undefined,
            };
          });
          setSteps(mappedSteps);
        }
      }
    } catch (error) {
      console.error("Error loading builder:", error);
      alert("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  // --- Handlers ---

  const handleCommitStep = (stepData: RecipeStep) => {
    if (editingStep) {
      // Replace existing step
      setSteps(prev => prev.map(s => s.ui_id === editingStep.ui_id ? stepData : s));
      setEditingStep(null);
    } else {
      // Append new step and re-index
      const newStep = {
        ...stepData,
        sequence_order: steps.length + 1
      };
      setSteps(prev => [...prev, newStep]);
    }
  };

  const handleDelete = (ui_id: string) => {
    setSteps(prev => {
      const filtered = prev.filter(s => s.ui_id !== ui_id);
      // Re-index remaining steps
      return filtered.map((step, index) => ({
        ...step,
        sequence_order: index + 1
      }));
    });
  };

  const handleMove = (ui_id: string, direction: 'up' | 'down') => {
    const index = steps.findIndex(s => s.ui_id === ui_id);
    if (index === -1) return;
    
    const newSteps = [...steps];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (swapIndex >= 0 && swapIndex < newSteps.length) {
      [newSteps[index], newSteps[swapIndex]] = [newSteps[swapIndex], newSteps[index]];
      // Re-index
      newSteps.forEach((step, i) => {
        step.sequence_order = i + 1;
      });
      setSteps(newSteps);
    }
  };

  const handleSaveRecipe = async () => {
    if (!metadata.recipe_name || !metadata.variety_id) {
      alert("Please provide a Recipe Name and Variety.");
      return;
    }
    if (steps.length === 0) {
      alert("Please add at least one step.");
      return;
    }

    setSaving(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) {
        alert("Session expired. Please log in again.");
        return;
      }

      const { farmUuid, userId } = JSON.parse(sessionData);
      
      // Validate required fields
      if (!farmUuid) {
        throw new Error('Farm UUID is missing from session. Please log in again.');
      }
      if (!userId) {
        throw new Error('User ID is missing from session. Please log in again.');
      }
      
      const selectedVariety = varieties.find(v => v.variety_id === Number(metadata.variety_id));

      // 1. Upsert Recipe Header
      const recipePayload = {
        recipe_name: metadata.recipe_name,
        variety_id: Number(metadata.variety_id),
        variety_name: selectedVariety?.variety_name || '',
        type: metadata.type,
        seed_quantity: metadata.seed_quantity,
        seed_quantity_unit: metadata.seed_quantity_unit,
        farm_uuid: farmUuid,
        is_active: true,
      };

      let currentRecipeId = recipeId ? parseInt(recipeId) : null;

      if (currentRecipeId) {
        // Update
        await getSupabaseClient().from('recipes').update(recipePayload).eq('recipe_id', currentRecipeId);
        // Delete old steps to replace with new sequence (Simpler than diffing)
        await getSupabaseClient().from('steps').delete().eq('recipe_id', currentRecipeId);
      } else {
        // Insert
        const { data: newRecipe, error } = await getSupabaseClient().from('recipes').insert([recipePayload]).select().single();
        if (error) throw error;
        currentRecipeId = newRecipe.recipe_id;
      }

      // 2. Insert Steps
      const stepsPayload = steps.map((step, index) => ({
        recipe_id: currentRecipeId,
        sequence_order: index + 1, // Re-index based on current array order
        step_name: step.description_name || 'Untitled Step', // Required field
        description_id: step.description_id,
        description_name: step.description_name,
        duration: step.duration,
        duration_unit: step.duration_unit,
        instructions: step.instructions || null,
        requires_weight: step.requires_weight || false,
        weight_lbs: step.weight_lbs || null,
        misting_frequency: step.misting_frequency || 'none',
        misting_start_day: step.misting_start_day || 0,
        do_not_disturb_days: step.do_not_disturb_days || 0,
        water_type: step.water_type || null,
        water_method: step.water_method || null,
        water_frequency: step.water_frequency || null,
        farm_uuid: farmUuid, // Required field - UUID type
        created_by: String(userId), // Required field - VARCHAR type (convert UUID to string)
      }));

      // Debug: Verify farm_uuid and created_by are in payload
      if (stepsPayload.length > 0) {
        console.log('Steps payload sample:', JSON.stringify(stepsPayload[0], null, 2));
        console.log('Farm UUID:', farmUuid, 'Type:', typeof farmUuid);
        console.log('User ID:', userId, 'Type:', typeof userId);
        console.log('Has farm_uuid in payload?', 'farm_uuid' in stepsPayload[0]);
        console.log('Has created_by in payload?', 'created_by' in stepsPayload[0]);
      }

      const { error: stepError } = await getSupabaseClient().from('steps').insert(stepsPayload);
      if (stepError) throw stepError;

      setErrorModal({
        isOpen: true,
        title: 'Success!',
        message: 'Recipe saved successfully!',
        type: 'success'
      });
      
      setTimeout(() => {
        navigate('/recipes');
      }, 1500);

    } catch (error: unknown) {
      console.error("Save error:", error);
      const errorMessage = (error as { message?: string; details?: string })?.message || 
                           (error as { message?: string; details?: string })?.details || 
                           'An unexpected error occurred while saving the recipe.';
      setErrorModal({
        isOpen: true,
        title: 'Error Saving Recipe',
        message: errorMessage,
        type: 'error'
      });
    } finally {
      setSaving(false);
    }
  };

  // --- Render ---

  if (loading) return <div className="p-10 text-center">Loading builder...</div>;

  const totalDays = steps.reduce((acc, curr) => acc + (curr.duration_unit === 'Days' ? curr.duration : 0), 0);

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      
      {/* 1. Header (Metadata) */}
      <div className="bg-white shadow-md z-30 px-6 py-3 border-b border-gray-200">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          {/* Inputs Area */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Recipe Name</label>
              <input 
                type="text" 
                className="w-full rounded-md border border-[#e5e7eb] shadow-sm focus:border-green-400 focus:ring-green-400 focus:ring-1 sm:text-sm font-bold text-gray-900 px-3 py-2 outline-none"
                placeholder="e.g., Spicy Salad Mix"
                value={metadata.recipe_name}
                onChange={e => setMetadata({...metadata, recipe_name: e.target.value})}
                style={{ borderColor: '#e5e7eb' }}
                onFocus={(e) => e.target.style.borderColor = '#4ade80'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              />
            </div>
            
            <div className="md:col-span-1">
               <label className="block text-xs font-medium text-gray-500 mb-1.5">Variety</label>
               <select 
                  className="w-full rounded-md border border-[#e5e7eb] shadow-sm focus:border-green-400 focus:ring-green-400 focus:ring-1 sm:text-sm px-3 py-2 outline-none"
                  value={metadata.variety_id}
                  onChange={e => setMetadata({...metadata, variety_id: e.target.value})}
                  style={{ borderColor: '#e5e7eb' }}
                  onFocus={(e) => e.target.style.borderColor = '#4ade80'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
               >
                 <option value="">Select Variety...</option>
                 {varieties.map(v => (
                   <option key={v.variety_id} value={v.variety_id}>{v.variety_name}</option>
                 ))}
               </select>
            </div>

            <div className="md:col-span-1">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Seed Qty (Tray)</label>
              <div className="flex">
                <input 
                  type="number" 
                  className="w-2/3 rounded-l-md border border-[#e5e7eb] shadow-sm focus:border-green-400 focus:ring-green-400 focus:ring-1 sm:text-sm px-3 py-2 outline-none"
                  value={metadata.seed_quantity}
                  onChange={e => setMetadata({...metadata, seed_quantity: parseFloat(e.target.value) || 0})}
                  style={{ borderColor: '#e5e7eb' }}
                  onFocus={(e) => e.target.style.borderColor = '#4ade80'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                />
                <select
                  className="w-1/3 rounded-r-md border-l-0 border border-[#e5e7eb] bg-gray-50 text-xs px-2 py-2 outline-none focus:border-green-400 focus:ring-green-400 focus:ring-1"
                  value={metadata.seed_quantity_unit}
                  onChange={e => setMetadata({...metadata, seed_quantity_unit: e.target.value as 'grams' | 'oz'})}
                  style={{ borderColor: '#e5e7eb' }}
                  onFocus={(e) => e.target.style.borderColor = '#4ade80'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                >
                  <option value="grams">g</option>
                  <option value="oz">oz</option>
                </select>
              </div>
            </div>
          </div>

          {/* Action Area */}
          <div className="flex items-center space-x-4 pl-4 border-l border-gray-100">
            <div className="text-right">
               <span className="block text-[10px] text-gray-400 uppercase tracking-wider">Est. Cycle</span>
               <span className="block text-xl font-black text-gray-800 leading-none">{totalDays} <span className="text-xs font-normal text-gray-500">Days</span></span>
            </div>
            <button 
              onClick={handleSaveRecipe}
              disabled={saving}
              className="bg-green-600 text-white px-5 py-2 rounded-lg hover:bg-green-700 transition-all shadow-lg shadow-green-400/20 font-medium flex items-center disabled:opacity-70 text-sm"
            >
              {saving ? 'Saving...' : 'Save Recipe'}
            </button>
          </div>
        </div>
      </div>

      {/* 2. The Stack (Middle) */}
      <RecipeStack 
        steps={steps}
        onEdit={setEditingStep}
        onDelete={handleDelete}
        onMove={handleMove}
        editingStepId={editingStep?.ui_id || null}
      />

      {/* 3. The Composer (Bottom Sticky) */}
      <StepComposer
        descriptions={descriptions}
        onCommit={handleCommitStep}
        editingStep={editingStep}
        onCancelEdit={() => setEditingStep(null)}
        existingSteps={steps}
        stepIndex={editingStep ? steps.findIndex(s => s.ui_id === editingStep.ui_id) : steps.length}
      />

      {/* Error/Success Modal */}
      <ErrorModal
        isOpen={errorModal.isOpen}
        onClose={() => setErrorModal({ ...errorModal, isOpen: false })}
        title={errorModal.title}
        message={errorModal.message}
        type={errorModal.type}
      />
    </div>
  );
};

export default RecipeBuilderPage;
