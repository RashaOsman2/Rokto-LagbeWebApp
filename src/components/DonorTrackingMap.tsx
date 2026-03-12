import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { UserLocation, HospitalLocation } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { MapPin, Navigation, Clock, Signal, SignalLow, SignalMedium, SignalHigh, Car } from 'lucide-react';

// Fix Leaflet default marker icon issue
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix default icon paths for Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface DonorTrackingMapProps {
  donorLocation: UserLocation | null;
  hospitalLocation?: HospitalLocation;
  donorName?: string;
  lastUpdated?: Date | null;
  isSharing: boolean;
  accuracy?: number | null; // GPS accuracy in meters
}

/**
 * Real-time map component for requesters to track donor's live location
 */
export const DonorTrackingMap: React.FC<DonorTrackingMapProps> = ({
  donorLocation,
  hospitalLocation,
  donorName = 'Donor',
  lastUpdated,
  isSharing,
  accuracy,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const donorMarkerRef = useRef<L.Marker | null>(null);
  const hospitalMarkerRef = useRef<L.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const initAttemptedRef = useRef(false);

  // Initialize map with delay to ensure container is visible (for dialogs)
  useEffect(() => {
    // Prevent multiple initialization attempts
    if (initAttemptedRef.current) return;
    
    // Use longer delay to ensure dialog animation is complete
    const initTimeout = setTimeout(() => {
      if (!mapRef.current || mapInstanceRef.current) return;
      
      initAttemptedRef.current = true;

      const defaultCenter: [number, number] = donorLocation?.lat && donorLocation?.lng
        ? [donorLocation.lat, donorLocation.lng]
        : hospitalLocation?.lat && hospitalLocation?.lng
        ? [hospitalLocation.lat, hospitalLocation.lng]
        : [23.8103, 90.4125]; // Default to Dhaka

      try {
        // Ensure the container has proper dimensions before creating map
        const container = mapRef.current;
        if (container.offsetHeight < 100) {
          container.style.height = '300px';
        }
        
        const map = L.map(container, {
          center: defaultCenter,
          zoom: 14,
          zoomControl: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);

        mapInstanceRef.current = map;
        
        // Force multiple resize invalidations to ensure proper rendering
        const invalidateSizes = () => {
          if (mapInstanceRef.current) {
            mapInstanceRef.current.invalidateSize({ animate: false });
          }
        };
        
        // Invalidate multiple times with different delays
        setTimeout(invalidateSizes, 100);
        setTimeout(invalidateSizes, 300);
        setTimeout(() => {
          invalidateSizes();
          setMapReady(true);
        }, 500);
      } catch (error) {
        console.error('Error initializing map:', error);
        initAttemptedRef.current = false; // Allow retry on error
      }
    }, 400); // Increased delay for dialog animation

    return () => {
      clearTimeout(initTimeout);
    };
  }, [donorLocation, hospitalLocation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Handle resize events (important for dialogs)
  useEffect(() => {
    if (!mapRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      // Debounce the resize to avoid excessive invalidations
      if (mapInstanceRef.current) {
        setTimeout(() => {
          mapInstanceRef.current?.invalidateSize({ animate: false });
        }, 100);
      }
    });
    
    resizeObserver.observe(mapRef.current);
    
    // Also invalidate on visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize({ animate: false });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [mapReady]);

  // Create donor icon with pulsing animation - using inline styles since Tailwind doesn't work in Leaflet divIcon
  const createDonorIcon = () => {
    return L.divIcon({
      className: 'donor-tracking-marker',
      html: `
        <div style="position: relative; width: 40px; height: 40px;">
          <div style="position: absolute; inset: -12px; background: rgba(229, 57, 53, 0.3); border-radius: 50%; animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position: absolute; inset: -8px; background: rgba(229, 57, 53, 0.5); border-radius: 50%; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;"></div>
          <div style="position: relative; width: 40px; height: 40px; background: #E53935; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2); border: 2px solid white;">
            <svg style="width: 20px; height: 20px; color: white;" fill="white" viewBox="0 0 24 24">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 40],
    });
  };

  // Create hospital icon - using inline styles
  const createHospitalIcon = () => {
    return L.divIcon({
      className: 'hospital-marker',
      html: `
        <div style="width: 40px; height: 40px; background: #EF4444; border-radius: 8px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2); border: 2px solid white;">
          <svg style="width: 20px; height: 20px;" fill="none" stroke="white" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
          </svg>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 40],
    });
  };

  // Update donor marker
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;

    const map = mapInstanceRef.current;

    if (donorLocation) {
      const position: [number, number] = [donorLocation.lat, donorLocation.lng];

      if (donorMarkerRef.current) {
        // Animate marker to new position
        donorMarkerRef.current.setLatLng(position);
      } else {
        // Create new marker
        donorMarkerRef.current = L.marker(position, {
          icon: createDonorIcon(),
        })
          .bindPopup(`
            <div class="text-center p-2">
              <p class="font-semibold">${donorName}</p>
              <p class="text-sm text-gray-600">📍 Live Location</p>
            </div>
          `)
          .addTo(map);
      }

      // Fit bounds to show both donor and hospital
      const bounds = L.latLngBounds([position]);
      if (hospitalLocation?.lat && hospitalLocation?.lng) {
        bounds.extend([hospitalLocation.lat, hospitalLocation.lng]);
      }
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    } else if (donorMarkerRef.current) {
      map.removeLayer(donorMarkerRef.current);
      donorMarkerRef.current = null;
    }
  }, [donorLocation, mapReady, donorName]);

  // Add hospital marker
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;

    const map = mapInstanceRef.current;

    if (hospitalLocation?.lat && hospitalLocation?.lng) {
      if (hospitalMarkerRef.current) {
        hospitalMarkerRef.current.setLatLng([hospitalLocation.lat, hospitalLocation.lng]);
      } else {
        hospitalMarkerRef.current = L.marker([hospitalLocation.lat, hospitalLocation.lng], {
          icon: createHospitalIcon(),
        })
          .bindPopup(`
            <div class="text-center p-2">
              <p class="font-semibold">Hospital</p>
              <p class="text-sm text-gray-600">${hospitalLocation.address || 'Destination'}</p>
            </div>
          `)
          .addTo(map);
      }
    }
  }, [hospitalLocation, mapReady]);

  // Calculate distance between donor and hospital
  const getDistanceAndETA = () => {
    if (!donorLocation || !hospitalLocation?.lat || !hospitalLocation?.lng) return null;
    
    const R = 6371; // Earth's radius in km
    const dLat = ((hospitalLocation.lat - donorLocation.lat) * Math.PI) / 180;
    const dLng = ((hospitalLocation.lng - donorLocation.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((donorLocation.lat * Math.PI) / 180) *
        Math.cos((hospitalLocation.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = R * c;
    
    // Estimate ETA assuming average speed of 25 km/h in city traffic
    const etaMinutes = Math.round((distanceKm / 25) * 60);
    
    const distanceStr = distanceKm < 1 
      ? `${Math.round(distanceKm * 1000)}m` 
      : `${distanceKm.toFixed(1)}km`;
    
    const etaStr = etaMinutes < 1 
      ? 'Arriving now'
      : etaMinutes < 60 
        ? `~${etaMinutes} min` 
        : `~${Math.floor(etaMinutes / 60)}h ${etaMinutes % 60}m`;
    
    return { distance: distanceStr, eta: etaStr, distanceKm, etaMinutes };
  };

  // Get GPS accuracy quality indicator
  const getGpsQuality = (): { label: string; color: string; icon: React.ReactNode; description: string } => {
    if (!accuracy || accuracy <= 0) {
      return { label: 'Unknown', color: 'text-muted-foreground', icon: <Signal className="w-3.5 h-3.5" />, description: 'Accuracy data unavailable' };
    }
    if (accuracy <= 10) {
      return { label: 'Excellent', color: 'text-success', icon: <SignalHigh className="w-3.5 h-3.5" />, description: `±${Math.round(accuracy)}m` };
    }
    if (accuracy <= 30) {
      return { label: 'Good', color: 'text-success', icon: <SignalMedium className="w-3.5 h-3.5" />, description: `±${Math.round(accuracy)}m` };
    }
    if (accuracy <= 100) {
      return { label: 'Fair', color: 'text-warning', icon: <SignalLow className="w-3.5 h-3.5" />, description: `±${Math.round(accuracy)}m` };
    }
    return { label: 'Poor', color: 'text-destructive', icon: <SignalLow className="w-3.5 h-3.5" />, description: `±${Math.round(accuracy)}m - GPS may be inaccurate` };
  };

  const distanceInfo = getDistanceAndETA();
  const gpsQuality = getGpsQuality();

  if (!isSharing) {
    return (
      <div className="h-[300px] rounded-lg bg-muted flex flex-col items-center justify-center text-muted-foreground">
        <MapPin className="w-10 h-10 mb-3 opacity-50" />
        <p className="font-medium">Location Not Available</p>
        <p className="text-sm mt-1">The donor hasn't shared their live location yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Status bar */}
      <div className="flex items-center justify-between p-3 bg-success/10 border border-success/20 rounded-lg">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-success rounded-full animate-pulse" />
          <span className="text-sm font-medium text-success">
            {donorName} is sharing live location
          </span>
        </div>
        {lastUpdated && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
          </div>
        )}
      </div>

      {/* GPS Accuracy Indicator */}
      {accuracy !== undefined && accuracy !== null && (
        <div className={`flex items-center justify-between p-2 rounded-lg border ${
          accuracy <= 30 ? 'bg-success/5 border-success/20' : 
          accuracy <= 100 ? 'bg-warning/5 border-warning/20' : 
          'bg-destructive/5 border-destructive/20'
        }`}>
          <div className="flex items-center gap-2">
            <span className={gpsQuality.color}>{gpsQuality.icon}</span>
            <span className={`text-sm font-medium ${gpsQuality.color}`}>
              GPS: {gpsQuality.label}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {gpsQuality.description}
          </span>
        </div>
      )}

      {/* Map */}
      <div className="relative">
        <div 
          ref={mapRef} 
          className="w-full rounded-lg overflow-hidden bg-muted"
          style={{ height: '300px', minHeight: '300px', position: 'relative', zIndex: 1 }}
        />
        
        {/* Loading overlay */}
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-lg" style={{ zIndex: 2 }}>
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading map...</span>
            </div>
          </div>
        )}
        
        {/* Distance and ETA overlay */}
        {distanceInfo && (
          <div className="absolute bottom-3 left-3 right-3 bg-background/95 backdrop-blur px-3 py-2 rounded-lg shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Navigation className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">{distanceInfo.distance} away</span>
              </div>
              <div className="flex items-center gap-2 text-success">
                <Car className="w-4 h-4" />
                <span className="text-sm font-semibold">{distanceInfo.eta}</span>
              </div>
            </div>
            {distanceInfo.etaMinutes <= 5 && distanceInfo.etaMinutes > 0 && (
              <div className="mt-1 text-xs text-success text-center font-medium animate-pulse">
                🎉 Donor is almost there!
              </div>
            )}
          </div>
        )}

        {/* GPS accuracy overlay - shows warning for poor accuracy */}
        {accuracy && accuracy > 100 && (
          <div className="absolute top-3 left-3 right-3 bg-destructive/90 backdrop-blur text-destructive-foreground px-3 py-2 rounded-lg text-xs text-center">
            ⚠️ Low GPS accuracy - Donor should move outdoors for better signal
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-primary rounded-full" />
            <span>Donor Location</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-destructive rounded" />
            <span>Hospital</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DonorTrackingMap;
