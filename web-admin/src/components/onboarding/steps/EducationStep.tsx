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
    { icon: '🧺', label: 'Trays', description: 'Active growing containers' },
    { icon: '✂️', label: 'Harvest', description: 'Track your yields' },
  ];

  return (
    <div className="education-step">
      <div className="flow-diagram">
        {flowSteps.map((step, index) => (
          <div key={index} className="flow-item" style={{ animationDelay: `${index * 0.1}s` }}>
            <div className="flow-icon">{step.icon}</div>
            <div className="flow-label">{step.label}</div>
            <div className="flow-description">{step.description}</div>
            {index < flowSteps.length - 1 && (
              <div className="flow-arrow">
                <ArrowRight size={24} color="#5B7C99" />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="education-content">
        <div className="info-card">
          <h3>🌱 Varieties</h3>
          <p>Types of microgreens you grow (e.g., Broccoli, Pea Shoots, Sunflower)</p>
        </div>
        <div className="info-card">
          <h3>📋 Recipes</h3>
          <p>Growing instructions for each variety, including steps and timing</p>
        </div>
        <div className="info-card">
          <h3>📦 Batches</h3>
          <p>Track your seed purchases to manage inventory</p>
        </div>
        <div className="info-card">
          <h3>🧺 Trays</h3>
          <p>Physical containers you're growing - the core tracking unit</p>
        </div>
      </div>

      <button className="btn-modern btn-primary-modern" onClick={onNext} style={{ width: '100%', marginTop: '2rem' }}>
        Got it! Let's Start →
      </button>
    </div>
  );
};

export default EducationStep;


