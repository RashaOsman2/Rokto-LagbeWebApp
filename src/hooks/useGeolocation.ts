import { useState, useCallback, useRef, useEffect } from 'react';

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  error: string | null;
  loading: boolean;
}

// Desired accuracy threshold in meters - if accuracy is worse than this, try again
const DESIRED_ACCURACY_THRESHOLD = 100;
const MAX_RETRY_ATTEMPTS = 3;

export const useGeolocation = () => {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    error: null,
    loading: false,
  });
  
  const watchIdRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  // Track component mount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Cleanup any active watch
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  // Get best available position with retry logic for accuracy
  const getCurrentPosition = useCallback((): Promise<{ lat: number; lng: number; accuracy?: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const error = 'Geolocation is not supported by your browser';
        if (isMountedRef.current) {
          setState(prev => ({ ...prev, error, loading: false }));
        }
        reject(new Error(error));
        return;
      }

      if (isMountedRef.current) {
        setState(prev => ({ ...prev, loading: true, error: null }));
      }

      let bestPosition: { lat: number; lng: number; accuracy: number } | null = null;
      let attempts = 0;

      const tryGetPosition = () => {
        attempts++;
        
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            
            // Keep track of best position (lowest accuracy value = most accurate)
            if (!bestPosition || accuracy < bestPosition.accuracy) {
              bestPosition = { lat: latitude, lng: longitude, accuracy };
            }
            
            // If accuracy is good enough or we've tried enough times, use this position
            if (accuracy <= DESIRED_ACCURACY_THRESHOLD || attempts >= MAX_RETRY_ATTEMPTS) {
              if (isMountedRef.current) {
                setState({
                  latitude: bestPosition.lat,
                  longitude: bestPosition.lng,
                  accuracy: bestPosition.accuracy,
                  error: null,
                  loading: false,
                });
              }
              resolve({ lat: bestPosition.lat, lng: bestPosition.lng, accuracy: bestPosition.accuracy });
            } else {
              // Try again after a short delay to let GPS warm up
              console.log(`Location accuracy: ${accuracy}m - retrying for better accuracy (attempt ${attempts}/${MAX_RETRY_ATTEMPTS})`);
              setTimeout(tryGetPosition, 1000);
            }
          },
          (error) => {
            // If we have a previous best position, use it
            if (bestPosition) {
              if (isMountedRef.current) {
                setState({
                  latitude: bestPosition.lat,
                  longitude: bestPosition.lng,
                  accuracy: bestPosition.accuracy,
                  error: null,
                  loading: false,
                });
              }
              resolve({ lat: bestPosition.lat, lng: bestPosition.lng, accuracy: bestPosition.accuracy });
              return;
            }
            
            let errorMessage = 'Failed to get location';
            switch (error.code) {
              case error.PERMISSION_DENIED:
                errorMessage = 'Location permission denied. Please enable location access in your browser settings.';
                break;
              case error.POSITION_UNAVAILABLE:
                errorMessage = 'Location information unavailable. Please ensure GPS is enabled on your device.';
                break;
              case error.TIMEOUT:
                errorMessage = 'Location request timed out. Please ensure you are in an open area with GPS signal.';
                break;
            }
            if (isMountedRef.current) {
              setState(prev => ({ ...prev, error: errorMessage, loading: false }));
            }
            reject(new Error(errorMessage));
          },
          {
            enableHighAccuracy: true, // Forces GPS usage when available
            timeout: 15000, // 15 seconds per attempt
            maximumAge: 0, // Never use cached position - always get fresh GPS
          }
        );
      };

      tryGetPosition();
    });
  }, []);

  // Watch position continuously for real-time tracking with high accuracy
  const watchPosition = useCallback((
    onUpdate: (position: { lat: number; lng: number; accuracy: number }) => void,
    onError?: (error: string) => void
  ) => {
    if (!navigator.geolocation) {
      onError?.('Geolocation is not supported by your browser');
      return;
    }

    // Clear any existing watch
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (isMountedRef.current) {
          setState({
            latitude,
            longitude,
            accuracy,
            error: null,
            loading: false,
          });
        }
        onUpdate({ lat: latitude, lng: longitude, accuracy });
      },
      (error) => {
        let errorMessage = 'Failed to track location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location permission denied';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location unavailable. Ensure GPS is enabled.';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location tracking timed out';
            break;
        }
        if (isMountedRef.current) {
          setState(prev => ({ ...prev, error: errorMessage }));
        }
        onError?.(errorMessage);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0, // Always get fresh position
      }
    );
  }, []);

  // Stop watching position
  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  return {
    ...state,
    getCurrentPosition,
    watchPosition,
    stopWatching,
  };
};
