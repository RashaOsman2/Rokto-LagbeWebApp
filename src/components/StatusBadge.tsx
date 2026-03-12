import React from 'react';
import { cn } from '@/lib/utils';
import { DonorStatus } from '@/types';

interface StatusBadgeProps {
  status: DonorStatus;
  className?: string;
}

const statusConfig: Record<DonorStatus, { label: string; className: string }> = {
  available: {
    label: 'Available',
    className: 'bg-success/10 text-success border-success/20',
  },
  unavailable: {
    label: 'Unavailable',
    className: 'bg-muted text-muted-foreground border-border',
  },
  cooldown: {
    label: 'On Cooldown',
    className: 'bg-warning/10 text-warning border-warning/20',
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className }) => {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        config.className,
        className
      )}
    >
      <span className={cn(
        'w-1.5 h-1.5 rounded-full mr-1.5',
        status === 'available' && 'bg-success',
        status === 'unavailable' && 'bg-muted-foreground',
        status === 'cooldown' && 'bg-warning'
      )} />
      {config.label}
    </span>
  );
};
