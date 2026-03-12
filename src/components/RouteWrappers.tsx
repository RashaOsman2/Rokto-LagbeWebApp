import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { TERMS_CURRENT_VERSION } from '@/components/TermsAndConditions';

// Protected Route wrapper - for regular users only (excludes hospital and admin)
export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If user exists but no profile, redirect to profile setup
  if (user && !profile) {
    return <Navigate to="/profile-setup" replace />;
  }

  // ROLE-BASED ROUTING: Redirect hospital users to their dashboard
  if (profile?.role === 'hospital') {
    // Check if hospital needs profile setup first
    if (profile.needsProfileSetup) {
      return <Navigate to="/hospital-profile-setup" replace />;
    }
    return <Navigate to="/hospital-dashboard" replace />;
  }

  // ROLE-BASED ROUTING: Redirect admin users to admin dashboard
  if (profile?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  // Check if user has accepted current terms version
  if (profile && (!profile.acceptedTerms || profile.acceptedTermsVersion !== TERMS_CURRENT_VERSION)) {
    return <Navigate to="/terms" replace />;
  }

  return <>{children}</>;
};

// Hospital Route wrapper - for hospital users only
export const HospitalRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/hospital-login" replace />;
  }

  // If no profile, need to fetch/wait
  if (!profile) {
    return <LoadingSpinner />;
  }

  // Only hospital role can access
  if (profile.role !== 'hospital') {
    return <Navigate to="/" replace />;
  }

  // Check if hospital needs profile setup
  if (profile.needsProfileSetup) {
    return <Navigate to="/hospital-profile-setup" replace />;
  }

  return <>{children}</>;
};

// Admin Route wrapper - for admin users only
export const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!profile) {
    return <LoadingSpinner />;
  }

  // Only admin role can access
  if (profile.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

// Shared Route wrapper - for regular users AND hospital users (donor search, create requests)
export const SharedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If user exists but no profile, redirect to profile setup
  if (user && !profile) {
    return <Navigate to="/profile-setup" replace />;
  }

  // Hospital users need profile setup first
  if (profile?.role === 'hospital' && profile.needsProfileSetup) {
    return <Navigate to="/hospital-profile-setup" replace />;
  }

  // Admin users redirect to admin dashboard (they don't need donor search)
  if (profile?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  // Check if user has accepted current terms version (for regular users only)
  if (profile?.role !== 'hospital' && profile && (!profile.acceptedTerms || profile.acceptedTermsVersion !== TERMS_CURRENT_VERSION)) {
    return <Navigate to="/terms" replace />;
  }

  return <>{children}</>;
};

// Public Route wrapper (redirect if already logged in)
export const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (user && profile) {
    // Role-based redirect for logged-in users
    if (profile.role === 'hospital') {
      if (profile.needsProfileSetup) {
        return <Navigate to="/hospital-profile-setup" replace />;
      }
      return <Navigate to="/hospital-dashboard" replace />;
    }
    if (profile.role === 'admin') {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/" replace />;
  }

  if (user && !profile) {
    return <Navigate to="/profile-setup" replace />;
  }

  return <>{children}</>;
};

// Profile Setup Route wrapper
export const ProfileSetupRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, loading } = useAuth();
  const [isStable, setIsStable] = useState(false);
  const [hasCheckedProfile, setHasCheckedProfile] = useState(false);

  // Wait for auth to fully load and stabilize before making routing decisions
  // This prevents the flash where profile setup shows then redirects
  useEffect(() => {
    if (!loading) {
      // Give extra time for profile to be fetched after auth loads
      const timer = setTimeout(() => {
        setHasCheckedProfile(true);
        setIsStable(true);
      }, 300); // Increased delay for profile fetch to complete
      return () => clearTimeout(timer);
    } else {
      setIsStable(false);
      setHasCheckedProfile(false);
    }
  }, [loading]);

  // Show loading until we've fully checked auth and profile state
  if (loading || !isStable || !hasCheckedProfile) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If profile exists, redirect based on role
  if (profile) {
    if (profile.role === 'hospital') {
      if (profile.needsProfileSetup) {
        return <Navigate to="/hospital-profile-setup" replace />;
      }
      return <Navigate to="/hospital-dashboard" replace />;
    }
    if (profile.role === 'admin') {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
