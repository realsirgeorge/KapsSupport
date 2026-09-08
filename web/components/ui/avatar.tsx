import { cn } from '@/lib/utils';

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-7 w-7 text-xs',
  md: 'h-8 w-8 text-sm',
  lg: 'h-10 w-10 text-base',
} as const;

/**
 * Deterministic tint per person, so the same user is the same colour
 * everywhere they appear (sidebar, activity feed, table rows) without
 * storing an avatar colour anywhere.
 */
const TINTS = [
  'bg-status-blue/20 text-status-blue',
  'bg-status-green/20 text-status-green',
  'bg-status-amber/20 text-status-amber',
  'bg-status-purple/20 text-status-purple',
  'bg-status-red/20 text-status-red',
];

function tintFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface AvatarProps {
  name: string;
  size?: keyof typeof SIZES;
  /** Solid primary fill — for the signed-in user in the app shell. */
  emphasis?: boolean;
  className?: string;
}

export function Avatar({ name, size = 'md', emphasis, className }: AvatarProps) {
  const label = name?.trim() || 'Unknown';
  return (
    <span
      title={label}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold',
        SIZES[size],
        emphasis ? 'bg-primary text-primary-foreground' : tintFor(label),
        className,
      )}
    >
      {initialsOf(label)}
    </span>
  );
}

/** Overlapping stack, e.g. members of a team in a compact cell. */
export function AvatarStack({ names, max = 4 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((n, i) => (
        <Avatar key={`${n}-${i}`} name={n} size="xs" className="-ml-1.5 ring-2 ring-card first:ml-0" />
      ))}
      {extra > 0 && (
        <span className="-ml-1.5 inline-flex h-6 items-center rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground ring-2 ring-card">
          +{extra}
        </span>
      )}
    </div>
  );
}
