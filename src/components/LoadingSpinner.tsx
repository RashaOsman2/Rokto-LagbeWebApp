import React from 'react';
import { BloodDropIcon } from './BloodDropIcon';

interface LoadingSpinnerProps {
  message?: string;
  fullScreen?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  message = "Loading...",
  fullScreen = true 
}) => {
  const content = (
    <div className="flex flex-col items-center justify-center gap-6">
      {/* Animated blood drop with pulse ring */}
      <div className="relative">
        {/* Pulse rings */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 animate-pulse-ring" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center" style={{ animationDelay: '0.5s' }}>
          <div className="w-16 h-16 rounded-full bg-primary/20 animate-pulse-ring" style={{ animationDelay: '0.5s' }} />
        </div>
        
        {/* Main icon */}
        <div className="relative z-10 flex items-center justify-center w-20 h-20">
          <BloodDropIcon className="text-primary w-12 h-12 animate-blood-drop" />
        </div>
      </div>
      
      {/* Loading text with dots animation */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-muted-foreground font-medium">{message}</p>
        <div className="flex gap-1.5">
          <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        {content}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12">
      {content}
    </div>
  );
};
