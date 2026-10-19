import { Sprout } from 'lucide-react';

export default function FarmBrand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-foreground" aria-label="Sproutify Micro">
      <Sprout className="h-6 w-6 shrink-0" strokeWidth={1.7} aria-hidden="true" />
      {!compact && <span className="text-lg font-semibold">Sproutify <span className="font-normal">Micro</span></span>}
    </span>
  );
}
