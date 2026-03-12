import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, onSnapshot, updateDoc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { UserLocation, LocationShareStatus, LIVE_LOCATION_EXPIRY_MS } from '@/types';
import { sendArrivalNotification } from './useNotifications';

interface UseDonorLocationTrackingProps {
  requestId: string | null;
  isRequester: boolean;
  isDonor: boolean;
  donorId?: string;
  requesterId?: string;
}

interface DonorLocationState {
  location: UserLocation | null;
  isSharing: boolean;
  lastUpdated: Date | null;
  error: string | null;
  accuracy: number | null;
  status: LocationShareStatus | null;
}

/**
 * Generate a consistent locationShare document ID
 */
const getLocationShareId = (requestId: string, donorId: string) => {
  return `${requestId}_${donorId}`;
};

/**
 * Hook for real-time donor location tracking using locationShares collection
 * - Uses a shared document that both donor and requester subscribe to
 * - Enforces status-based access control
 */
export const useDonorLocationTracking = ({
  requestId,
  isRequester,
  isDonor,
  donorId,
  requesterId,
}: UseDonorLocationTrackingProps) => {
  const [donorLocation, setDonorLocation] = useState<DonorLocationState>({
    location: null,
    isSharing: false,
    lastUpdated: null,
    error: null,
    accuracy: null,
    status: null,
  });
  const [isTracking, setIsTracking] = useState(false);

  // Listen to locationShares document for both requester and donor
  useEffect(() => {
    if (!requestId || !donorId) return;

    const shareId = getLocationShareId(requestId, donorId);
    
    const unsubscribe = onSnapshot(
      doc(db, 'locationShares', shareId),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const status = data.status as LocationShareStatus;
          
          // For requester: Only show location if status is 'accepted'
          if (isRequester) {
            if (status === 'denied') {
              setDonorLocation({
                location: null,
                isSharing: false,
                lastUpdated: null,
                error: 'Location sharing was declined by the donor',
                accuracy: null,
                status: 'denied',
              });
              return;
            }
            
            if (status === 'pending') {
              setDonorLocation({
                location: null,
                isSharing: false,
                lastUpdated: null,
                error: null,
                accuracy: null,
                status: 'pending',
              });
              return;
            }
            
            if (status === 'accepted' && data.donorLocation?.lat && data.donorLocation?.lng) {
              setDonorLocation({
                location: {
                  lat: data.donorLocation.lat,
                  lng: data.donorLocation.lng,
                },
                isSharing: true,
                lastUpdated: data.updatedAt?.toDate() || new Date(),
                error: null,
                accuracy: data.donorLocation.accuracy || null,
                status: 'accepted',
              });
            } else {
              setDonorLocation({
                location: null,
                isSharing: false,
                lastUpdated: null,
                error: null,
                accuracy: null,
                status,
              });
            }
          }
          
          // For donor: Just track the status
          if (isDonor) {
            setDonorLocation(prev => ({
              ...prev,
              status,
              isSharing: status === 'accepted',
            }));
          }
        } else {
          // No location share document exists yet
          setDonorLocation({
            location: null,
            isSharing: false,
            lastUpdated: null,
            error: null,
            accuracy: null,
            status: null,
          });
        }
      },
      (error) => {
        console.error('Error listening to location share:', error);
        setDonorLocation((prev) => ({
          ...prev,
          error: 'Failed to track location',
        }));
      }
    );

    return () => unsubscribe();
  }, [requestId, donorId, isRequester, isDonor]);

  // Request location permission (creates pending locationShare)
  const requestLocationPermission = useCallback(async () => {
    if (!requestId || !donorId || !requesterId) return;

    const shareId = getLocationShareId(requestId, donorId);
    
    try {
      await setDoc(doc(db, 'locationShares', shareId), {
        requestId,
        donorId,
        requesterId,
        status: 'pending',
        donorLocation: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + LIVE_LOCATION_EXPIRY_MS),
      });
    } catch (error) {
      console.error('Error requesting location permission:', error);
      throw error;
    }
  }, [requestId, donorId, requesterId]);

  // Accept location permission (donor only)
  const acceptLocationPermission = useCallback(async () => {
    if (!requestId || !donorId) return;

    const shareId = getLocationShareId(requestId, donorId);
    
    try {
      await updateDoc(doc(db, 'locationShares', shareId), {
        status: 'accepted',
        updatedAt: serverTimestamp(),
      });
      
      // Also update the request document for backward compatibility
      await updateDoc(doc(db, 'requests', requestId), {
        locationPermissionStatus: 'accepted',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error accepting location permission:', error);
      throw error;
    }
  }, [requestId, donorId]);

  // Deny location permission (donor only)
  const denyLocationPermission = useCallback(async () => {
    if (!requestId || !donorId) return;

    const shareId = getLocationShareId(requestId, donorId);
    
    try {
      await updateDoc(doc(db, 'locationShares', shareId), {
        status: 'denied',
        donorLocation: null,
        updatedAt: serverTimestamp(),
      });
      
      // Also update the request document for backward compatibility
      await updateDoc(doc(db, 'requests', requestId), {
        locationPermissionStatus: 'denied',
        donorLiveLocation: null,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error denying location permission:', error);
      throw error;
    }
  }, [requestId, donorId]);

  // Ref to store watch ID for cleanup
  const watchIdRef = useRef<number | null>(null);

  // Start tracking (donor only) - updates location in locationShares
  const startTracking = useCallback(async () => {
    if (!isDonor || !requestId || !donorId) return;
    setIsTracking(true);
  }, [isDonor, requestId, donorId]);

  const stopTracking = useCallback(async () => {
    setIsTracking(false);
    // Clear the watch when stopping
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // Continuous location tracking for donors using watchPosition - writes to locationShares
  useEffect(() => {
    if (!isDonor || !isTracking || !requestId || !donorId) return;

    const shareId = getLocationShareId(requestId, donorId);

    // Function to update Firestore with new position
    const updateLocationInFirestore = async (position: { lat: number; lng: number; accuracy?: number }) => {
      try {
        // Update locationShares document
        await updateDoc(doc(db, 'locationShares', shareId), {
          donorLocation: {
            lat: position.lat,
            lng: position.lng,
            accuracy: position.accuracy || null,
          },
          updatedAt: serverTimestamp(),
        });

        // Also update request document for backward compatibility
        await updateDoc(doc(db, 'requests', requestId), {
          donorLiveLocation: {
            lat: position.lat,
            lng: position.lng,
            accuracy: position.accuracy || null,
          },
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.error('Error updating donor location:', error);
      }
    };

    // Start watching position continuously with throttled updates (every 10-15 seconds)
    let lastUpdateTime = 0;
    const UPDATE_INTERVAL_MS = 10000; // 10 seconds minimum between Firestore writes

    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          const now = Date.now();
          
          // First update is immediate, then throttle to every 10 seconds
          if (lastUpdateTime === 0 || now - lastUpdateTime >= UPDATE_INTERVAL_MS) {
            lastUpdateTime = now;
            updateLocationInFirestore({ lat: latitude, lng: longitude, accuracy });
          }
        },
        (error) => {
          console.error('Geolocation watch error:', error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0, // Always get fresh position
        }
      );
    }

    return () => {
      // Cleanup: clear the watch when effect is cleaned up
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isDonor, isTracking, requestId, donorId]);

  return {
    donorLocation,
    isTracking,
    startTracking,
    stopTracking,
    requestLocationPermission,
    acceptLocationPermission,
    denyLocationPermission,
  };
};

/**
 * Hook to continuously update donor's live location using watchPosition
 */
export const useLiveLocationUpdater = (
  enabled: boolean,
  requestId: string | null,
  userId: string | null,
  updateProfile: (data: Record<string, unknown>) => Promise<void>
) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const arrivalNotificationSentRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !requestId || !userId) {
      setIsUpdating(false);
      arrivalNotificationSentRef.current = false;
      // Clear any existing watch
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!navigator.geolocation) {
      console.error('Geolocation is not supported by this browser');
      return;
    }

    setIsUpdating(true);
    const shareId = getLocationShareId(requestId, userId);
    let lastUpdateTime = 0;
    const UPDATE_INTERVAL_MS = 10000; // 10 seconds minimum between Firestore writes

    // Function to handle position updates with throttling
    const handlePositionUpdate = async (position: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = position.coords;
      const positionData = { lat: latitude, lng: longitude, accuracy };
      const now = Date.now();

      // First update is immediate, then throttle to every 10 seconds
      if (lastUpdateTime !== 0 && now - lastUpdateTime < UPDATE_INTERVAL_MS) {
        return; // Skip this update, too soon
      }
      lastUpdateTime = now;

      try {
        // Update locationShares, request document, and user profile
        await Promise.all([
          updateProfile({
            location: positionData,
            liveSharing: true,
          }),
          updateDoc(doc(db, 'requests', requestId), {
            donorLiveLocation: positionData,
            updatedAt: serverTimestamp(),
          }),
          updateDoc(doc(db, 'locationShares', shareId), {
            donorLocation: positionData,
            updatedAt: serverTimestamp(),
          }).catch(() => {
            // Silently fail if locationShare doesn't exist
          }),
        ]);

        // Check for arrival notification (within 500m of hospital)
        if (!arrivalNotificationSentRef.current) {
          try {
            const requestDoc = await getDoc(doc(db, 'requests', requestId));
            if (requestDoc.exists()) {
              const requestData = requestDoc.data();
              const hospitalLocation = requestData.hospitalLocation;

              if (hospitalLocation?.lat && hospitalLocation?.lng) {
                const distance = calculateDistance(
                  latitude,
                  longitude,
                  hospitalLocation.lat,
                  hospitalLocation.lng
                );

                if (distance <= 500) {
                  arrivalNotificationSentRef.current = true;

                  const userDoc = await getDoc(doc(db, 'users', userId));
                  const donorName = userDoc.exists()
                    ? (userDoc.data()?.fullName as string) || 'Donor'
                    : 'Donor';

                  await sendArrivalNotification(
                    requestData.requesterId,
                    donorName,
                    requestData.hospitalName,
                    requestId
                  );

                  console.log('Arrival notification sent!');
                }
              }
            }
          } catch (error) {
            console.error('Error checking arrival:', error);
          }
        }
      } catch (error) {
        console.error('Error updating live location:', error);
      }
    };

    // Start watching position continuously
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePositionUpdate,
      (error) => {
        console.error('Geolocation watch error:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0, // Always get fresh position
      }
    );

    return () => {
      // Cleanup: clear the watch when effect is cleaned up
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsUpdating(false);
    };
  }, [enabled, requestId, userId, updateProfile]);

  return { isUpdating };
};

/**
 * Calculate distance between two coordinates in meters using Haversine formula
 */
function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
