import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { MapPin, Loader2, Info } from 'lucide-react';
import { useGeolocation } from '@/hooks/useGeolocation';
import { toast } from 'sonner';

interface LocationToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean, location?: { lat: number; lng: number }) => Promise<void>;
  className?: string;
  /** Shows this is for an accepted request with live sharing */
  isForAcceptedRequest?: boolean;
  /** Disable toggle with message */
  disabled?: boolean;
  disabledMessage?: string;
}

export const LocationToggle: React.FC<LocationToggleProps> = ({
  enabled,
  onToggle,
  className = '',
  isForAcceptedRequest = false,
  disabled = false,
  disabledMessage,
}) => {
  const [loading, setLoading] = useState(false);
  const { getCurrentPosition, accuracy } = useGeolocation();

  const handleToggle = async (checked: boolean) => {
    if (disabled) {
      if (disabledMessage) {
        toast.info(disabledMessage);
      }
      return;
    }

    setLoading(true);
    try {
      if (checked) {
        // Turning ON - get high accuracy location (mandatory)
        toast.info('Getting your precise location...');
        const location = await getCurrentPosition();
        await onToggle(true, location);
        toast.success(
          isForAcceptedRequest 
            ? 'Live location shared! The requester can now track your arrival.'
            : 'Location sharing enabled!'
        );
      } else {
        // Turning OFF - just disable without needing location
        await onToggle(false, undefined);
        toast.success('Location sharing disabled. Your location is now hidden.');
      }
    } catch (error: any) {
      if (checked) {
        toast.error(error.message || 'Failed to get location. Please enable GPS and try again.');
      } else {
        toast.error('Failed to update location settings');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className={`flex items-center justify-between p-4 rounded-lg ${
        disabled ? 'bg-muted/30' : 'bg-secondary/50'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${
            enabled ? 'bg-success/10' : disabled ? 'bg-muted' : 'bg-primary/10'
          }`}>
            <MapPin className={`w-4 h-4 ${
              enabled ? 'text-success' : disabled ? 'text-muted-foreground' : 'text-primary'
            }`} />
          </div>
          <div>
            <Label className={`text-base font-medium ${disabled ? 'text-muted-foreground' : ''}`}>
              {isForAcceptedRequest ? 'Share Live Location' : 'Live Location Sharing'}
            </Label>
            <p className="text-sm text-muted-foreground">
              {disabled 
                ? disabledMessage || 'Location sharing is currently disabled'
                : enabled 
                ? isForAcceptedRequest 
                  ? 'Requester can track your arrival'
                  : 'Your live location is being shared' 
                : isForAcceptedRequest
                  ? 'Let the requester track your arrival'
                  : 'Share your location with requesters'
              }
            </p>
          </div>
        </div>
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : (
          <Switch
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={loading || disabled}
          />
        )}
      </div>
      
      {/* High accuracy info */}
      {enabled && !disabled && (
        <div className="flex items-start gap-2 px-4 py-2 text-xs text-muted-foreground bg-secondary/30 rounded-lg">
          <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Using high-accuracy GPS. Location auto-expires in 24 hours or when request ends.
            {accuracy && ` (Accuracy: ±${Math.round(accuracy)}m)`}
          </span>
        </div>
      )}
    </div>
  );
};
