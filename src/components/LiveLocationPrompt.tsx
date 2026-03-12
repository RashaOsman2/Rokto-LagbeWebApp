import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MapPin, Loader2 } from 'lucide-react';
import { useGeolocation } from '@/hooks/useGeolocation';
import { toast } from 'sonner';

interface LiveLocationPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnableLiveLocation: (location: { lat: number; lng: number }) => Promise<void>;
  onSkip: () => void;
  requesterName?: string;
}

export const LiveLocationPrompt: React.FC<LiveLocationPromptProps> = ({
  open,
  onOpenChange,
  onEnableLiveLocation,
  onSkip,
  requesterName,
}) => {
  const [loading, setLoading] = useState(false);
  const { getCurrentPosition } = useGeolocation();

  const handleEnableLocation = async () => {
    setLoading(true);
    try {
      const location = await getCurrentPosition();
      await onEnableLiveLocation(location);
      toast.success('Live location shared! The requester can now track your arrival.');
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to get location. You can enable it later from the request.');
      // Don't close dialog on error, let user retry or skip
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    onSkip();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="mx-auto mb-2 p-3 rounded-full bg-success/10">
            <MapPin className="w-6 h-6 text-success" />
          </div>
          <AlertDialogTitle className="text-center">Share Your Live Location?</AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            Share your live location so {requesterName || 'the requester'} can track your arrival?
            <br />
            <span className="text-xs text-muted-foreground mt-2 block">
              This is optional. You can turn it on/off anytime.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <AlertDialogAction 
            onClick={handleEnableLocation} 
            className="w-full bg-success hover:bg-success/90"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Getting location...
              </>
            ) : (
              <>
                <MapPin className="w-4 h-4 mr-2" />
                Share Live Location
              </>
            )}
          </AlertDialogAction>
          <AlertDialogCancel 
            onClick={handleSkip}
            className="w-full"
            disabled={loading}
          >
            Continue without sharing
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
