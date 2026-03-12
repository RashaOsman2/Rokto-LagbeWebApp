import React, { useEffect, useState, useRef } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useFCM } from '@/hooks/useFCM';
import { toast } from 'sonner';
import { BloodRequest } from '@/types';
import { Droplet, AlertCircle, Siren, CheckCircle, MapPin, Navigation, Bell, MapPinned } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Request notification permission
const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    console.log('This browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
};

// Show browser notification (works when app is minimized)
const showBrowserNotification = (title: string, body: string, icon?: string, tag?: string) => {
  if (Notification.permission === 'granted') {
    // Only show browser notification if document is hidden (app minimized/background)
    // Or if the document doesn't have focus
    const shouldShow = document.hidden || !document.hasFocus();
    
    if (shouldShow) {
      const notification = new Notification(title, {
        body,
        icon: icon || '/blood-drop.png',
        badge: '/favicon.ico',
        tag: tag || `roktolagbe-${Date.now()}`, // Unique tag to prevent replacing
        requireInteraction: true,
        silent: false,
      });
      
      // Auto-close after 10 seconds
      setTimeout(() => notification.close(), 10000);
      
      // Focus window when notification is clicked
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
  }
};

interface NotificationManagerProps {
  children: React.ReactNode;
}

export const NotificationManager: React.FC<NotificationManagerProps> = ({ children }) => {
  const { user, profile } = useAuth();
  const [permissionGranted, setPermissionGranted] = useState(false);
  // Track which requests we've already notified about
  const notifiedRequestIds = useRef<Set<string>>(new Set());
  const notifiedLocationRequests = useRef<Set<string>>(new Set());
  // Track which accepted requests we've already notified about (prevents duplicate "Donor Found" notifications)
  const notifiedAcceptedRequestIds = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);
  
  // Initialize FCM for push notifications
  const { token: fcmToken, isSupported: fcmSupported } = useFCM(user?.uid || null);

  // Request permission on mount
  useEffect(() => {
    requestNotificationPermission().then(setPermissionGranted);
  }, []);

  // Log FCM status for debugging
  useEffect(() => {
    if (fcmToken) {
      console.log('FCM Push notifications enabled');
    } else if (!fcmSupported) {
      console.log('FCM Push notifications not supported in this browser');
    }
  }, [fcmToken, fcmSupported]);

  // Listen for new incoming requests (for donors)
  useEffect(() => {
    if (!user || !profile?.isDonor || profile?.donorStatus !== 'available') return;

    let isInitial = true;

    // Query for direct requests
    const directQuery = query(
      collection(db, 'requests'),
      where('targetDonorId', '==', user.uid),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubDirect = onSnapshot(directQuery, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const docId = change.doc.id;
          const data = change.doc.data();
          
          // Skip if already notified or initial load
          if (notifiedRequestIds.current.has(docId)) return;
          notifiedRequestIds.current.add(docId);
          
          // Skip notifications on initial load
          if (isInitial) return;
          
          const title = data.isAmberAlert 
            ? '🚨 AMBER ALERT - Urgent Blood Request!'
            : data.isEmergency 
            ? '⚠️ Emergency Blood Request'
            : '🩸 New Blood Request';
          
          const body = `${data.bloodGroup} blood needed at ${data.hospitalName}, ${data.area}`;
          
          // Show toast with action to view request
          toast(title, {
            description: body,
            icon: data.isAmberAlert ? <Siren className="w-5 h-5 text-destructive" /> : <Droplet className="w-5 h-5 text-primary" />,
            duration: 10000,
            action: {
              label: 'View Request',
              onClick: () => {
                window.location.href = `/requests?highlight=${docId}`;
              },
            },
          });

          // Show browser notification when app minimized
          if (permissionGranted) {
            showBrowserNotification(title, body, undefined, `request-${docId}`);
          }
        }
      });
      isInitial = false;
    });

    // Query for emergency/amber alert requests matching blood group
    const emergencyQuery = query(
      collection(db, 'requests'),
      where('isEmergency', '==', true),
      where('status', '==', 'pending'),
      where('bloodGroup', '==', profile.bloodGroup),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    let isEmergencyInitial = true;

    const unsubEmergency = onSnapshot(emergencyQuery, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const docId = change.doc.id;
          const data = change.doc.data();
          
          // Skip if it's our own request
          if (data.requesterId === user.uid) return;
          
          // For non-amber alerts, check area match
          if (!data.isAmberAlert && data.area !== profile.area) return;
          
          // Skip if already notified or initial load
          if (notifiedRequestIds.current.has(docId)) return;
          notifiedRequestIds.current.add(docId);
          
          if (isEmergencyInitial) return;

          const title = data.isAmberAlert 
            ? '🚨 AMBER ALERT - Blood Needed Nationwide!'
            : '⚠️ Emergency in Your Area';
          
          const body = `${data.bloodGroup} blood urgently needed at ${data.hospitalName}`;
          
          toast(title, {
            description: body,
            icon: data.isAmberAlert ? <Siren className="w-5 h-5 text-destructive" /> : <AlertCircle className="w-5 h-5 text-primary" />,
            duration: 15000,
            action: {
              label: 'View Request',
              onClick: () => {
                window.location.href = `/requests?highlight=${docId}`;
              },
            },
          });

          if (permissionGranted) {
            showBrowserNotification(title, body, undefined, `emergency-${docId}`);
          }
        }
      });
      isEmergencyInitial = false;
    });

    return () => {
      unsubDirect();
      unsubEmergency();
    };
  }, [user, profile?.isDonor, profile?.donorStatus, profile?.bloodGroup, profile?.area, permissionGranted]);

  // Listen for request status updates AND location sharing (for requesters)
  useEffect(() => {
    if (!user) return;

    const requestsQuery = query(
      collection(db, 'requests'),
      where('requesterId', '==', user.uid),
      orderBy('updatedAt', 'desc'),
      limit(10)
    );

    let isInitialLoad = true;

    const unsub = onSnapshot(requestsQuery, (snapshot) => {
      // Skip initial load to avoid showing old notifications
      if (isInitialLoad) {
        isInitialLoad = false;
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'modified') {
          const data = change.doc.data();
          const requestId = change.doc.id;
          
          // Notify when a donor accepts (only once per request)
          if (data.status === 'accepted' && !notifiedAcceptedRequestIds.current.has(requestId)) {
            // Mark as notified to prevent duplicate notifications
            notifiedAcceptedRequestIds.current.add(requestId);
            
            const title = '✅ Donor Found!';
            const body = `${data.acceptedDonorName || 'A donor'} has accepted your blood request`;
            
            toast.success(title, {
              description: body,
              icon: <CheckCircle className="w-5 h-5 text-success" />,
              duration: 10000,
              action: {
                label: 'View Details',
                onClick: () => {
                  window.location.href = `/requests?highlight=${requestId}&tab=outgoing`;
                },
              },
            });

            if (permissionGranted) {
              showBrowserNotification(title, body, undefined, `donor-found-${requestId}`);
            }
          }
          // Notify when donor starts sharing location (only once per request)
          else if (
            data.status === 'accepted' && 
            data.donorLiveLocation?.lat && 
            data.donorLiveLocation?.lng &&
            !notifiedLocationRequests.current.has(requestId)
          ) {
            notifiedLocationRequests.current.add(requestId);
            
            const title = '📍 Donor is Sharing Location!';
            const body = `${data.acceptedDonorName || 'The donor'} is now sharing their live location. Track their arrival in real-time.`;
            
            toast(title, {
              description: body,
              icon: <Navigation className="w-5 h-5 text-primary" />,
              duration: 8000,
              action: {
                label: 'View on Map',
                onClick: () => {
                  window.location.href = '/requests';
                },
              },
            });

            if (permissionGranted) {
              showBrowserNotification(title, body, undefined, `location-${requestId}`);
            }
          }
          // Notify when request is declined
          else if (data.status === 'declined') {
            toast.info('Request Declined', {
              description: 'A donor has declined your request. Other donors may still respond.',
              duration: 5000,
            });
          }
        }
      });
    });

    return () => unsub();
  }, [user, permissionGranted]);

  // Listen for location request notifications (for donors)
  useEffect(() => {
    if (!user) return;

    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      where('type', '==', 'location_request'),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    const unsub = onSnapshot(notificationsQuery, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const requestId = data.data?.requestId;
          const requesterName = data.data?.requesterName || 'The requester';
          
          // Show toast with action to share location immediately
          toast('📍 Location Sharing Requested', {
            description: `${requesterName} wants to track your arrival. Tap to share your live location.`,
            icon: <MapPinned className="w-5 h-5 text-primary" />,
            duration: 20000,
            action: {
              label: 'Share Location',
              onClick: () => {
                // Navigate to requests page with action param to trigger location sharing
                window.location.href = `/requests?action=share_location&requestId=${requestId || ''}&tab=incoming`;
              },
            },
          });

          if (permissionGranted) {
            showBrowserNotification(
              '📍 Location Sharing Requested',
              `${requesterName} wants to track your arrival. Tap to share your location.`,
              undefined,
              `location-request-${requestId}`
            );
          }
        }
      });
    });

    return () => unsub();
  }, [user, permissionGranted]);

  return <>{children}</>;
};

// Hook to manually trigger notification permission request
export const useNotifications = () => {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window 
      ? Notification.permission 
      : 'denied'
  );

  const requestPermission = async () => {
    const granted = await requestNotificationPermission();
    setPermission(granted ? 'granted' : 'denied');
    return granted;
  };

  return {
    permission,
    requestPermission,
    isSupported: typeof window !== 'undefined' && 'Notification' in window,
  };
};

export default NotificationManager;
