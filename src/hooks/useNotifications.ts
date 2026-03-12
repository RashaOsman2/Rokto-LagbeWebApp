import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, writeBatch, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { AppNotification, NotificationType } from '@/types/notifications';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export const useNotifications = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const newNotifications: AppNotification[] = [];
        let newUnread = 0;

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const notification: AppNotification = {
            id: docSnap.id,
            userId: data.userId,
            type: data.type,
            title: data.title,
            body: data.body,
            data: data.data,
            read: data.read || false,
            // Handle both Date object and Firestore Timestamp
            createdAt: data.createdAt instanceof Date 
              ? data.createdAt 
              : data.createdAt?.toDate?.() || new Date(),
          };
          newNotifications.push(notification);
          
          if (!notification.read) {
            newUnread++;
          }
        });

        // Check for new unread notifications and show toast
        const prevUnread = notifications.filter(n => !n.read).length;
        if (newUnread > prevUnread && newNotifications.length > 0) {
          const latestNew = newNotifications.find(n => !n.read);
          if (latestNew) {
            toast(latestNew.title, {
              description: latestNew.body,
              duration: 5000,
            });
          }
        }

        setNotifications(newNotifications);
        setUnreadCount(newUnread);
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to notifications:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        read: true,
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    
    try {
      const batch = writeBatch(db);
      notifications
        .filter(n => !n.read)
        .forEach(n => {
          batch.update(doc(db, 'notifications', n.id), { read: true });
        });
      await batch.commit();
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  }, [user, notifications]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
  };
};

// Helper function to send notifications (in-app + push)
export const sendNotification = async (
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, string>
) => {
  try {
    // Use client-side timestamp for immediate consistency, then server will have final say
    const now = new Date();
    
    // 1. Save in-app notification to Firestore with client timestamp for ordering
    await addDoc(collection(db, 'notifications'), {
      userId,
      type,
      title,
      body,
      data,
      read: false,
      createdAt: now, // Use client timestamp for immediate ordering
      serverCreatedAt: serverTimestamp(), // Keep server timestamp for reference
    });

    // 2. Get the user's FCM token and send push notification
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const fcmToken = userData.fcmToken;

        if (fcmToken) {
          // Call edge function to send push notification
          const { error } = await supabase.functions.invoke('send-push-notification', {
            body: {
              fcmToken,
              title,
              body,
              data: {
                ...data,
                type,
                url: data?.url || '/',
              },
            },
          });

          if (error) {
            console.error('Error calling push notification function:', error);
          } else {
            console.log('Push notification sent successfully');
          }
        }
      }
    } catch (pushError) {
      console.error('Error sending push notification:', pushError);
      // Don't throw - in-app notification was still saved
    }
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};

// Helper function to send arrival notification
export const sendArrivalNotification = async (
  requesterId: string,
  donorName: string,
  hospitalName: string,
  requestId: string
) => {
  await sendNotification(
    requesterId,
    'location_sharing',
    '🚗 Donor Arriving Soon!',
    `${donorName} is near ${hospitalName}. They should arrive shortly!`,
    {
      requestId,
      donorName,
      url: '/requests',
    }
  );
};
