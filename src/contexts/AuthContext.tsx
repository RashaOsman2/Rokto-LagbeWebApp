import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '@/lib/firebase';
import { UserProfile, DonorStatus, COOLDOWN_PERIOD_MS } from '@/types';

interface HospitalData {
  email: string;
  hospitalId: string;
  hospitalName: string;
  role: 'hospital';
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  hospitalData: HospitalData | null;
  signInWithGoogle: () => Promise<void>;
  sendPhoneOTP: (phoneNumber: string, recaptchaVerifier: RecaptchaVerifier) => Promise<ConfirmationResult>;
  verifyPhoneOTP: (confirmationResult: ConfirmationResult, code: string) => Promise<void>;
  signInWithEmailPassword: (email: string, password: string) => Promise<void>;
  signUpWithEmailPassword: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
  loginAsHospital: (data: HospitalData) => void;
  logoutHospital: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Strip undefined fields (Firestore rejects `undefined` values)
const stripUndefined = (obj: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

// Check if donor is in cooldown period
const checkCooldownStatus = (lastDonationDate: Date | null): DonorStatus => {
  if (!lastDonationDate) return 'available';

  const now = new Date();
  const timeSinceDonation = now.getTime() - lastDonationDate.getTime();

  if (timeSinceDonation < COOLDOWN_PERIOD_MS) {
    return 'cooldown';
  }

  return 'available';
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [hospitalData, setHospitalData] = useState<HospitalData | null>(() => {
    const stored = localStorage.getItem('hospitalData');
    return stored ? JSON.parse(stored) : null;
  });

  const loginAsHospital = (data: HospitalData) => {
    setHospitalData(data);
    localStorage.setItem('hospitalData', JSON.stringify(data));
  };

  const logoutHospital = () => {
    setHospitalData(null);
    localStorage.removeItem('hospitalData');
  };

  const fetchProfile = async (uid: string): Promise<UserProfile | null> => {
    try {
      const docRef = doc(db, 'users', uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const lastDonationDate = data.lastDonationDate?.toDate() || null;

        // Check and update cooldown status
        if (data.isDonor && data.donorStatus === 'cooldown') {
          const currentStatus = checkCooldownStatus(lastDonationDate);
          if (currentStatus !== 'cooldown') {
            // Cooldown period has passed, update status
            await updateDoc(docRef, { donorStatus: 'available' });
            data.donorStatus = 'available';
          }
        }

        return {
          ...data,
          uid: docSnap.id,
          lastDonationDate,
          createdAt: data.createdAt?.toDate() || new Date(),
        } as UserProfile;
      }

      return null;
    } catch (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
  };

  const refreshProfile = async () => {
    if (user) {
      setProfileLoading(true);
      try {
        const profileData = await fetchProfile(user.uid);
        setProfile(profileData);
      } finally {
        setProfileLoading(false);
      }
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      setUser(firebaseUser);

      if (firebaseUser) {
        // Add delay to ensure Firestore document is written
        // This helps with the race condition on new user registration
        // Increased delay to handle slower network conditions
        await new Promise(resolve => setTimeout(resolve, 200));
        const profileData = await fetchProfile(firebaseUser.uid);
        setProfile(profileData);
        
        // If profile wasn't found, try once more after a short delay
        // This handles race conditions where profile is being written
        if (!profileData) {
          await new Promise(resolve => setTimeout(resolve, 300));
          const retryProfile = await fetchProfile(firebaseUser.uid);
          setProfile(retryProfile);
        }
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    }
  };

  const signInWithEmailPassword = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Email sign-in error:', error);
      throw error;
    }
  };

  const signUpWithEmailPassword = async (email: string, password: string) => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Email sign-up error:', error);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      console.error('Password reset error:', error);
      throw error;
    }
  };

  const sendPhoneOTP = async (
    phoneNumber: string,
    recaptchaVerifier: RecaptchaVerifier
  ): Promise<ConfirmationResult> => {
    try {
      const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
      return confirmationResult;
    } catch (error) {
      console.error('Phone OTP error:', error);
      throw error;
    }
  };

  const verifyPhoneOTP = async (confirmationResult: ConfirmationResult, code: string): Promise<void> => {
    try {
      await confirmationResult.confirm(code);
    } catch (error) {
      console.error('OTP verification error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setProfile(null);
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  // Production hardening:
  // - avoids an initial getDoc() (which often fails when read rules are stricter than write rules)
  // - strips undefined values (Firestore rejects undefined)
  // - uses serverTimestamp for consistent server-side times
  const updateProfile = async (data: Partial<UserProfile>) => {
    if (!user) throw new Error('No user logged in');

    try {
      const docRef = doc(db, 'users', user.uid);

      const payload = stripUndefined({
        uid: user.uid,
        email: user.email ?? null,
        photoURL: user.photoURL ?? null,

        // keep original createdAt if we already have it in memory
        createdAt: profile?.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),

        // sensible defaults (safe to merge)
        isVerified: profile?.isVerified ?? false,
        isActive: profile?.isActive ?? true,

        ...data,
      });

      await setDoc(docRef, payload, { merge: true });
      await refreshProfile();
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        hospitalData,
        signInWithGoogle,
        sendPhoneOTP,
        verifyPhoneOTP,
        signInWithEmailPassword,
        signUpWithEmailPassword,
        resetPassword,
        logout,
        updateProfile,
        refreshProfile,
        loginAsHospital,
        logoutHospital,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

