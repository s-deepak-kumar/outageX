'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { IncidentStatus } from '@/store/firefighter';

interface StatusBadgeProps {
  status: IncidentStatus;
  className?: string;
}

const statusConfig: Record<
  IncidentStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }
> = {
  idle: {
    label: 'Idle',
    variant: 'outline',
  },
  detecting: {
    label: 'Detecting',
    variant: 'default',
    className: 'animate-pulse',
  },
  analyzing: {
    label: 'Analyzing',
    variant: 'secondary',
    className: 'animate-pulse',
  },
  researching: {
    label: 'Researching',
    variant: 'secondary',
    className: 'animate-pulse',
  },
  diagnosing: {
    label: 'Diagnosing',
    variant: 'secondary',
    className: 'animate-pulse',
  },
  proposing: {
    label: 'Solution Ready',
    variant: 'default',
  },
  executing: {
    label: 'Executing',
    variant: 'default',
    className: 'animate-pulse',
  },
  resolved: {
    label: 'Resolved',
    variant: 'outline',
    className: 'border-green-600 text-green-600 dark:border-green-400 dark:text-green-400',
  },
  failed: {
    label: 'Failed',
    variant: 'destructive',
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge
      variant={config.variant}
      className={cn(
        'font-medium px-3 py-1 text-xs uppercase tracking-wide',
        config.className,
        className
      )}
    >
      {config.label}
    </Badge>
  );
}
