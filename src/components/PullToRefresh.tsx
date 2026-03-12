import React from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  threshold?: number;
}

export const PullToRefreshIndicator: React.FC<PullToRefreshIndicatorProps> = ({
  pullDistance,
  isRefreshing,
  threshold = 80,
}) => {
  const progress = Math.min(pullDistance / threshold, 1);
  const shouldShow = pullDistance > 10 || isRefreshing;
  
  if (!shouldShow) return null;

  return (
    <div 
      className="flex items-center justify-center overflow-hidden transition-all duration-200"
      style={{ 
        height: isRefreshing ? 60 : pullDistance,
        opacity: Math.min(progress * 1.5, 1),
      }}
    >
      <div 
        className={cn(
          "flex flex-col items-center justify-center gap-1 text-muted-foreground",
          isRefreshing && "text-primary"
        )}
      >
        <div
          className={cn(
            "transition-transform duration-200",
            isRefreshing && "animate-spin"
          )}
          style={{ 
            transform: isRefreshing 
              ? 'rotate(0deg)' 
              : `rotate(${progress * 180}deg)`,
          }}
        >
          <RefreshCw className="w-5 h-5" />
        </div>
        <span className="text-xs font-medium">
          {isRefreshing 
            ? 'Refreshing...' 
            : progress >= 1 
              ? 'Release to refresh' 
              : 'Pull to refresh'
          }
        </span>
      </div>
    </div>
  );
};
