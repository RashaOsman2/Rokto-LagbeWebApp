import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface BloodDropIconProps extends React.SVGAttributes<SVGSVGElement> {
  className?: string;
  animate?: boolean;
}

export const BloodDropIcon = forwardRef<SVGSVGElement, BloodDropIconProps>(
  ({ className, animate = false, ...props }, ref) => {
    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={cn(
          "w-8 h-8",
          animate && "animate-blood-pulse",
          className
        )}
        {...props}
      >
        <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
      </svg>
    );
  }
);

BloodDropIcon.displayName = 'BloodDropIcon';
