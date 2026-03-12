import { collection, addDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { BloodStock, BloodStockHistoryEntry, BloodGroup, BloodStockAction } from '@/types';
import { useState, useEffect, useCallback } from 'react';

/**
 * Log blood stock change to history
 */
export const logBloodStockChange = async (
  hospitalId: string,
  hospitalName: string,
  bloodGroup: BloodGroup,
  previousQuantity: number,
  newQuantity: number,
  performedBy: string,
  performedByName: string,
  performedByRole: 'admin' | 'hospital',
  reason?: string
) => {
  let action: BloodStockAction = 'updated';
  if (newQuantity > previousQuantity) {
    action = 'added';
  } else if (newQuantity < previousQuantity) {
    action = 'removed';
  }

  await addDoc(collection(db, 'bloodStockHistory'), {
    hospitalId,
    hospitalName,
    bloodGroup,
    previousQuantity,
    newQuantity,
    action,
    reason: reason || null,
    performedBy,
    performedByName,
    performedByRole,
    createdAt: serverTimestamp(),
  });
};

/**
 * Log multiple blood stock changes (for batch updates)
 */
export const logMultipleBloodStockChanges = async (
  hospitalId: string,
  hospitalName: string,
  oldStock: BloodStock,
  newStock: BloodStock,
  performedBy: string,
  performedByName: string,
  performedByRole: 'admin' | 'hospital',
  reason?: string
) => {
  const bloodGroups: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
  
  const promises = bloodGroups
    .filter(group => oldStock[group] !== newStock[group])
    .map(group => 
      logBloodStockChange(
        hospitalId,
        hospitalName,
        group,
        oldStock[group] || 0,
        newStock[group] || 0,
        performedBy,
        performedByName,
        performedByRole,
        reason
      )
    );

  await Promise.all(promises);
};

/**
 * Hook to fetch blood stock history for a hospital
 */
export const useBloodStockHistory = (hospitalId: string | null, limitCount: number = 50) => {
  const [history, setHistory] = useState<BloodStockHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hospitalId) {
      setHistory([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'bloodStockHistory'),
      where('hospitalId', '==', hospitalId),
      limit(limitCount)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const entries: BloodStockHistoryEntry[] = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            hospitalId: data.hospitalId,
            hospitalName: data.hospitalName,
            bloodGroup: data.bloodGroup,
            previousQuantity: data.previousQuantity,
            newQuantity: data.newQuantity,
            action: data.action,
            reason: data.reason,
            performedBy: data.performedBy,
            performedByName: data.performedByName,
            performedByRole: data.performedByRole,
            createdAt: data.createdAt?.toDate() || new Date(),
          } as BloodStockHistoryEntry;
        });
        
        // Sort client-side since Firestore may not have compound index
        entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        
        setHistory(entries);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching blood stock history:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [hospitalId, limitCount]);

  return { history, loading };
};

/**
 * Hook to fetch all blood stock history (for admin)
 */
export const useAllBloodStockHistory = (limitCount: number = 100) => {
  const [history, setHistory] = useState<BloodStockHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'bloodStockHistory'),
      limit(limitCount)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const entries: BloodStockHistoryEntry[] = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            hospitalId: data.hospitalId,
            hospitalName: data.hospitalName,
            bloodGroup: data.bloodGroup,
            previousQuantity: data.previousQuantity,
            newQuantity: data.newQuantity,
            action: data.action,
            reason: data.reason,
            performedBy: data.performedBy,
            performedByName: data.performedByName,
            performedByRole: data.performedByRole,
            createdAt: data.createdAt?.toDate() || new Date(),
          } as BloodStockHistoryEntry;
        });
        
        // Sort client-side
        entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        
        setHistory(entries);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching all blood stock history:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [limitCount]);

  return { history, loading };
};
