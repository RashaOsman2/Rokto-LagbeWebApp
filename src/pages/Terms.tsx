import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { TermsAndConditions, TERMS_CURRENT_VERSION } from '@/components/TermsAndConditions';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { toast } from 'sonner';

const Terms: React.FC = () => {
  const { user, profile, updateProfile, loading: authLoading, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  if (authLoading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    navigate('/login');
    return null;
  }

  if (profile?.acceptedTerms && profile?.acceptedTermsVersion === TERMS_CURRENT_VERSION) {
    navigate('/');
    return null;
  }

  const handleAccept = async () => {
    setLoading(true);
    try {
      await updateProfile({
        acceptedTerms: true,
        acceptedTermsVersion: TERMS_CURRENT_VERSION,
        acceptedTermsAt: new Date(),
      });
      toast.success('Terms accepted! Welcome to RoktoLagbe');
      
      if (!profile) {
        navigate('/profile-setup');
      } else {
        navigate('/');
      }
    } catch (error) {
      console.error('Error accepting terms:', error);
      toast.error('Failed to save. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return <TermsAndConditions onAccept={handleAccept} loading={loading} />;
};

export default Terms;
