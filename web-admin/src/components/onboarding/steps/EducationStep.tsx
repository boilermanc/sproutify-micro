import { ArrowRight } from 'lucide-react';
import './steps.css';

interface EducationStepProps {
  onNext: () => void;
}

const EducationStep = (_props: EducationStepProps) => {
  const flowSteps = [
    { icon: '🌱', label: 'Varieties', description: 'Types of microgreens' },
    { icon: '📋', label: 'Recipes', description: 'Growing instructions' },
    { icon: '📦', label: 'Batches', description: 'Seed purchases' },
    { icon: '🌿', label: 'Trays', description: 'Growing containers' },
    { icon: '✂️', label: 'Harvest', description: 'Track yields' },
  ];

  return (
    <div className="education-step">
      <div className="flow-diagram-compact">
        {flowSteps.map((step, index) => (
          <div key={index} className="flow-item-compact">
            <div className="flow-icon-compact">{step.icon}</div>
            <div className="flow-label-compact">{step.label}</div>
            <div className="flow-description-compact">{step.description}</div>
            {index < flowSteps.length - 1 && (
              <div className="flow-arrow-compact">
                <ArrowRight size={16} color="#5B7C99" />
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-sm text-muted-foreground mt-4 text-center">
        This wizard will guide you through setting up your first variety, recipe, and tray.
      </p>
    </div>
  );
};

export default EducationStep;


