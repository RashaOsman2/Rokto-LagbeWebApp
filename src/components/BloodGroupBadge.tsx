import React from 'react';
import { cn } from '@/lib/utils';
import { BloodGroup } from '@/types';

interface BloodGroupBadgeProps {
  bloodGroup: BloodGroup;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const BloodGroupBadge: React.FC<BloodGroupBadgeProps> = ({ 
  bloodGroup, 
  size = 'md',
  className 
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-lg',
  };

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-primary/10 text-primary font-bold border-2 border-primary/20',
        sizeClasses[size],
        className
      )}
    >
      {bloodGroup}
    </div>
  );
};
