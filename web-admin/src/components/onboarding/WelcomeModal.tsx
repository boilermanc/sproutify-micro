import { useEffect, useState } from 'react';
import { useOnboarding } from '../../hooks/useOnboarding';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface WelcomeModalProps {
  farmName: string;
  onStart: () => void;
  onSkip: () => void;
}

const WelcomeModal = ({ farmName, onStart, onSkip }: WelcomeModalProps) => {
  const [isOpen, setIsOpen] = useState(true);

  const handleStart = () => {
    setIsOpen(false);
    onStart();
  };

  const handleSkip = () => {
    setIsOpen(false);
    onSkip();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="text-4xl">🌱</div>
            <DialogTitle className="text-2xl">Welcome to {farmName}!</DialogTitle>
          </div>
          <DialogDescription className="text-base">
            You're starting a <strong>7-day free trial</strong> of Sproutify Micro. 
            Let's get your farm set up in just a few minutes so you can start tracking 
            your microgreen operations right away.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleSkip} className="w-full sm:w-auto">
            I'll Explore on My Own
          </Button>
          <Button onClick={handleStart} className="w-full sm:w-auto">
            Let's Get Started
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WelcomeModal;
