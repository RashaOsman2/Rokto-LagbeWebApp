import { useCallback, useRef, useEffect } from 'react';

// Base64 encoded notification sound (short, pleasant chime)
const NOTIFICATION_SOUND_DATA = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbsGROOEV9xa3QhFE2WYO0xLWPVjxlj6rBrIpTOWeAma26pYVfPWt3jqC1p4dkRHF7h5SpqohhUXSAioqXmph3bW+Dk5GSlZN6cnCGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJR6c3CGkpGTlJQ=';

export const useNotificationSound = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isEnabledRef = useRef(true);

  useEffect(() => {
    // Create audio element once
    audioRef.current = new Audio(NOTIFICATION_SOUND_DATA);
    audioRef.current.volume = 0.5;
    
    // Check if sound is enabled in localStorage
    const soundEnabled = localStorage.getItem('notificationSoundEnabled');
    isEnabledRef.current = soundEnabled !== 'false';
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const playSound = useCallback(() => {
    if (!isEnabledRef.current || !audioRef.current) return;
    
    try {
      // Reset and play
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((error) => {
        // Ignore autoplay restrictions - user needs to interact first
        console.log('Sound play failed (likely autoplay restriction):', error);
      });
    } catch (error) {
      console.error('Error playing notification sound:', error);
    }
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    isEnabledRef.current = enabled;
    localStorage.setItem('notificationSoundEnabled', String(enabled));
  }, []);

  const isEnabled = useCallback(() => {
    return isEnabledRef.current;
  }, []);

  return { playSound, setEnabled, isEnabled };
};
