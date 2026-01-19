import React, { useState, useEffect } from 'react';
import type { RecipeStep, StepDescription } from '@/types/recipe';
import { v4 as uuidv4 } from 'uuid';

interface StepComposerProps {
  descriptions: StepDescription[];
  onCommit: (step: RecipeStep) => void;
  onCancelEdit: () => void;
  editingStep: RecipeStep | null;
  existingSteps?: RecipeStep[]; // Current steps in the recipe to check for color conflicts
  stepIndex: number; // Position in recipe for filtering valid step types
}

// Helper to check step type by name
const getStepType = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower.includes('soak')) return 'soak';
  if (lower.includes('seed')) return 'seed';
  if (lower.includes('blackout')) return 'blackout';
  if (lower.includes('harvest')) return 'harvest';
  if (lower.includes('light') || lower.includes('growing')) return 'light';
  if (lower.includes('weight')) return 'weight';
  if (lower.includes('germination')) return 'germination';
  return 'other';
};

// Get step color matching Daily Flow TaskCard colors
const getStepColorFromType = (descName: string): string => {
  const name = descName.toLowerCase();
  if (name.includes('seed')) return '#4f46e5';      // indigo (seed variant)
  if (name.includes('soak')) return '#7c3aed';      // purple (prep variant)
  if (name.includes('pre-sprout')) return '#7c3aed'; // purple (prep variant)
  if (name.includes('blackout')) return '#475569';  // slate (default variant)
  if (name.includes('germination')) return '#d97706'; // amber (warning variant)
  if (name.includes('growing') || name.includes('light')) return '#0891b2'; // cyan (water variant)
  if (name.includes('harvest')) return '#059669';   // emerald (harvest variant)
  return '#475569'; // default slate
};

const INITIAL_STATE: Partial<RecipeStep> = {
  duration: 1,
  duration_unit: 'Days',
  misting_frequency: 'none',
  requires_weight: false,
  water_type: undefined,
  water_method: undefined,
  water_frequency: undefined,
  medium_type: undefined,
  instructions: ''
  // Note: For seeding steps, misting_frequency can be 'none', 'mist', or 'water' (one-time action)
  // For blackout steps, misting_frequency is 'none', '1x daily', '2x daily', etc. (recurring)
  // For growing steps, water_method is 'top' or 'bottom', water_frequency is times per day
};

export const StepComposer: React.FC<StepComposerProps> = ({
  descriptions,
  onCommit,
  editingStep,
  onCancelEdit,
  existingSteps = [],
  stepIndex
}) => {
  const [formData, setFormData] = useState<Partial<RecipeStep>>(INITIAL_STATE);
  const [selectedDesc, setSelectedDesc] = useState<StepDescription | null>(null);

  // Get valid step options based on position and previous selections
  const getValidStepOptions = () => {
    const previousSteps = existingSteps.slice(0, stepIndex);
    const previousTypes = previousSteps
      .filter(s => s.description_name)
      .map(s => getStepType(s.description_name));

    const hasSeeded = previousTypes.includes('seed');
    const hasSoaked = previousTypes.includes('soak');
    const hasHarvested = previousTypes.includes('harvest');
    const hasGrown = previousTypes.includes('light'); // 'light' type includes Growing
    const isFirstStep = stepIndex === 0;

    return descriptions.filter(desc => {
      const name = desc.description_name.toLowerCase();
      const stepType = getStepType(name);

      // Always exclude these
      if (name.includes('nutrient application') ||
          name.includes('cleaning') ||
          name.includes('resting')) {
        return false;
      }

      // First step: only allow soak or seed
      if (isFirstStep) {
        return stepType === 'soak' || stepType === 'seed';
      }

      // Can't soak after seeding (seeds are already planted)
      if (hasSeeded && stepType === 'soak') {
        return false;
      }

      // Can't do these before seeding
      if (!hasSeeded) {
        if (stepType === 'blackout' ||
            stepType === 'harvest' ||
            stepType === 'light' ||
            stepType === 'weight' ||
            stepType === 'germination') {
          return false;
        }
      }

      // After soaking, must seed next (can't skip to other steps)
      if (hasSoaked && !hasSeeded) {
        return stepType === 'seed';
      }

      // Can't harvest if already harvested
      if (hasHarvested && stepType === 'harvest') {
        return false;
      }

      // Can't harvest before growing
      if (!hasGrown && stepType === 'harvest') {
        return false;
      }

      return true;
    });
  };

  // Load data when entering Edit Mode
  // This effect intentionally populates form fields when editingStep changes
  useEffect(() => {
    if (editingStep) {
      const desc = descriptions.find(d => d.description_id === editingStep.description_id);
      // Don't default water_type for any steps - let user choose
      const stepData = editingStep;
      setFormData(stepData);
      setSelectedDesc(desc || null);
    } else {
      setFormData(INITIAL_STATE);
      setSelectedDesc(null);
    }
  }, [editingStep, descriptions]);

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = parseInt(e.target.value);
    const desc = descriptions.find(d => d.description_id === id);
    setSelectedDesc(desc || null);
    
    const descName = desc?.description_name.toLowerCase() || '';
    const isWatering = descName.includes('water') || descName.includes('nutrient') || descName.includes('irrigat');
    const isGrowing = descName.includes('growing');
    const isGermination = descName.includes('germination');
    const canHaveWaterType = isWatering || descName.includes('seeding') || descName.includes('soaking') || isGrowing || isGermination;
    
    // When changing types, keep generic fields (duration/instructions) 
    // but reset conditional fields to prevent bad data
    setFormData(prev => ({
      ...prev,
      description_id: id,
      description_name: desc?.description_name,
      // Reset conditionals
      requires_weight: false,
      weight_lbs: undefined,
      // For seeding/soaking, default to 'water' (medium gets wet), but user can choose 'none'
      // For watering steps, default to 'water'
      // For growing and germination steps, default to 'none' (no water) - user can choose to add water
      water_type: canHaveWaterType ? (isWatering ? 'water' : undefined) : undefined,
      water_method: undefined,
      water_frequency: undefined,
      medium_type: undefined,
      misting_frequency: 'none'
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDesc) return;

    const descName = selectedDesc.description_name.toLowerCase();
    const isWatering = descName.includes('water') || descName.includes('nutrient') || descName.includes('irrigat');
    const isGrowing = descName.includes('growing');
    const isGermination = descName.includes('germination');
    const isBlackout = descName.includes('blackout');
    const canHaveWaterType = isWatering || descName.includes('seeding') || descName.includes('soaking') || isGrowing || isGermination;

    // Use Daily Flow consistent colors based on step type
    const stepColor = getStepColorFromType(selectedDesc.description_name);

    const newStep: RecipeStep = {
      // If editing, keep original IDs, otherwise gen new UI ID
      ui_id: editingStep ? editingStep.ui_id : uuidv4(),
      step_id: editingStep?.step_id, 
      
      sequence_order: editingStep ? editingStep.sequence_order : 0, // Parent handles order
      description_id: selectedDesc.description_id,
      description_name: selectedDesc.description_name,
      color: stepColor,
      
      // Defaults
      duration: formData.duration || 0,
      duration_unit: formData.duration_unit || 'Days',
      instructions: formData.instructions || '',
      
      // Conditionals (Explicitly pass strictly needed fields)
      requires_weight: formData.requires_weight,
      weight_lbs: formData.requires_weight ? formData.weight_lbs : undefined,
      misting_frequency: formData.misting_frequency,
      water_type: canHaveWaterType || isBlackout ? formData.water_type : undefined,
      // For blackout, growing, and germination: save water_method and water_frequency only when water_type is set
      water_method: (isBlackout && formData.water_type) || (isGrowing && formData.water_type) || (isGermination && formData.water_type) ? (formData.water_method || 'top') : undefined,
      water_frequency: (isBlackout && formData.water_type) || (isGrowing && formData.water_type) || (isGermination && formData.water_type) ? (formData.water_frequency || '1x daily') : undefined,
      medium_type: formData.medium_type,
      do_not_disturb_days: formData.do_not_disturb_days,
      misting_start_day: formData.misting_start_day,
    };

    console.log('Submitting step with data:', {
      description_name: newStep.description_name,
      isBlackout,
      water_type: newStep.water_type,
      water_method: newStep.water_method,
      water_frequency: newStep.water_frequency,
      formData_water_type: formData.water_type,
      formData_water_method: formData.water_method,
      formData_water_frequency: formData.water_frequency
    });

    onCommit(newStep);
    
    if (!editingStep) {
      // Reset form completely
      setFormData(INITIAL_STATE);
      setSelectedDesc(null);
    }
  };

  // Helper booleans for conditional rendering
  const descName = selectedDesc?.description_name.toLowerCase() || '';
  const isBlackout = descName.includes('blackout');
  const isWatering = descName.includes('water') || descName.includes('nutrient') || descName.includes('irrigat');
  const isSeeding = descName.includes('seeding');
  const isGrowing = descName.includes('growing');
  const isGermination = descName.includes('germination');
  // Steps that can have water type specified (Seeding, Soaking, Growing, Germination, etc.)
  const canHaveWaterType = isWatering || isSeeding || descName.includes('soaking') || isGrowing || isGermination;

  return (
    <div className="bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] p-3 sticky bottom-0 z-20">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
            {editingStep ? 'Editing Step' : 'Compose New Step'}
          </h3>
          {editingStep && (
            <button 
              onClick={onCancelEdit} 
              type="button"
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
          
          {/* 1. Step Type Selector */}
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Action Type</label>
            <select
              required
              className="block w-full rounded-md border border-[#e5e7eb] shadow-sm focus:border-green-400 focus:ring-green-400 focus:ring-1 sm:text-sm px-3 py-2 outline-none"
              value={formData.description_id || ''}
              onChange={handleDescriptionChange}
              style={{ borderColor: '#e5e7eb' }}
              onFocus={(e) => e.target.style.borderColor = '#4ade80'}
              onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
            >
              <option value="">Select Action...</option>
              {getValidStepOptions().map(d => (
                <option key={d.description_id} value={d.description_id}>
                  {d.description_name}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Duration */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Duration</label>
            <div className="flex rounded-md shadow-sm">
              <input
                type="number"
                min="0"
                step="0.5"
                required
                className="block w-1/2 rounded-l-md border border-[#e5e7eb] focus:border-green-400 focus:ring-green-400 focus:ring-1 sm:text-sm px-3 py-2 outline-none"
                value={formData.duration}
                onChange={e => setFormData({...formData, duration: parseFloat(e.target.value)})}
                style={{ borderColor: '#e5e7eb' }}
                onFocus={(e) => e.target.style.borderColor = '#4ade80'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              />
              <select
                className="block w-1/2 rounded-r-md border border-[#e5e7eb] bg-gray-50 focus:border-green-400 focus:ring-green-400 focus:ring-1 sm:text-sm px-2 py-2 outline-none"
                value={formData.duration_unit}
                onChange={e => setFormData({...formData, duration_unit: e.target.value as 'Days' | 'Hours'})}
                style={{ borderColor: '#e5e7eb' }}
                onFocus={(e) => e.target.style.borderColor = '#4ade80'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              >
                <option>Days</option>
                <option>Hours</option>
              </select>
            </div>
          </div>

          {/* 3. Conditional Fields (The "Smart" Area) */}
          <div className="md:col-span-5 flex flex-wrap gap-4 min-h-[60px] items-center bg-gray-50 rounded-md p-5 border border-gray-100">
            
            {/* BLACKOUT CONTROLS */}
            {isBlackout && (
              <>
                <div className="flex items-center">
                  <input
                    id="weight-blackout"
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    checked={formData.requires_weight || false}
                    onChange={e => setFormData({
                      ...formData, 
                      requires_weight: e.target.checked,
                      weight_lbs: e.target.checked && !formData.weight_lbs ? 5 : formData.weight_lbs
                    })}
                  />
                  <label htmlFor="weight-blackout" className="ml-2 block text-xs text-gray-900">
                    Weighted Dome?
                  </label>
                </div>
                
                {formData.requires_weight && (
                   <div className="flex items-center space-x-2">
                     <label className="text-xs font-medium text-gray-700">Lbs:</label>
                     <input 
                        type="number" 
                        min="5"
                        step="0.5"
                        className="w-16 rounded-md border-gray-300 shadow-sm sm:text-sm px-2 py-1.5"
                        placeholder="5.0"
                        value={formData.weight_lbs || 5}
                        onChange={e => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val >= 5) {
                            setFormData({...formData, weight_lbs: val});
                          } else if (e.target.value === '' || val < 5) {
                            setFormData({...formData, weight_lbs: 5});
                          }
                        }}
                     />
                   </div>
                )}
                
                {/* Water Options for Blackout */}
                <div className="w-full">
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Water Option</label>
                  <select 
                    className="block w-full rounded-md border border-[#e5e7eb] shadow-sm sm:text-sm px-3 py-2 focus:border-green-400 focus:ring-green-400 focus:ring-1 outline-none"
                    value={
                      formData.water_type === 'water' ? 'water' :
                      formData.water_type === 'nutrients' ? 'nutrients' :
                      formData.misting_frequency && formData.misting_frequency !== 'none' ? 'mist' :
                      'none'
                    }
                    onChange={e => {
                      const value = e.target.value;
                      if (value === 'none') {
                        setFormData({
                          ...formData, 
                          water_type: undefined,
                          water_method: undefined,
                          water_frequency: undefined,
                          misting_frequency: 'none'
                        });
                      } else if (value === 'mist') {
                        setFormData({
                          ...formData, 
                          water_type: undefined,
                          water_method: undefined,
                          water_frequency: undefined,
                          misting_frequency: '1x daily'
                        });
                      } else if (value === 'water') {
                        setFormData({
                          ...formData, 
                          water_type: 'water',
                          // Preserve existing water_method if set, otherwise default to 'top'
                          water_method: formData.water_method || 'top',
                          // Preserve existing water_frequency if set, otherwise default to '1x daily'
                          water_frequency: formData.water_frequency || '1x daily',
                          misting_frequency: 'none'
                        });
                      } else if (value === 'nutrients') {
                        setFormData({
                          ...formData, 
                          water_type: 'nutrients',
                          // Preserve existing water_method if set, otherwise default to 'top'
                          water_method: formData.water_method || 'top',
                          // Preserve existing water_frequency if set, otherwise default to '1x daily'
                          water_frequency: formData.water_frequency || '1x daily',
                          misting_frequency: 'none'
                        });
                      }
                    }}
                    style={{ borderColor: '#e5e7eb' }}
                    onFocus={(e) => e.target.style.borderColor = '#4ade80'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                  >
                    <option value="none">No Water</option>
                    <option value="water">Water</option>
                    <option value="mist">Mist</option>
                    <option value="nutrients">Nutrients</option>
                  </select>
                </div>

                {/* Water Method (Top/Bottom) - Show when Water or Nutrients is selected */}
                {(formData.water_type === 'water' || formData.water_type === 'nutrients') && (
                  <div className="w-full">
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Water Method</label>
                    <select 
                      className="block w-full rounded-md border border-[#e5e7eb] shadow-sm sm:text-sm px-3 py-2 focus:border-green-400 focus:ring-green-400 focus:ring-1 outline-none"
                      value={formData.water_method || 'top'}
                      onChange={e => setFormData({...formData, water_method: e.target.value as 'top' | 'bottom'})}
                      style={{ borderColor: '#e5e7eb' }}
                      onFocus={(e) => e.target.style.borderColor = '#4ade80'}
                      onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                    >
                      <option value="top">Top Water</option>
                      <option value="bottom">Bottom Water</option>
                    </select>
                  </div>
                )}

                {/* Frequency - Show when Water, Mist, or Nutrients is selected */}
                {((formData.water_type === 'water' || formData.water_type === 'nutrients') || 
                  (formData.misting_frequency && formData.misting_frequency !== 'none')) && (
                  <div className="w-full">
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Times Per Day</label>
                    <select 
                      className="block w-full rounded-md border border-[#e5e7eb] shadow-sm sm:text-sm px-3 py-2 focus:border-green-400 focus:ring-green-400 focus:ring-1 outline-none"
                      value={
                        formData.water_type === 'water' || formData.water_type === 'nutrients' 
                          ? (formData.water_frequency || '1x daily')
                          : (formData.misting_frequency || '1x daily')
                      }
                      onChange={e => {
                        const freq = e.target.value as '1x daily' | '2x daily' | '3x daily' | 'custom';
                        if (formData.water_type === 'water' || formData.water_type === 'nutrients') {
                          setFormData({...formData, water_frequency: freq});
                        } else {
                          setFormData({...formData, misting_frequency: freq});
                        }
                      }}
                      style={{ borderColor: '#e5e7eb' }}
                      onFocus={(e) => e.target.style.borderColor = '#4ade80'}
                      onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                    >
                      <option value="1x daily">1x Daily</option>
                      <option value="2x daily">2x Daily</option>
                      <option value="3x daily">3x Daily</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                )}
              </>
            )}

            {/* MEDIUM TYPE - Show for seeding steps only */}
            {isSeeding && (
              <div className="w-full">
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Growing Medium</label>
                <select 
                  className="block w-full rounded-md border border-[#e5e7eb] shadow-sm sm:text-sm px-3 py-2 focus:border-green-400 focus:ring-green-400 focus:ring-1 outline-none"
                  value={formData.medium_type || ''}
                  onChange={e => setFormData({...formData, medium_type: e.target.value as 'soil' | 'coco coir' | 'hemp mat' | 'paper towel' | 'other'})}
                  style={{ borderColor: '#e5e7eb' }}
                  onFocus={(e) => e.target.style.borderColor = '#4ade80'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                >
                  <option value="">Select medium...</option>
                  <option value="soil">Soil</option>
                  <option value="coco coir">Coco Coir</option>
                  <option value="hemp mat">Hemp Mat</option>
                  <option value="paper towel">Paper Towel</option>
                  <option value="other">Other</option>
                </select>
              </div>
            )}

            {/* WATER TYPE CONTROLS - Show for seeding steps only (soaking always uses plain water) */}
            {canHaveWaterType && !isGrowing && !isGermination && !descName.includes('soaking') && (
               <div className="w-full">
                 <label className="block text-xs font-medium text-gray-700 mb-1.5">
                   {isSeeding ? 'Water Medium' : 'Solution Type'}
                 </label>
                 <select 
                    className="block w-full rounded-md border border-[#e5e7eb] shadow-sm sm:text-sm px-3 py-2 focus:border-green-400 focus:ring-green-400 focus:ring-1 outline-none"
                    value={formData.water_type || (isSeeding ? 'none' : 'water')}
                    onChange={e => {
                      const value = e.target.value;
                      setFormData({...formData, water_type: value === 'none' ? undefined : value as 'water' | 'nutrients'});
                    }}
                    style={{ borderColor: '#e5e7eb' }}
                    onFocus={(e) => e.target.style.borderColor = '#4ade80'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                  >
                   {isSeeding && <option value="none">No Water</option>}
                   <option value="water">Plain Water</option>
                   <option value="nutrients">Nutrient Mix</option>
                 </select>
                 {isSeeding && (
                   <p className="text-[10px] text-gray-500 mt-1">Wet the growing medium. Use Misting below to wet seeds on top.</p>
                 )}
               </div>
            )}
            
            {/* GROWING STEP WATER CONTROLS - Water option with conditional method/frequency */}
            {isGrowing && (
              <>
                <div className="w-full">
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Water Option</label>
                  <select 
                    className="block w-full rounded-md border border-[#e5e7eb] shadow-sm sm:text-sm px-3 py-2 focus:border-green-400 focus:ring-green-400 focus:ring-1 outline-none"
                    value={
                      formData.water_type === 'water' ? 'water' :
                      formData.water_type === 'nutrients' ? 'nutrients' :
                      'none'
                    }
                    onChange={e => {
                      const value = e.target.value;
                      if (value === 'none') {
                        setFormData({
                          ...formData, 
                          water_type: undefined,
                          water_method: undefined,
                          water_frequency: undefined
                        });
                      } else if (value === 'water') {
                        setFormData({
                          ...formData, 
                          water_type: 'water',
                          water_method: formData.water_method || 'top',
                          water_frequency: formData.water_frequency || '1x daily'
                        });
                      } else if (value === 'nutrients') {
                        setFormData({
                          ...formData, 
                          water_type: 'nutrients',
                          water_method: formData.water_method || 'top',
                          water_frequency: formData.water_frequency || '1x daily'
                        });
                      }
                    }}
                    style={{ borderColor: '#e5e7eb' }}
                    onFocus={(e) => e.target.style.borderColor = '#4ade80'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                  >
                    <option value="none">No Water</option>
                    <option value="water">Water</option>
                    <option value="nutrients">Nutrients</option>
                  </select>
                </div>

                {/* Water Method (Top/Bottom) - Show when Water or Nutrients is selected */}
                {(formData.water_type === 'water' || formData.water_type === 'nutrients') && (
                  <div className="w-full">
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Water Method</label>
                    <select 
                      className="block w-full rounded-md border border-[#e5e7eb] shadow-sm sm:text-sm px-3 py-2 focus:border-green-400 focus:ring-green-400 focus:ring-1 outline-none"
                      value={formData.water_method || 'top'}
                      onChange={e => setFormData({...formData, water_method: e.target.value as 'top' | 'bottom'})}
                      style={{ borderColor: '#e5e7eb' }}
                      onFocus={(e) => e.target.style.borderColor = '#4ade80'}
                      onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                    >
                      <option value="top">Top Water</option>
                      <option value="bottom">Bottom Water</option>
                    </select>
                  </div>
                )}

                {/* Frequency - Show when Water or Nutrients is selected */}
                {(formData.water_type === 'water' || formData.water_type === 'nutrients') && (
                  <div className="w-full">
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Times Per Day</label>
                    <select 
                      className="block w-full rounded-md border border-[#e5e7eb] shadow-sm sm:text-sm px-3 py-2 focus:border-green-400 focus:ring-green-400 focus:ring-1 outline-none"
                      value={formData.water_frequency || '1x daily'}
                      onChange={e => setFormData({...formData, water_frequency: e.target.value as '1x daily' | '2x daily' | '3x daily' | 'custom'})}
                      style={{ borderColor: '#e5e7eb' }}
                      onFocus={(e) => e.target.style.borderColor = '#4ade80'}
                      onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                    >
                      <option value="1x daily">1x Daily</option>
                      <option value="2x daily">2x Daily</option>
                      <option value="3x daily">3x Daily</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                )}
              </>
            )}

            {/* GERMINATION CONTROLS */}
            {isGermination && (
              <>
                <div className="flex items-center">
                  <input
                    id="weight-germination"
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    checked={formData.requires_weight || false}
                    onChange={e => setFormData({
                      ...formData, 
                      requires_weight: e.target.checked,
                      weight_lbs: e.target.checked && !formData.weight_lbs ? 5 : formData.weight_lbs
                    })}
                  />
                  <label htmlFor="weight-germination" className="ml-2 block text-xs text-gray-900">
                    Weighted Dome?
                  </label>
                </div>
                
                {formData.requires_weight && (
                   <div className="flex items-center space-x-2">
                     <label className="text-xs font-medium text-gray-700">Lbs:</label>
                     <input 
                        type="number" 
                        min="5"
                        step="0.5"
                        className="w-16 rounded-md border-gray-300 shadow-sm sm:text-sm px-2 py-1.5"
                        placeholder="5.0"
                        value={formData.weight_lbs || 5}
                        onChange={e => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val >= 5) {
                            setFormData({...formData, weight_lbs: val});
                          } else if (e.target.value === '' || val < 5) {
                            setFormData({...formData, weight_lbs: 5});
                          }
                        }}
                     />
                   </div>
                )}

                {/* Water Options for Germination */}
                <div className="w-full">
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Water Option</label>
                  <select 
                    className="block w-full rounded-md border border-[#e5e7eb] shadow-sm sm:text-sm px-3 py-2 focus:border-green-400 focus:ring-green-400 focus:ring-1 outline-none"
                    value={
                      formData.water_type === 'water' ? 'water' :
                      formData.water_type === 'nutrients' ? 'nutrients' :
                      'none'
                    }
                    onChange={e => {
                      const value = e.target.value;
                      if (value === 'none') {
                        setFormData({
                          ...formData, 
                          water_type: undefined,
                          water_method: undefined,
                          water_frequency: undefined
                        });
                      } else if (value === 'water') {
                        setFormData({
                          ...formData, 
                          water_type: 'water',
                          water_method: formData.water_method || 'top',
                          water_frequency: formData.water_frequency || '1x daily'
                        });
                      } else if (value === 'nutrients') {
                        setFormData({
                          ...formData, 
                          water_type: 'nutrients',
                          water_method: formData.water_method || 'top',
                          water_frequency: formData.water_frequency || '1x daily'
                        });
                      }
                    }}
                    style={{ borderColor: '#e5e7eb' }}
                    onFocus={(e) => e.target.style.borderColor = '#4ade80'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                  >
                    <option value="none">No Water</option>
                    <option value="water">Water</option>
                    <option value="nutrients">Nutrients</option>
                  </select>
                </div>

                {/* Water Method (Top/Bottom) - Show when Water or Nutrients is selected */}
                {(formData.water_type === 'water' || formData.water_type === 'nutrients') && (
                  <div className="w-full">
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Water Method</label>
                    <select 
                      className="block w-full rounded-md border border-[#e5e7eb] shadow-sm sm:text-sm px-3 py-2 focus:border-green-400 focus:ring-green-400 focus:ring-1 outline-none"
                      value={formData.water_method || 'top'}
                      onChange={e => setFormData({...formData, water_method: e.target.value as 'top' | 'bottom'})}
                      style={{ borderColor: '#e5e7eb' }}
                      onFocus={(e) => e.target.style.borderColor = '#4ade80'}
                      onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                    >
                      <option value="top">Top Water</option>
                      <option value="bottom">Bottom Water</option>
                    </select>
                  </div>
                )}

                {/* Frequency - Show when Water or Nutrients is selected */}
                {(formData.water_type === 'water' || formData.water_type === 'nutrients') && (
                  <div className="w-full">
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Times Per Day</label>
                    <select 
                      className="block w-full rounded-md border border-[#e5e7eb] shadow-sm sm:text-sm px-3 py-2 focus:border-green-400 focus:ring-green-400 focus:ring-1 outline-none"
                      value={formData.water_frequency || '1x daily'}
                      onChange={e => setFormData({...formData, water_frequency: e.target.value as '1x daily' | '2x daily' | '3x daily' | 'custom'})}
                      style={{ borderColor: '#e5e7eb' }}
                      onFocus={(e) => e.target.style.borderColor = '#4ade80'}
                      onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                    >
                      <option value="1x daily">1x Daily</option>
                      <option value="2x daily">2x Daily</option>
                      <option value="3x daily">3x Daily</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                )}
              </>
            )}
            
            {/* SEED WETTING - Show for seeding steps (one-time action: mist or water seeds after sowing) */}
            {isSeeding && (
              <div className="w-full">
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Wet Seeds After Sowing</label>
                <select 
                  className="block w-full rounded-md border border-[#e5e7eb] shadow-sm sm:text-sm px-3 py-2 focus:border-green-400 focus:ring-green-400 focus:ring-1 outline-none"
                  value={formData.misting_frequency || 'none'}
                  onChange={e => {
                    const value = e.target.value;
                    // Store as misting_frequency but it's really a one-time action
                    setFormData({...formData, misting_frequency: value as 'none' | 'mist' | 'water'});
                  }}
                  style={{ borderColor: '#e5e7eb' }}
                  onFocus={(e) => e.target.style.borderColor = '#4ade80'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                >
                  <option value="none">No</option>
                  <option value="mist">Mist Seeds</option>
                  <option value="water">Water Seeds</option>
                </select>
                <p className="text-[10px] text-gray-500 mt-1">One-time action: wet seeds on top after sowing</p>
              </div>
            )}
            
            {/* Default Placeholder */}
            {!isBlackout && !canHaveWaterType && selectedDesc && (
              <span className="text-xs text-gray-400 italic">
                Standard configuration for {selectedDesc.description_name}.
              </span>
            )}
            {!selectedDesc && <span className="text-xs text-gray-300">Select an action type...</span>}
          </div>

          {/* 4. Submit Button */}
          <div className="md:col-span-2 flex items-end h-full pb-0.5">
            <button
              type="submit"
              disabled={!selectedDesc}
              className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white 
                ${editingStep ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-green-600 hover:bg-green-700'} 
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500
                disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200`}
            >
              {editingStep ? 'Update Step' : '+ Add Step'}
            </button>
          </div>
          
          {/* Optional: Instructions Text Area */}
          <div className="md:col-span-12">
             <input
               type="text"
               placeholder="Additional instructions (optional)..."
               className="block w-full border-b border-[#e5e7eb] focus:border-green-400 focus:ring-0 focus:outline-none sm:text-sm bg-transparent px-3 pb-2 pt-1"
               value={formData.instructions || ''}
               onChange={e => setFormData({...formData, instructions: e.target.value})}
               style={{ borderColor: '#e5e7eb' }}
               onFocus={(e) => e.target.style.borderColor = '#4ade80'}
               onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
             />
          </div>

        </form>
      </div>
    </div>
  );
};
