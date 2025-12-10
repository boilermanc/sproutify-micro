import React from 'react';
import type { RecipeStep } from '@/types/recipe';
import { Trash2, Edit, ChevronUp, ChevronDown } from 'lucide-react';

interface RecipeStackProps {
  steps: RecipeStep[];
  onEdit: (step: RecipeStep) => void;
  onDelete: (ui_id: string) => void;
  onMove: (ui_id: string, direction: 'up' | 'down') => void;
  editingStepId: string | null;
}

export const RecipeStack: React.FC<RecipeStackProps> = ({ 
  steps, 
  onEdit, 
  onDelete, 
  onMove,
  editingStepId 
}) => {
  
  // Calculate timeline positions
  const calculateTimeline = () => {
    let runningDayCount = 1;
    return steps.map(step => {
      const startDay = runningDayCount;
      let endDay = startDay;
      
      if (step.duration_unit === 'Days') {
        endDay = startDay + step.duration;
        runningDayCount += step.duration;
      }
      
      return { startDay, endDay };
    });
  };

  const timeline = calculateTimeline();

  if (steps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-4 text-gray-400 border-2 border-dashed border-gray-300 rounded-lg m-4 bg-gray-50/50 h-[300px]">
        <div className="text-center">
          <p className="text-sm font-medium text-gray-600">Recipe Flow is Empty</p>
          <p className="text-xs mt-1">Use the composer at the bottom to add your first step.</p>
          <p className="text-[10px] mt-2 text-gray-400">Tip: Start with Seeding or Soaking.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto overflow-y-hidden p-4 bg-gray-50 h-[300px]">
      <div className="flex gap-3 h-full min-w-max">
        {steps.map((step, index) => {
          // Get timeline from pre-calculated array
          const { startDay, endDay } = timeline[index] || { startDay: 1, endDay: 1 };
          
          // Debug: Log ALL step data to see what we're working with
          console.log('Step data:', {
            description_name: step.description_name,
            description_id: step.description_id,
            water_type: step.water_type,
            water_method: step.water_method,
            water_frequency: step.water_frequency,
            misting_frequency: step.misting_frequency,
            isBlackout: (step.description_name || '').toLowerCase().includes('blackout')
          });
          
          const isGhost = editingStepId === step.ui_id;

          return (
            <div 
              key={step.ui_id} 
              className={`relative flex flex-col bg-white rounded-lg border transition-all duration-200 group flex-shrink-0 w-56
                ${isGhost 
                  ? 'opacity-40 border-dashed border-indigo-300 shadow-none' 
                  : 'border-gray-200 shadow-sm hover:shadow-md hover:border-green-300'
                }
              `}
            >
              
              {/* Color Stripe - Top */}
              <div 
                className="w-full h-2 rounded-t-lg" 
                style={{ backgroundColor: step.color || '#9ca3af' }}
              />

              {/* Card Content */}
              <div className="flex-1 p-3 flex flex-col">
                {/* Header with Step Number */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <div 
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm"
                      style={{ backgroundColor: step.color || '#9ca3af' }}
                    >
                      {index + 1}
                    </div>
                    <h4 className="text-sm font-bold text-gray-900 leading-tight">
                      {step.description_name?.toLowerCase().includes('growing') 
                        ? 'Growing (under light)' 
                        : step.description_name}
                    </h4>
                  </div>
                  
                  {/* Timeline - Compact */}
                  <div className="text-right">
                    <span className="block text-[8px] text-gray-400 uppercase tracking-wide">Day</span>
                    <span className="block text-xs font-bold text-gray-600">
                      {startDay.toFixed(0)}
                      {step.duration_unit === 'Days' && step.duration > 0 && (
                        <span className="text-gray-400 text-[10px] font-normal">-{endDay.toFixed(0)}</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Duration Badge */}
                <div className="mb-2">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-800 border border-gray-200">
                    {step.duration} {step.duration_unit}
                  </span>
                </div>
                
                {/* Action Details - More descriptive with separate rows */}
                <div className="space-y-1 mb-1.5">
                  {/* Weight */}
                  {step.requires_weight && step.weight_lbs && (
                    <div className="text-[10px] text-gray-700">
                      <span className="font-medium">⚖️ Weight:</span> {step.weight_lbs}lbs
                    </div>
                  )}
                  
                  {/* Medium Type */}
                  {step.medium_type && (
                    <div className="text-[10px] text-gray-700">
                      <span className="font-medium">🌱 Medium:</span> {step.medium_type}
                    </div>
                  )}
                  
                  {/* Water Medium - For seeding/soaking (not growing) */}
                  {step.water_type && !step.water_method && (
                    <div className="text-[10px] text-gray-700">
                      <span className="font-medium">{step.water_type === 'nutrients' ? '🧪' : '💧'} Soak Medium:</span> {step.water_type === 'nutrients' ? 'Nutrient Mix' : 'Plain Water'}
                    </div>
                  )}
                  
                  {/* Water Details - For growing steps and blackout with water */}
                  {step.water_type && (
                    <div className="text-[10px] text-gray-700">
                      <span className="font-medium">{step.water_type === 'nutrients' ? '🧪' : '💧'} Water:</span> {
                        (step.water_method || 'top') === 'top' ? 'Top' : 'Bottom'
                      } {step.water_frequency || '1x daily'}
                    </div>
                  )}
                  
                  {/* No water for steps that could have it */}
                  {!step.water_type && (() => {
                    const descName = (step.description_name || '').toLowerCase().trim();
                    // Check if it's a blackout step by name OR by having blackout-specific fields
                    const isBlackout = descName.includes('blackout') || step.requires_weight !== undefined;
                    const isWateringStep = descName.includes('water') || descName.includes('nutrient') || descName.includes('irrigat');
                    const canHaveWater = descName.includes('seeding') || descName.includes('soaking') || descName.includes('growing') || descName.includes('germination');
                    
                    // For blackout steps: ALWAYS show strikethrough "No Water" if no water_type and no misting
                    // This prevents "Medium: No Water" from showing for blackout steps
                    if (isBlackout) {
                      if (!step.misting_frequency || step.misting_frequency === 'none') {
                        return (
                          <div className="text-[10px] text-gray-700">
                            <span className="font-medium line-through">💧 Water:</span> <span className="line-through">No Water</span>
                          </div>
                        );
                      }
                      // If blackout has misting, don't show "No Water" - misting will be shown separately
                      return null;
                    }
                    
                    // Only show "no water" for other steps (seeding/soaking/growing) that could have water but don't
                    // NEVER show this for blackout steps
                    return !isBlackout && !isWateringStep && canHaveWater ? (
                      <div className="text-[10px] text-gray-600">
                        <span className="font-medium">🚫 Medium:</span> No Water
                      </div>
                    ) : null;
                  })()}

                  {/* Wet Seeds After Sowing (one-time action) */}
                  {step.misting_frequency && step.misting_frequency !== 'none' && (() => {
                    const descName = step.description_name?.toLowerCase() || '';
                    const isSeedingStep = descName.includes('seeding');
                    if (isSeedingStep) {
                      // For seeding, this is a one-time action
                      if (step.misting_frequency === 'mist') {
                        return (
                          <div className="text-[10px] text-gray-700">
                            <span className="font-medium">🌧 After Sowing:</span> Mist Seeds
                          </div>
                        );
                      } else if (step.misting_frequency === 'water') {
                        return (
                          <div className="text-[10px] text-gray-700">
                            <span className="font-medium">💧 After Sowing:</span> Water Seeds
                          </div>
                        );
                      }
                    } else {
                      // For other steps (like blackout), show as recurring misting
                      return (
                        <div className="text-[10px] text-gray-700">
                          <span className="font-medium">🌧 Mist:</span> {step.misting_frequency}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                {/* Instructions - Compact */}
                {step.instructions && (
                  <p className="text-[10px] text-gray-500 mt-auto italic line-clamp-2 pt-1.5 border-t border-gray-100">
                    {step.instructions}
                  </p>
                )}

                {/* Action Buttons (Hover Only) */}
                {!isGhost && (
                  <div className="absolute right-2 top-2 flex flex-col space-y-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm rounded-lg p-1 shadow-lg">
                     <button 
                        onClick={() => onEdit(step)} 
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded border border-gray-200 hover:border-indigo-200 transition-colors"
                        title="Edit Step"
                     >
                       <Edit className="w-3.5 h-3.5" />
                     </button>
                     <button 
                        onClick={() => onDelete(step.ui_id)} 
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded border border-gray-200 hover:border-red-200 transition-colors"
                        title="Delete Step"
                     >
                       <Trash2 className="w-3.5 h-3.5" />
                     </button>
                     <div className="flex space-x-0.5 justify-center pt-1 border-t border-gray-200">
                        <button onClick={() => onMove(step.ui_id, 'up')} disabled={index === 0} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 disabled:opacity-20">
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button onClick={() => onMove(step.ui_id, 'down')} disabled={index === steps.length - 1} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 disabled:opacity-20">
                          <ChevronDown className="w-3 h-3" />
                        </button>
                     </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
