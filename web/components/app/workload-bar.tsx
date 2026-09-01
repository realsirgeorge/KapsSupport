interface WorkloadBarProps {
  label: string;
  value: number;
  max: number;
}

export function WorkloadBar({ label, value, max }: WorkloadBarProps) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-4">
      <span className="w-28 shrink-0 truncate text-sm text-foreground">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}
