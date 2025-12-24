import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => {
    return (
      <label className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer",
        checked ? "bg-emerald-500" : "bg-gray-300",
        className
      )}>
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          ref={ref}
          {...props}
        />
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-md",
            checked ? "translate-x-6" : "translate-x-1"
          )}
        />
      </label>
    );
  }
);
Switch.displayName = 'Switch';

export { Switch };

























