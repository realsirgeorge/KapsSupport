import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        blue: 'border-transparent bg-status-blue/15 text-status-blue',
        amber: 'border-transparent bg-status-amber/15 text-status-amber',
        red: 'border-transparent bg-status-red/15 text-status-red',
        gray: 'border-transparent bg-status-gray/15 text-status-gray',
        green: 'border-transparent bg-status-green/15 text-status-green',
        purple: 'border-transparent bg-status-purple/15 text-status-purple',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
