import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-inset text-ink-secondary',
        accent: 'border-transparent bg-accent-soft text-ink',
        outline: 'border-hairline text-ink-secondary',
        good: 'border-transparent bg-good/15 text-good',
        warning: 'border-transparent bg-warning/20 text-ink',
        serious: 'border-transparent bg-serious/20 text-ink',
        critical: 'border-transparent bg-critical/15 text-critical',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
