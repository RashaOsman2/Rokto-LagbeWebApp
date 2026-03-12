import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { MapPin, Navigation, X, Loader2 } from 'lucide-react';

interface LocationPermissionRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requesterName: string;
  onAccept: (location: { lat: number; lng: number }) => Promise<void>;
  onDeny: () => Promise<void>;
}

export const LocationPermissionRequestDialog: React.FC<LocationPermissionRequestDialogProps> = ({
  open,
  onOpenChange,
  requesterName,
  onAccept,
  onDeny,
}) => {
  const [loading, setLoading] = useState(false);
  const [denying, setDenying] = useState(false);

  const handleAccept = async () => {
    setLoading(true);
    
    // Close dialog immediately for better UX
    onOpenChange(false);
    
    try {
      // Get location using native API for immediate response
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });
      
      const location = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      
      // Write to Firestore immediately
      await onAccept(location);
    } catch (error: any) {
      console.error('Error getting location:', error);
      // Dialog is already closed, error will be handled by parent
    } finally {
      setLoading(false);
    }
  };

  const handleDeny = async () => {
    setDenying(true);
    
    // Close dialog immediately
    onOpenChange(false);
    
    try {
      await onDeny();
    } catch (error) {
      console.error('Error denying location:', error);
    } finally {
      setDenying(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <div className="mx-auto mb-3 p-4 rounded-full bg-primary/10">
            <MapPin className="w-8 h-8 text-primary" />
          </div>
          <AlertDialogTitle className="text-center text-lg">
            Location Sharing Request
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center space-y-2">
            <p>
              <span className="font-semibold text-foreground">{requesterName}</span> is requesting to track your live location as you travel to the hospital.
            </p>
            <p className="text-xs text-muted-foreground">
              Your location will be updated every 10 seconds until you stop sharing or the donation is complete.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="p-3 rounded-lg bg-muted/50 border text-sm space-y-2">
          <div className="flex items-center gap-2 text-success">
            <Navigation className="w-4 h-4" />
            <span className="font-medium">Real-time arrival tracking</span>
          </div>
          <p className="text-muted-foreground text-xs">
            Helps the requester prepare for your arrival at the hospital
          </p>
        </div>

        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={handleDeny}
            disabled={loading || denying}
            data-testid="button-deny-location"
          >
            {denying ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <X className="w-4 h-4" />
            )}
            Deny
          </Button>
          <Button
            className="flex-1 gap-2 bg-success hover:bg-success/90"
            onClick={handleAccept}
            disabled={loading || denying}
            data-testid="button-accept-location"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sharing...
              </>
            ) : (
              <>
                <Navigation className="w-4 h-4" />
                Accept & Share
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
