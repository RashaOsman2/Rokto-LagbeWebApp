import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin, X } from 'lucide-react';

const LOCATION_PERMISSION_KEY = 'roktolagbe_location_permission_asked';

interface LocationPermissionDialogProps {
  onPermissionGranted?: () => void;
  onSkipped?: () => void;
}

export const LocationPermissionDialog: React.FC<LocationPermissionDialogProps> = ({
  onPermissionGranted,
  onSkipped,
}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if we've already asked for permission
    const alreadyAsked = localStorage.getItem(LOCATION_PERMISSION_KEY);
    if (!alreadyAsked) {
      // Small delay to let the app load first
      const timer = setTimeout(() => setOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAllowLocation = async () => {
    setLoading(true);
    try {
      // Request permission (just to get the prompt, we don't store the location)
      await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 0,
        });
      });
      
      localStorage.setItem(LOCATION_PERMISSION_KEY, 'granted');
      setOpen(false);
      onPermissionGranted?.();
    } catch (error) {
      // Permission denied or error - that's okay
      localStorage.setItem(LOCATION_PERMISSION_KEY, 'denied');
      setOpen(false);
      onSkipped?.();
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    localStorage.setItem(LOCATION_PERMISSION_KEY, 'skipped');
    setOpen(false);
    onSkipped?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-4 p-3 rounded-full bg-primary/10">
            <MapPin className="w-8 h-8 text-primary" />
          </div>
          <DialogTitle className="text-center">Enable Location</DialogTitle>
          <DialogDescription className="text-center pt-2">
            We use location to help donors reach patients faster.
            <br />
            <span className="text-muted-foreground">
              You can continue without enabling it.
            </span>
          </DialogDescription>
        </DialogHeader>
        
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button 
            onClick={handleAllowLocation} 
            className="w-full"
            disabled={loading}
          >
            {loading ? 'Checking...' : 'Allow Location'}
          </Button>
          <Button 
            variant="ghost" 
            onClick={handleSkip}
            className="w-full text-muted-foreground"
            disabled={loading}
          >
            <X className="w-4 h-4 mr-2" />
            Skip for now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
