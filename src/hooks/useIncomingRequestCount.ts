import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';

export const useIncomingRequestCount = () => {
  const { user, profile } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user || !profile?.isDonor || profile?.donorStatus !== 'available') {
      setCount(0);
      return;
    }

    const unsubscribers: (() => void)[] = [];
    const requestIds = new Set<string>();

    const updateCount = () => {
      setCount(requestIds.size);
    };

    // Listen for direct requests
    const directQuery = query(
      collection(db, 'requests'),
      where('targetDonorId', '==', user.uid),
      where('status', '==', 'pending')
    );

    const unsubDirect = onSnapshot(directQuery, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          requestIds.add(change.doc.id);
        } else if (change.type === 'removed') {
          requestIds.delete(change.doc.id);
        }
      });
      updateCount();
    });
    unsubscribers.push(unsubDirect);

    // Listen for emergency requests matching blood group
    const emergencyQuery = query(
      collection(db, 'requests'),
      where('isEmergency', '==', true),
      where('status', '==', 'pending'),
      where('bloodGroup', '==', profile.bloodGroup)
    );

    const unsubEmergency = onSnapshot(emergencyQuery, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const data = change.doc.data();
        // Skip own requests
        if (data.requesterId === user.uid) return;
        // For non-amber alerts, check area match
        if (!data.isAmberAlert && data.area !== profile.area) return;

        if (change.type === 'added') {
          requestIds.add(change.doc.id);
        } else if (change.type === 'removed') {
          requestIds.delete(change.doc.id);
        }
      });
      updateCount();
    });
    unsubscribers.push(unsubEmergency);

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [user, profile?.isDonor, profile?.donorStatus, profile?.bloodGroup, profile?.area]);

  return count;
};
