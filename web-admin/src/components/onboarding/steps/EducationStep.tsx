import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

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
    <div className="space-y-6">
      <div className="flex items-center gap-4 overflow-x-auto pb-4">
        {flowSteps.map((step, index) => (
          <div key={index} className="flex items-center gap-2 min-w-[140px]">
            <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-muted/50">
              <div className="text-3xl">{step.icon}</div>
              <div className="text-sm font-semibold text-center">{step.label}</div>
              <div className="text-xs text-muted-foreground text-center">{step.description}</div>
            </div>
            {index < flowSteps.length - 1 && (
              <ArrowRight className="h-6 w-6 text-muted-foreground flex-shrink-0" />
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <span className="text-2xl">🌱</span>
              Varieties
            </h3>
            <p className="text-sm text-muted-foreground">
              Types of microgreens you grow (e.g., Broccoli, Pea Shoots, Sunflower)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <span className="text-2xl">📋</span>
              Recipes
            </h3>
            <p className="text-sm text-muted-foreground">
              Growing instructions for each variety, including steps and timing
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <span className="text-2xl">📦</span>
              Batches
            </h3>
            <p className="text-sm text-muted-foreground">
              Track your seed purchases to manage inventory
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <span className="text-2xl">🧺</span>
              Trays
            </h3>
            <p className="text-sm text-muted-foreground">
              Physical containers you're growing - the core tracking unit
            </p>
          </CardContent>
        </Card>
      </div>

      <Button onClick={onNext} className="w-full mt-6">
        Got it! Let's Start
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
};

export default EducationStep;
