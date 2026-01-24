import * as React from 'react';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const addToast = React.useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast = { ...toast, id };
    setToasts((prev) => [...prev, newToast]);

    // Auto remove after duration
    const duration = toast.duration || 3000;
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastViewport toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

function ToastViewport({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: string) => void }) {
  return (
    <div className="fixed top-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:top-auto sm:right-0 sm:bottom-0 sm:flex-col md:max-w-[420px]">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const Icon = toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? AlertCircle : null;

  return (
    <div
      className={cn(
        'group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all',
        'data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none',
        'animate-in slide-in-from-top-full sm:slide-in-from-bottom-full',
        toast.type === 'success' && 'border-green-200 bg-green-50',
        toast.type === 'error' && 'border-red-200 bg-red-50',
        !toast.type && 'bg-background',
        'mb-2'
      )}
    >
      <div className="flex items-start gap-3 flex-1">
        {Icon && (
          <Icon
            className={cn(
              'h-5 w-5 mt-0.5',
              toast.type === 'success' && 'text-green-600',
              toast.type === 'error' && 'text-red-600'
            )}
          />
        )}
        <div className="flex flex-col gap-1 flex-1">
          {toast.title && (
            <div
              className={cn(
                'text-sm font-semibold',
                toast.type === 'success' && 'text-green-900',
                toast.type === 'error' && 'text-red-900',
                !toast.type && 'text-foreground'
              )}
            >
              {toast.title}
            </div>
          )}
          {toast.description && (
            <div
              className={cn(
                'text-sm',
                toast.type === 'success' && 'text-green-700',
                toast.type === 'error' && 'text-red-700',
                !toast.type && 'text-muted-foreground'
              )}
            >
              {toast.description}
            </div>
          )}
        </div>
      </div>
      <button
        onClick={onClose}
        className={cn(
          'absolute right-2 top-2 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2',
          toast.type === 'success' && 'text-green-600 focus:ring-green-400',
          toast.type === 'error' && 'text-red-600 focus:ring-red-400',
          !toast.type && 'text-foreground'
        )}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
