import { useState, useEffect, useCallback } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, getFCMToken, initializeMessaging, onForegroundMessage } from '@/lib/firebase';
import { toast } from 'sonner';
import { Bell, MapPin, CheckCircle, AlertCircle } from 'lucide-react';
import React from 'react';

interface FCMPayload {
  notification?: {
    title?: string;
    body?: string;
  };
  data?: Record<string, string>;
}

export const useFCM = (userId: string | null) => {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  // Initialize FCM and get token
  const initializeFCM = useCallback(async () => {
    if (!userId) return null;

    setIsLoading(true);
    try {
      // Initialize messaging
      const messaging = await initializeMessaging();
      if (!messaging) {
        setIsSupported(false);
        return null;
      }

      // Get FCM token
      const fcmToken = await getFCMToken();
      if (fcmToken) {
        setToken(fcmToken);

        // Store token in user's document
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
          fcmTokens: arrayUnion(fcmToken),
          lastFCMUpdate: new Date(),
        });

        console.log('FCM token stored for user');
        return fcmToken;
      }
      return null;
    } catch (error) {
      console.error('Error initializing FCM:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Remove token (for logout or token refresh)
  const removeToken = useCallback(async () => {
    if (!userId || !token) return;

    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        fcmTokens: arrayRemove(token),
      });
      setToken(null);
    } catch (error) {
      console.error('Error removing FCM token:', error);
    }
  }, [userId, token]);

  // Listen for foreground messages
  useEffect(() => {
    if (!token) return;

    const unsubscribe = onForegroundMessage((payload: unknown) => {
      const fcmPayload = payload as FCMPayload;
      console.log('Foreground message received:', fcmPayload);

      const title = fcmPayload.notification?.title || 'RoktoLagbe?';
      const body = fcmPayload.notification?.body || '';
      const type = fcmPayload.data?.type || '';

      // Show toast based on message type
      const getIcon = () => {
        switch (type) {
          case 'request_accepted':
            return React.createElement(CheckCircle, { className: 'w-5 h-5 text-green-500' });
          case 'location_sharing':
            return React.createElement(MapPin, { className: 'w-5 h-5 text-primary' });
          case 'emergency_request':
            return React.createElement(AlertCircle, { className: 'w-5 h-5 text-destructive' });
          default:
            return React.createElement(Bell, { className: 'w-5 h-5 text-primary' });
        }
      };

      toast(title, {
        description: body,
        icon: getIcon(),
        duration: 8000,
        action: fcmPayload.data?.url
          ? {
              label: 'View',
              onClick: () => {
                window.location.href = fcmPayload.data?.url || '/';
              },
            }
          : undefined,
      });
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [token]);

  // Auto-initialize on mount
  useEffect(() => {
    if (userId && !token) {
      initializeFCM();
    }
  }, [userId, token, initializeFCM]);

  return {
    token,
    isLoading,
    isSupported,
    initializeFCM,
    removeToken,
  };
};

// Utility to send push notification via backend (would need a server-side function)
export const sendPushNotification = async (
  targetUserId: string,
  notification: {
    title: string;
    body: string;
    type?: 'request_accepted' | 'location_sharing' | 'emergency_request' | 'general';
    url?: string;
  }
) => {
  try {
    // This would typically call a Cloud Function or Edge Function
    // For now, we'll store the notification in Firestore for the NotificationManager to pick up
    console.log('Push notification would be sent:', { targetUserId, notification });
    
    // In production, you'd call:
    // const response = await fetch('/api/send-notification', {
    //   method: 'POST',
    //   body: JSON.stringify({ targetUserId, notification }),
    // });
    
    return true;
  } catch (error) {
    console.error('Error sending push notification:', error);
    return false;
  }
};
