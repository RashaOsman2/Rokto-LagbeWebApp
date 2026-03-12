import { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  serverTimestamp, 
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { BloodStock, BloodGroup, BLOOD_GROUPS } from '@/types';

export interface BloodStockDocument {
  bags: number;
  updatedAt: Date;
}

const DEFAULT_BLOOD_STOCK: BloodStock = {
  'A+': 0, 'A-': 0, 'B+': 0, 'B-': 0,
  'O+': 0, 'O-': 0, 'AB+': 0, 'AB-': 0,
};

export const useHospitalBloodStock = (hospitalId: string | null) => {
  const [bloodStock, setBloodStock] = useState<BloodStock>(DEFAULT_BLOOD_STOCK);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hospitalId) {
      setBloodStock(DEFAULT_BLOOD_STOCK);
      setLoading(false);
      return;
    }

    const bloodStockRef = collection(db, 'hospitals', hospitalId, 'bloodStock');
    
    const unsubscribe = onSnapshot(
      bloodStockRef,
      (snapshot) => {
        const newStock: BloodStock = { ...DEFAULT_BLOOD_STOCK };
        
        snapshot.docs.forEach((docSnap) => {
          const bloodGroup = docSnap.id as BloodGroup;
          if (BLOOD_GROUPS.includes(bloodGroup)) {
            const data = docSnap.data();
            newStock[bloodGroup] = data.bags || 0;
          }
        });
        
        setBloodStock(newStock);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error fetching blood stock:', err);
        setError('Failed to load blood stock');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [hospitalId]);

  const updateBloodStock = useCallback(async (
    bloodGroup: BloodGroup,
    bags: number
  ): Promise<boolean> => {
    if (!hospitalId) {
      setError('No hospital ID provided');
      return false;
    }

    if (bags < 0) {
      setError('Bag count cannot be negative');
      return false;
    }

    if (!BLOOD_GROUPS.includes(bloodGroup)) {
      setError('Invalid blood group');
      return false;
    }

    try {
      const docRef = doc(db, 'hospitals', hospitalId, 'bloodStock', bloodGroup);
      await setDoc(docRef, {
        bags,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      
      setError(null);
      return true;
    } catch (err) {
      console.error('Error updating blood stock:', err);
      setError('Failed to update blood stock');
      return false;
    }
  }, [hospitalId]);

  const updateAllBloodStock = useCallback(async (
    newStock: BloodStock
  ): Promise<boolean> => {
    if (!hospitalId) {
      setError('No hospital ID provided');
      return false;
    }

    for (const group of BLOOD_GROUPS) {
      if (newStock[group] < 0) {
        setError(`Bag count for ${group} cannot be negative`);
        return false;
      }
    }

    try {
      const batch = writeBatch(db);
      
      for (const group of BLOOD_GROUPS) {
        const docRef = doc(db, 'hospitals', hospitalId, 'bloodStock', group);
        batch.set(docRef, {
          bags: newStock[group],
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
      
      await batch.commit();
      setError(null);
      return true;
    } catch (err) {
      console.error('Error updating all blood stock:', err);
      setError('Failed to update blood stock');
      return false;
    }
  }, [hospitalId]);

  return {
    bloodStock,
    loading,
    error,
    updateBloodStock,
    updateAllBloodStock,
    clearError: () => setError(null),
  };
};

export const getBloodStockForHospital = async (hospitalId: string): Promise<BloodStock> => {
  return new Promise((resolve, reject) => {
    const bloodStockRef = collection(db, 'hospitals', hospitalId, 'bloodStock');
    
    const unsubscribe = onSnapshot(
      bloodStockRef,
      (snapshot) => {
        const stock: BloodStock = { ...DEFAULT_BLOOD_STOCK };
        
        snapshot.docs.forEach((docSnap) => {
          const bloodGroup = docSnap.id as BloodGroup;
          if (BLOOD_GROUPS.includes(bloodGroup)) {
            const data = docSnap.data();
            stock[bloodGroup] = data.bags || 0;
          }
        });
        
        unsubscribe();
        resolve(stock);
      },
      (err) => {
        unsubscribe();
        reject(err);
      }
    );
  });
};
