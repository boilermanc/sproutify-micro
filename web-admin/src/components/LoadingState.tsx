interface LoadingStateProps {
  compact?: boolean;
  message?: string;
}

export default function LoadingState({ compact = false, message = 'Loading your farm…' }: LoadingStateProps) {
  return (
    <div role="status" aria-live="polite" className={`flex items-center justify-center bg-background px-6 text-sm text-muted-foreground ${compact ? 'min-h-[40vh]' : 'min-h-screen'}`}>
      <p>{message}</p>
    </div>
  );
}
