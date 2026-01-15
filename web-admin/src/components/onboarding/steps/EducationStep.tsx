import { ArrowRight } from 'lucide-react';
import './steps.css';

interface EducationStepProps {
  onNext: () => void;
}

const EducationStep = ({ onNext }: EducationStepProps) => {
  const flowSteps = [
    { icon: '🌱', label: 'Varieties', description: 'Types of microgreens' },
    { icon: '📋', label: 'Recipes', description: 'Growing instructions' },
    { icon: '📦', label: 'Batches', description: 'Seed purchases' },
    { icon: '🌿', label: 'Trays', description: 'Active growing containers' },
    { icon: '✂️', label: 'Harvest', description: 'Track your yields' },
  ];

  const infoCards = [
    { icon: '🌱', title: 'Varieties', desc: 'Types of microgreens you grow (e.g., Broccoli, Pea Shoots, Sunflower)' },
    { icon: '📋', title: 'Recipes', desc: 'Growing instructions for each variety, including steps and timing' },
    { icon: '📦', title: 'Batches', desc: 'Track your seed purchases to manage inventory' },
    { icon: '🌿', title: 'Trays', desc: 'Physical containers you\'re growing - the core tracking unit' },
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
                <ArrowRight size={18} color="#5B7C99" />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="education-content-compact">
        {infoCards.map((card, index) => (
          <div key={index} className="info-card-compact">
            <h3>{card.icon} {card.title}</h3>
            <p>{card.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EducationStep;


