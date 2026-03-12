import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, query, where, getDocs, doc, updateDoc, orderBy, getDoc, onSnapshot, Unsubscribe, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useLiveLocationUpdater } from '@/hooks/useDonorLocationTracking';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BloodGroupBadge } from '@/components/BloodGroupBadge';
import { BloodDropIcon } from '@/components/BloodDropIcon';
import { ChatButton } from '@/components/Chat';
import { LiveLocationPrompt } from '@/components/LiveLocationPrompt';
import { LocationToggle } from '@/components/LocationToggle';
import { DonorTrackingMap } from '@/components/DonorTrackingMap';
import { ProfileViewDialog } from '@/components/ProfileViewDialog';
import { PullToRefreshIndicator } from '@/components/PullToRefresh';
import { ConfirmationDialog } from '@/components/ConfirmationDialog';
import { BloodRequest, LIVE_LOCATION_EXPIRY_MS, REQUEST_EXPIRY_MS, REMINDER_COOLDOWN_MS, UserLocation, LocationPermissionStatus } from '@/types';
import { LocationPermissionRequestDialog } from '@/components/LocationPermissionRequestDialog';
import { sendNotification } from '@/hooks/useNotifications';
import { ArrowLeft, MapPin, Phone, Clock, CheckCircle, XCircle, AlertCircle, Siren, RefreshCw, History, Navigation, Eye, User, Bell, Calendar, Timer, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow, format, differenceInMilliseconds, differenceInHours, differenceInMinutes } from 'date-fns';

const Requests: React.FC = () => {
  const { user, profile, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { getCurrentPosition } = useGeolocation();
  const { playSound, setEnabled: setSoundEnabled, isEnabled: isSoundEnabled } = useNotificationSound();
  const [incomingRequests, setIncomingRequests] = useState<BloodRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<BloodRequest[]>([]);
  const [bookingRequests, setBookingRequests] = useState<BloodRequest[]>([]);
  const [incomingBookings, setIncomingBookings] = useState<BloodRequest[]>([]);
  const [donorAcceptedBookings, setDonorAcceptedBookings] = useState<BloodRequest[]>([]);
  const [donorAcceptedRequests, setDonorAcceptedRequests] = useState<BloodRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showMapDialog, setShowMapDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<BloodRequest | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showLiveLocationPrompt, setShowLiveLocationPrompt] = useState(false);
  const [acceptedRequestForPrompt, setAcceptedRequestForPrompt] = useState<BloodRequest | null>(null);
  const [soundEnabled, setSoundEnabledState] = useState(() => {
    const stored = localStorage.getItem('notificationSoundEnabled');
    return stored !== 'false';
  });
  
  const highlightRequestId = searchParams.get('highlight');
  const activeTab = searchParams.get('tab') || 'incoming';
  const actionParam = searchParams.get('action');
  
  const [highlightedId, setHighlightedId] = useState<string | null>(highlightRequestId);
  
  useEffect(() => {
    if (highlightRequestId || searchParams.get('tab') || actionParam) {
      const timer = setTimeout(() => {
        setSearchParams({});
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [highlightRequestId, actionParam, searchParams, setSearchParams]);
  
  useEffect(() => {
    if (highlightedId) {
      const timer = setTimeout(() => {
        setHighlightedId(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightedId]);
  
  const [showLocationSharePrompt, setShowLocationSharePrompt] = useState(false);
  const [locationShareRequestId, setLocationShareRequestId] = useState<string | null>(null);
  
  const [pendingLocationRequest, setPendingLocationRequest] = useState<BloodRequest | null>(null);
  const [showLocationPermissionDialog, setShowLocationPermissionDialog] = useState(false);
  
  useEffect(() => {
    if (actionParam === 'share_location' && profile?.isDonor) {
      const requestId = searchParams.get('requestId');
      if (requestId) {
        setLocationShareRequestId(requestId);
        setShowLocationSharePrompt(true);
      } else {
        toast.info('📍 Location sharing requested', {
          description: 'Enable location sharing in your active request below.',
          duration: 5000,
        });
      }
    }
  }, [actionParam, profile?.isDonor, searchParams]);

  const { isUpdating: isLocationUpdating } = useLiveLocationUpdater(
    !!profile?.liveSharing && !!profile?.liveSharingForRequestId,
    profile?.liveSharingForRequestId || null,
    user?.uid || null,
    updateProfile
  );

  useEffect(() => {
    const fetchLocation = async () => {
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        if (permission.state === 'granted') {
          const position = await getCurrentPosition();
          if (position) {
            setUserLocation(position);
          }
        }
      } catch (error) {
        console.log('Location not available for ETA calculation');
      }
    };
    fetchLocation();
  }, [getCurrentPosition]);

  const prevIncomingIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);
  const hasNotifiedRef = useRef<Set<string>>(new Set());

  // ─── MAIN REAL-TIME LISTENER ────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !profile) return;

    const unsubscribers: Unsubscribe[] = [];
    setLoading(true);

    checkAndClearExpiredLiveLocation();
    autoExpireOldRequests();

    // ── Outgoing requests (requests I created) ──────────────────────────────
    const outgoingQuery = query(
      collection(db, 'requests'),
      where('requesterId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubOutgoing = onSnapshot(outgoingQuery, async (snapshot) => {
      const outgoing: BloodRequest[] = [];
      const bookings: BloodRequest[] = [];
      
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const request: BloodRequest = {
          ...data,
          id: docSnap.id,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          scheduledAt: data.scheduledAt?.toDate() || null,
          lastReminderSentAt: data.lastReminderSentAt?.toDate() || null,
        } as BloodRequest;

        if (data.acceptedDonorId && !data.acceptedDonorName) {
          try {
            const donorDoc = await getDoc(doc(db, 'users', data.acceptedDonorId));
            if (donorDoc.exists()) {
              const donorData = donorDoc.data();
              request.acceptedDonorName = donorData.fullName;
              request.acceptedDonorPhone = donorData.phoneNumber;
            }
          } catch (e) {
            console.error('Error fetching donor info:', e);
          }
        }
        
        // ── FIX: treat 'booking' OR 'scheduled' as booking (cross-platform) ──
        const isBooking =
          data.requestType === 'booking' ||
          data.requestType === 'scheduled';

        if (isBooking && (data.status === 'pending' || data.status === 'accepted')) {
          bookings.push(request);
        } else {
          outgoing.push(request);
        }
      }
      setOutgoingRequests(outgoing);
      setBookingRequests(bookings);
      setLoading(false);
    }, (error) => {
      console.error('Error listening to outgoing requests:', error);
      setLoading(false);
    });

    unsubscribers.push(unsubOutgoing);

    // ── Bookings I accepted as a donor ──────────────────────────────────────
    const donorBookingsQuery = query(
      collection(db, 'requests'),
      where('acceptedDonorId', '==', user.uid),
      where('requestType', '==', 'booking'),
      orderBy('scheduledAt', 'asc')
    );

    const unsubDonorBookings = onSnapshot(donorBookingsQuery, async (snapshot) => {
      const donorBookings: BloodRequest[] = [];
      
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const request: BloodRequest = {
          ...data,
          id: docSnap.id,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          scheduledAt: data.scheduledAt?.toDate() || null,
        } as BloodRequest;

        if (data.requesterId && !data.requesterName) {
          try {
            const requesterDoc = await getDoc(doc(db, 'users', data.requesterId));
            if (requesterDoc.exists()) {
              const requesterData = requesterDoc.data();
              request.requesterName = requesterData.fullName;
              request.requesterPhone = requesterData.phoneNumber;
            }
          } catch (e) {
            console.error('Error fetching requester info:', e);
          }
        }
        
        donorBookings.push(request);
      }
      setDonorAcceptedBookings(donorBookings);
    }, (error) => {
      console.error('Error listening to donor bookings:', error);
    });

    unsubscribers.push(unsubDonorBookings);

    // ── Accepted immediate requests where I'm the donor ─────────────────────
    const donorAcceptedQuery = query(
      collection(db, 'requests'),
      where('acceptedDonorId', '==', user.uid),
      where('status', '==', 'accepted')
    );

    const unsubDonorAccepted = onSnapshot(donorAcceptedQuery, async (snapshot) => {
      const acceptedImmediate: BloodRequest[] = [];
      
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const request: BloodRequest = {
          ...data,
          id: docSnap.id,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          scheduledAt: data.scheduledAt?.toDate() || null,
          locationPermissionRequestedAt: data.locationPermissionRequestedAt?.toDate() || null,
        } as BloodRequest;
        
        if (data.requesterId && !data.requesterName) {
          try {
            const requesterDoc = await getDoc(doc(db, 'users', data.requesterId));
            if (requesterDoc.exists()) {
              const requesterData = requesterDoc.data();
              request.requesterName = requesterData.fullName;
              request.requesterPhone = requesterData.phoneNumber;
            }
          } catch (e) {
            console.error('Error fetching requester info:', e);
          }
        }
        
        if (data.requestType !== 'booking' && data.requestType !== 'scheduled') {
          acceptedImmediate.push(request);
        }
        
        if (data.locationPermissionStatus === 'pending') {
          if (!profile?.liveSharingForRequestId || profile.liveSharingForRequestId !== docSnap.id) {
            setPendingLocationRequest(request);
            setShowLocationPermissionDialog(true);
          }
        }
      }
      
      setDonorAcceptedRequests(acceptedImmediate);
    }, (error) => {
      console.error('Error listening to donor accepted requests:', error);
    });

    unsubscribers.push(unsubDonorAccepted);

    // ── Incoming listeners (only if available donor) ────────────────────────
    if (profile.isDonor && profile.donorStatus === 'available') {
      const incomingRequestsMap: Record<string, BloodRequest> = {};
      const incomingBookingsMap: Record<string, BloodRequest> = {};

      // Direct requests to me
      const directQuery = query(
        collection(db, 'requests'),
        where('targetDonorId', '==', user.uid),
        where('status', '==', 'pending')
      );

      const unsubDirect = onSnapshot(directQuery, (snapshot) => {
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const request = {
            ...data,
            id: docSnap.id,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
            scheduledAt: data.scheduledAt?.toDate() || null,
          } as BloodRequest;
          
          const isBooking = data.requestType === 'booking' || data.requestType === 'scheduled';
          if (isBooking) {
            incomingBookingsMap[docSnap.id] = request;
          } else {
            incomingRequestsMap[docSnap.id] = request;
          }
        });
        
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'removed') {
            delete incomingRequestsMap[change.doc.id];
            delete incomingBookingsMap[change.doc.id];
          }
        });

        updateIncomingRequests(incomingRequestsMap);
        setIncomingBookings(Object.values(incomingBookingsMap).sort((a, b) => 
          (a.scheduledAt?.getTime() || 0) - (b.scheduledAt?.getTime() || 0)
        ));
      });

      unsubscribers.push(unsubDirect);

      // ── FIX: Open booking requests matching blood group (no specific donor) ──
      // This is the missing listener that caused bookings not to appear for donors
      const openBookingQuery = query(
        collection(db, 'requests'),
        where('requestType', '==', 'booking'),
        where('status', '==', 'pending'),
        where('bloodGroup', '==', profile.bloodGroup)
      );

      const unsubOpenBookings = onSnapshot(openBookingQuery, (snapshot) => {
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          // Skip own requests; show if: no target donor, or I am the target donor
          // Also filter by area unless it's an amber alert
          if (
            data.requesterId !== user.uid &&
            (!data.targetDonorId || data.targetDonorId === user.uid) &&
            (!data.area || data.area === profile.area || data.isAmberAlert)
          ) {
            incomingBookingsMap[docSnap.id] = {
              ...data,
              id: docSnap.id,
              createdAt: data.createdAt?.toDate() || new Date(),
              updatedAt: data.updatedAt?.toDate() || new Date(),
              scheduledAt: data.scheduledAt?.toDate() || null,
            } as BloodRequest;
          }
        });

        snapshot.docChanges().forEach((change) => {
          if (change.type === 'removed') {
            delete incomingBookingsMap[change.doc.id];
          }
        });

        setIncomingBookings(
          Object.values(incomingBookingsMap).sort(
            (a, b) => (a.scheduledAt?.getTime() || 0) - (b.scheduledAt?.getTime() || 0)
          )
        );
      }, (error) => {
        // If index doesn't exist yet, log a helpful message
        console.error(
          'Open booking query error - you may need a Firestore composite index on: requestType, status, bloodGroup',
          error
        );
      });

      unsubscribers.push(unsubOpenBookings);
      // ── END FIX ────────────────────────────────────────────────────────────

      // Emergency requests matching my blood group
      const emergencyQuery = query(
        collection(db, 'requests'),
        where('isEmergency', '==', true),
        where('status', '==', 'pending'),
        where('bloodGroup', '==', profile.bloodGroup)
      );

      const unsubEmergency = onSnapshot(emergencyQuery, (snapshot) => {
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.requesterId !== user.uid && 
              (data.isAmberAlert || data.area === profile.area)) {
            incomingRequestsMap[docSnap.id] = {
              ...data,
              id: docSnap.id,
              createdAt: data.createdAt?.toDate() || new Date(),
              updatedAt: data.updatedAt?.toDate() || new Date(),
            } as BloodRequest;
          }
        });

        snapshot.docChanges().forEach((change) => {
          if (change.type === 'removed') {
            delete incomingRequestsMap[change.doc.id];
          }
        });

        updateIncomingRequests(incomingRequestsMap);
      });

      unsubscribers.push(unsubEmergency);
    } else {
      setIncomingRequests([]);
      setLoading(false);
    }

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [user, profile?.isDonor, profile?.donorStatus, profile?.bloodGroup, profile?.area]);

  const updateIncomingRequests = useCallback((incomingRequestsMap: Record<string, BloodRequest>) => {
    const incoming = Object.values(incomingRequestsMap);
    incoming.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    if (!isInitialLoadRef.current) {
      let hasNewRequest = false;
      incoming.forEach((request) => {
        if (!prevIncomingIdsRef.current.has(request.id) && !hasNotifiedRef.current.has(request.id)) {
          hasNotifiedRef.current.add(request.id);
          hasNewRequest = true;
          toast.success(`New blood request!`, {
            description: `${request.patientName} needs ${request.bloodGroup} blood at ${request.hospitalName}`,
            duration: 8000,
          });
        }
      });
      
      if (hasNewRequest) {
        playSound();
      }
    } else {
      incoming.forEach((request) => {
        hasNotifiedRef.current.add(request.id);
      });
    }
    
    prevIncomingIdsRef.current = new Set(incoming.map(r => r.id));
    isInitialLoadRef.current = false;
    setIncomingRequests(incoming);
    setLoading(false);
  }, [playSound]);

  const fetchRequests = useCallback(async (showRefreshing = false): Promise<void> => {
    if (showRefreshing) {
      setRefreshing(true);
      await new Promise(resolve => setTimeout(resolve, 500));
      setRefreshing(false);
      toast.success('Requests refreshed');
    }
  }, []);

  const handlePullRefresh = useCallback(async () => {
    await fetchRequests(true);
  }, [fetchRequests]);

  const { pullDistance, isRefreshing: isPullRefreshing, handlers } = usePullToRefresh({
    onRefresh: handlePullRefresh,
    threshold: 80,
    maxPull: 120,
  });

  const checkAndClearExpiredLiveLocation = async () => {
    if (!user || !profile) return;
    
    if (profile.liveSharing && profile.liveSharingExpiresAt) {
      const expiresAt = profile.liveSharingExpiresAt instanceof Date 
        ? profile.liveSharingExpiresAt 
        : new Date(profile.liveSharingExpiresAt);
      
      if (new Date() > expiresAt) {
        await updateProfile({
          liveSharing: false,
          location: null,
          liveSharingExpiresAt: null,
          liveSharingForRequestId: null,
        });
        toast.info('Your live location sharing has expired (24 hour limit).');
      }
    }
  };

  const autoExpireOldRequests = async () => {
    if (!user) return;
    
    try {
      const pendingQuery = query(
        collection(db, 'requests'),
        where('requesterId', '==', user.uid),
        where('status', '==', 'pending')
      );
      
      const snapshot = await getDocs(pendingQuery);
      const now = Date.now();
      
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const createdAt = data.createdAt?.toDate();
        
        if (createdAt && data.requestType !== 'booking' && data.requestType !== 'scheduled') {
          const age = now - createdAt.getTime();
          if (age > REQUEST_EXPIRY_MS) {
            await updateDoc(doc(db, 'requests', docSnap.id), {
              status: 'expired',
              updatedAt: new Date(),
            });
            console.log(`Auto-expired request ${docSnap.id}`);
          }
        }
      }
    } catch (error) {
      console.error('Error auto-expiring requests:', error);
    }
  };

  const handleSendReminder = async (request: BloodRequest) => {
    if (!user || !request.targetDonorId) return;
    
    if (request.lastReminderSentAt) {
      const timeSinceLastReminder = Date.now() - request.lastReminderSentAt.getTime();
      if (timeSinceLastReminder < REMINDER_COOLDOWN_MS) {
        const minutesLeft = Math.ceil((REMINDER_COOLDOWN_MS - timeSinceLastReminder) / 60000);
        toast.error(`Please wait ${minutesLeft} minutes before sending another reminder`);
        return;
      }
    }
    
    try {
      await updateDoc(doc(db, 'requests', request.id), {
        lastReminderSentAt: new Date(),
        updatedAt: new Date(),
      });
      
      await sendNotification(
        request.targetDonorId,
        'request_reminder',
        '⏰ Pending Request Reminder',
        `${request.requesterName} is waiting for your response. ${request.patientName} needs ${request.bloodGroup} blood at ${request.hospitalName}. Please accept or decline.`,
        { requestId: request.id }
      );
      
      toast.success('Reminder sent to donor!');
    } catch (error) {
      console.error('Error sending reminder:', error);
      toast.error('Failed to send reminder');
    }
  };

  const handleAcceptRequest = async (request: BloodRequest) => {
    if (!user || !profile) return;

    try {
      await updateDoc(doc(db, 'requests', request.id), {
        status: 'accepted',
        acceptedDonorId: user.uid,
        acceptedDonorName: profile.fullName,
        acceptedDonorPhone: profile.phoneNumber,
        updatedAt: new Date(),
      });

      await updateProfile({
        donorStatus: 'cooldown',
        lastDonationDate: new Date(),
      });

      await sendNotification(
        request.requesterId,
        'request_accepted',
        'Donor Found! 🎉',
        `${profile.fullName} (${profile.bloodGroup}) has accepted your blood request for ${request.patientName}. Contact them to coordinate.`,
        { 
          requestId: request.id,
          donorName: profile.fullName || '',
          donorPhone: profile.phoneNumber || '',
        }
      );

      toast.success('Request accepted! Contact the requester to coordinate.');
      fetchRequests(true);

      setAcceptedRequestForPrompt(request);
      setShowLiveLocationPrompt(true);
    } catch (error) {
      console.error('Error accepting request:', error);
      toast.error('Failed to accept request');
    }
  };

  const handleEnableLiveLocation = async (location: { lat: number; lng: number }) => {
    if (!user || !acceptedRequestForPrompt) return;
    
    const expiresAt = new Date(Date.now() + LIVE_LOCATION_EXPIRY_MS);
    
    await updateProfile({
      liveSharing: true,
      location: location,
      liveSharingExpiresAt: expiresAt,
      liveSharingForRequestId: acceptedRequestForPrompt.id,
    });

    await updateDoc(doc(db, 'requests', acceptedRequestForPrompt.id), {
      donorLiveLocation: location,
      updatedAt: new Date(),
    });
  };

  const handleSkipLiveLocation = () => {
    setAcceptedRequestForPrompt(null);
  };

  const handleToggleLiveLocation = async (enabled: boolean, location?: { lat: number; lng: number }, requestId?: string) => {
    if (!user) return;
    
    if (enabled && location && requestId) {
      const expiresAt = new Date(Date.now() + LIVE_LOCATION_EXPIRY_MS);
      
      await updateProfile({
        liveSharing: true,
        location: location,
        liveSharingExpiresAt: expiresAt,
        liveSharingForRequestId: requestId,
      });

      await updateDoc(doc(db, 'requests', requestId), {
        donorLiveLocation: location,
        updatedAt: new Date(),
      });
    } else {
      await updateProfile({
        liveSharing: false,
        location: null,
        liveSharingExpiresAt: null,
        liveSharingForRequestId: null,
      });

      if (requestId) {
        await updateDoc(doc(db, 'requests', requestId), {
          donorLiveLocation: null,
          updatedAt: new Date(),
        });
      }
    }
  };

  const handleRequestLiveLocation = async (donorId: string, donorName: string, requestId: string) => {
    if (!user || !profile) return;
    
    try {
      await updateDoc(doc(db, 'requests', requestId), {
        locationPermissionStatus: 'pending',
        locationPermissionRequestedAt: new Date(),
        updatedAt: new Date(),
      });
      
      await sendNotification(
        donorId,
        'location_request',
        '📍 Location Sharing Requested',
        `${profile.fullName} wants to track your arrival. Tap to Accept or Deny.`,
        { 
          requesterId: user.uid,
          requesterName: profile.fullName || '',
          requestId: requestId,
        }
      );
      
      toast.success(`Location request sent to ${donorName}!`);
    } catch (error) {
      console.error('Error requesting location:', error);
      toast.error('Failed to send location request');
    }
  };

  const handleAcceptLocationRequest = async (location: { lat: number; lng: number }) => {
    if (!user || !pendingLocationRequest) return;
    
    try {
      const expiresAt = new Date(Date.now() + LIVE_LOCATION_EXPIRY_MS);
      const shareId = `${pendingLocationRequest.id}_${user.uid}`;
      
      await updateProfile({
        liveSharing: true,
        location: location,
        liveSharingExpiresAt: expiresAt,
        liveSharingForRequestId: pendingLocationRequest.id,
      });

      await updateDoc(doc(db, 'locationShares', shareId), {
        status: 'accepted',
        donorLocation: { lat: location.lat, lng: location.lng },
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'requests', pendingLocationRequest.id), {
        locationPermissionStatus: 'accepted',
        donorLiveLocation: location,
        updatedAt: serverTimestamp(),
      });

      await sendNotification(
        pendingLocationRequest.requesterId,
        'location_accepted',
        '📍 Location Sharing Started',
        `${profile?.fullName || 'The donor'} has started sharing their live location! You can now track their arrival.`,
        { 
          requestId: pendingLocationRequest.id,
          donorName: profile?.fullName || '',
        }
      );

      toast.success('📍 Live location sharing enabled!');
      setPendingLocationRequest(null);
    } catch (error) {
      console.error('Error accepting location request:', error);
      toast.error('Failed to start location sharing. Please check GPS settings.');
    }
  };

  const handleDenyLocationRequest = async () => {
    if (!user || !pendingLocationRequest) return;
    
    try {
      const shareId = `${pendingLocationRequest.id}_${user.uid}`;
      
      await updateDoc(doc(db, 'locationShares', shareId), {
        status: 'denied',
        donorLocation: null,
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'requests', pendingLocationRequest.id), {
        locationPermissionStatus: 'denied',
        donorLiveLocation: null,
        updatedAt: serverTimestamp(),
      });

      await sendNotification(
        pendingLocationRequest.requesterId,
        'location_denied',
        '📍 Location Sharing Declined',
        `${profile?.fullName || 'The donor'} has declined to share their live location.`,
        { requestId: pendingLocationRequest.id }
      );

      toast.info('Location sharing declined.');
      setPendingLocationRequest(null);
    } catch (error) {
      console.error('Error denying location request:', error);
      toast.error('Failed to decline location request');
    }
  };

  const handleDeclineRequest = async (request: BloodRequest) => {
    try {
      await updateDoc(doc(db, 'requests', request.id), {
        status: 'declined',
        updatedAt: new Date(),
      });
      toast.success('Request declined');
      fetchRequests(true);
    } catch (error) {
      console.error('Error declining request:', error);
      toast.error('Failed to decline request');
    }
  };

  const handleCancelRequest = async (request: BloodRequest) => {
    try {
      await updateDoc(doc(db, 'requests', request.id), {
        status: 'cancelled',
        donorLiveLocation: null,
        updatedAt: new Date(),
      });
      
      if (profile?.liveSharingForRequestId === request.id) {
        await updateProfile({
          liveSharing: false,
          location: null,
          liveSharingExpiresAt: null,
          liveSharingForRequestId: null,
        });
      }
      
      toast.success('Request cancelled');
      fetchRequests(true);
    } catch (error) {
      console.error('Error cancelling request:', error);
      toast.error('Failed to cancel request');
    }
  };

  const handleCompleteRequest = async (request: BloodRequest) => {
    try {
      await updateDoc(doc(db, 'requests', request.id), {
        status: 'completed',
        donorLiveLocation: null,
        updatedAt: new Date(),
      });
      
      if (profile?.liveSharingForRequestId === request.id) {
        await updateProfile({
          liveSharing: false,
          location: null,
          liveSharingExpiresAt: null,
          liveSharingForRequestId: null,
        });
      }
      
      toast.success('Request marked as completed. Thank you!');
      fetchRequests(true);
    } catch (error) {
      console.error('Error completing request:', error);
      toast.error('Failed to complete request');
    }
  };

  const handleLocationShareFromPrompt = async () => {
    if (!locationShareRequestId || !user) return;
    
    try {
      const position = await getCurrentPosition();
      const expiresAt = new Date(Date.now() + LIVE_LOCATION_EXPIRY_MS);
      
      await updateProfile({
        liveSharing: true,
        location: { lat: position.lat, lng: position.lng },
        liveSharingExpiresAt: expiresAt,
        liveSharingForRequestId: locationShareRequestId,
      });

      await updateDoc(doc(db, 'requests', locationShareRequestId), {
        donorLiveLocation: { lat: position.lat, lng: position.lng },
        updatedAt: new Date(),
      });

      toast.success('📍 Live location sharing enabled! The requester can now track your arrival.');
      setShowLocationSharePrompt(false);
      setLocationShareRequestId(null);
    } catch (error) {
      console.error('Error enabling location:', error);
      toast.error('Could not get your location. Please check GPS settings.');
    }
  };

  return (
    <div 
      className="min-h-screen bg-background pb-8"
      onTouchStart={handlers.onTouchStart}
      onTouchMove={handlers.onTouchMove}
      onTouchEnd={handlers.onTouchEnd}
    >
      <LiveLocationPrompt
        open={showLiveLocationPrompt}
        onOpenChange={setShowLiveLocationPrompt}
        onEnableLiveLocation={handleEnableLiveLocation}
        onSkip={handleSkipLiveLocation}
        requesterName={acceptedRequestForPrompt?.requesterName}
      />

      <LocationPermissionRequestDialog
        open={showLocationPermissionDialog}
        onOpenChange={setShowLocationPermissionDialog}
        requesterName={pendingLocationRequest?.requesterName || 'Requester'}
        onAccept={handleAcceptLocationRequest}
        onDeny={handleDenyLocationRequest}
      />

      <Dialog open={showLocationSharePrompt} onOpenChange={setShowLocationSharePrompt}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              Share Your Location?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The requester wants to track your arrival. Your live location will be shared every minute until you stop or the donation is complete.
            </p>
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-sm">
              <div className="flex items-center gap-2 text-primary">
                <Navigation className="w-4 h-4" />
                <span className="font-medium">Real-time tracking</span>
              </div>
              <p className="text-muted-foreground mt-1">
                Help the requester prepare for your arrival
              </p>
            </div>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => {
                  setShowLocationSharePrompt(false);
                  setLocationShareRequestId(null);
                }}
              >
                Not Now
              </Button>
              <Button 
                className="flex-1"
                onClick={handleLocationShareFromPrompt}
              >
                <Navigation className="w-4 h-4 mr-2" />
                Share Location
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="container max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="font-bold text-lg">Blood Requests</h1>
            </div>
            <div className="flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => {
                  const newValue = !soundEnabled;
                  setSoundEnabledState(newValue);
                  setSoundEnabled(newValue);
                  toast.success(newValue ? 'Notification sound enabled' : 'Notification sound disabled');
                }}
                title={soundEnabled ? 'Disable notification sound' : 'Enable notification sound'}
              >
                {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5 text-muted-foreground" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => navigate('/history')}>
                <History className="w-5 h-5" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => fetchRequests(true)}
                disabled={refreshing || isPullRefreshing}
              >
                <RefreshCw className={`w-5 h-5 ${refreshing || isPullRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {profile?.liveSharing && profile?.liveSharingForRequestId && (
        <div className="bg-success/10 border-b border-success/20 px-4 py-2">
          <div className="container max-w-2xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
              <span className="text-sm text-success font-medium">
                Sharing live location
              </span>
              {isLocationUpdating && (
                <span className="text-xs text-success/70">(updating every 1 min)</span>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => handleToggleLiveLocation(false, undefined, profile.liveSharingForRequestId || undefined)}
            >
              <XCircle className="w-3 h-3 mr-1" />
              Stop
            </Button>
          </div>
        </div>
      )}

      <PullToRefreshIndicator 
        pullDistance={pullDistance} 
        isRefreshing={isPullRefreshing}
        threshold={80}
      />

      <main className="container max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Quick Stats Bar */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-card border rounded-xl p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-primary mb-0.5">
              <Bell className="w-3.5 h-3.5" />
              <span className="text-base font-bold">{incomingRequests.length + incomingBookings.length}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Incoming</p>
          </div>
          <div className="bg-card border rounded-xl p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-success mb-0.5">
              <Navigation className="w-3.5 h-3.5" />
              <span className="text-base font-bold">{outgoingRequests.filter(r => r.status === 'accepted').length + donorAcceptedRequests.length}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Ongoing</p>
          </div>
          <div className="bg-card border rounded-xl p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-warning mb-0.5">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-base font-bold">{outgoingRequests.filter(r => r.status === 'pending').length + bookingRequests.filter(r => r.status === 'pending').length}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Pending</p>
          </div>
          <div className="bg-card border rounded-xl p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-primary mb-0.5">
              <Calendar className="w-3.5 h-3.5" />
              <span className="text-base font-bold">{bookingRequests.filter(r => r.status === 'accepted').length + donorAcceptedBookings.filter(r => r.status === 'accepted').length}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Scheduled</p>
          </div>
        </div>

        <Tabs defaultValue={activeTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 h-12 p-1 bg-muted/50">
            <TabsTrigger value="incoming" className="relative flex items-center justify-center gap-1 data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs sm:text-sm">
              <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Incoming</span>
              {(incomingRequests.length + incomingBookings.length) > 0 && (
                <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 text-[9px] font-bold bg-primary text-primary-foreground rounded-full">
                  {incomingRequests.length + incomingBookings.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="ongoing" className="relative flex items-center justify-center gap-1 data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs sm:text-sm">
              <Navigation className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Ongoing</span>
              {(outgoingRequests.filter(r => r.status === 'accepted').length + donorAcceptedRequests.length) > 0 && (
                <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 text-[9px] font-bold bg-success text-success-foreground rounded-full animate-pulse">
                  {outgoingRequests.filter(r => r.status === 'accepted').length + donorAcceptedRequests.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="outgoing" className="flex items-center justify-center gap-1 data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs sm:text-sm">
              <Siren className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Requests</span>
              {outgoingRequests.filter(r => r.status === 'pending').length > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  ({outgoingRequests.filter(r => r.status === 'pending').length})
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="scheduled" className="flex items-center justify-center gap-1 data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs sm:text-sm">
              <Timer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Scheduled</span>
              {(bookingRequests.filter(r => r.status === 'accepted').length + donorAcceptedBookings.filter(r => r.status === 'accepted').length) > 0 && (
                <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 text-[9px] font-bold bg-success text-success-foreground rounded-full">
                  {bookingRequests.filter(r => r.status === 'accepted').length + donorAcceptedBookings.filter(r => r.status === 'accepted').length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* INCOMING TAB */}
          <TabsContent value="incoming" className="space-y-4">
            {loading ? (
              <LoadingState />
            ) : (incomingRequests.length === 0 && incomingBookings.length === 0) ? (
              <EmptyState 
                message={
                  profile?.isDonor && profile?.donorStatus === 'available'
                    ? "No pending requests for your blood type"
                    : profile?.donorStatus === 'cooldown'
                    ? "You're in cooldown period. Requests will appear when you're available again."
                    : "Enable donor mode in your profile to receive requests"
                } 
              />
            ) : (
              <>
                {incomingBookings.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <Calendar className="w-4 h-4" />
                      Scheduled Booking Requests ({incomingBookings.length})
                    </div>
                    {incomingBookings.map((request) => (
                      <IncomingBookingCard
                        key={request.id}
                        request={request}
                        onAccept={() => handleAcceptRequest(request)}
                        onDecline={() => handleDeclineRequest(request)}
                        userLocation={userLocation}
                      />
                    ))}
                  </div>
                )}
                
                {incomingRequests.length > 0 && (
                  <div className="space-y-3">
                    {incomingBookings.length > 0 && (
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground pt-2">
                        <AlertCircle className="w-4 h-4" />
                        Immediate Requests ({incomingRequests.length})
                      </div>
                    )}
                    {incomingRequests.map((request) => (
                      <IncomingRequestCard
                        key={request.id}
                        request={request}
                        onAccept={() => handleAcceptRequest(request)}
                        onDecline={() => handleDeclineRequest(request)}
                        userLocation={userLocation}
                        isHighlighted={highlightedId === request.id}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* ONGOING TAB */}
          <TabsContent value="ongoing" className="space-y-4">
            {loading ? (
              <LoadingState />
            ) : (outgoingRequests.filter(r => r.status === 'accepted').length === 0 && donorAcceptedRequests.length === 0) ? (
              <EmptyState message="No ongoing donations. Accepted requests will appear here with live tracking, chat, and call options." />
            ) : (
              <>
                {outgoingRequests.filter(r => r.status === 'accepted').length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <Eye className="w-4 h-4" />
                      My Requests - Donor Found ({outgoingRequests.filter(r => r.status === 'accepted').length})
                    </div>
                    {outgoingRequests.filter(r => r.status === 'accepted').map((request) => (
                      <OutgoingRequestCard
                        key={request.id}
                        request={request}
                        onCancel={() => handleCancelRequest(request)}
                        onComplete={() => handleCompleteRequest(request)}
                        onRemind={() => handleSendReminder(request)}
                        onRequestLocation={handleRequestLiveLocation}
                        isHighlighted={highlightedId === request.id}
                      />
                    ))}
                  </div>
                )}

                {donorAcceptedRequests.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-success">
                      <Navigation className="w-4 h-4" />
                      Helping as Donor ({donorAcceptedRequests.length})
                    </div>
                    {donorAcceptedRequests.map((request) => (
                      <OngoingDonorCard
                        key={request.id}
                        request={request}
                        onComplete={() => handleCompleteRequest(request)}
                        onToggleLiveLocation={handleToggleLiveLocation}
                        isSharing={profile?.liveSharing && profile?.liveSharingForRequestId === request.id}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* MY REQUESTS TAB */}
          <TabsContent value="outgoing" className="space-y-4">
            {loading ? (
              <LoadingState />
            ) : (outgoingRequests.filter(r => r.status === 'pending').length === 0 && bookingRequests.filter(r => r.status === 'pending').length === 0) ? (
              <EmptyState message="No pending requests. Create a new request from the home page." />
            ) : (
              <>
                {bookingRequests.filter(r => r.status === 'pending').length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <Calendar className="w-4 h-4" />
                      Pending Bookings ({bookingRequests.filter(r => r.status === 'pending').length})
                    </div>
                    {bookingRequests.filter(r => r.status === 'pending').map((request) => (
                      <PendingBookingCard
                        key={request.id}
                        request={request}
                        onCancel={() => handleCancelRequest(request)}
                        onRemind={() => handleSendReminder(request)}
                      />
                    ))}
                  </div>
                )}
                
                {outgoingRequests.filter(r => r.status === 'pending').length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground pt-2">
                      <AlertCircle className="w-4 h-4" />
                      Pending Requests ({outgoingRequests.filter(r => r.status === 'pending').length})
                    </div>
                    {outgoingRequests.filter(r => r.status === 'pending').map((request) => (
                      <OutgoingRequestCard
                        key={request.id}
                        request={request}
                        onCancel={() => handleCancelRequest(request)}
                        onComplete={() => handleCompleteRequest(request)}
                        onRemind={() => handleSendReminder(request)}
                        onRequestLocation={handleRequestLiveLocation}
                        isHighlighted={highlightedId === request.id}
                      />
                    ))}
                  </div>
                )}

                {outgoingRequests.filter(r => ['cancelled','declined','expired','completed'].includes(r.status)).length > 0 && (
                  <Card 
                    className="border-dashed cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => navigate('/history')}
                  >
                    <CardContent className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <History className="w-4 h-4" />
                        <span>View {outgoingRequests.filter(r => ['cancelled','declined','expired','completed'].includes(r.status)).length} past requests in History</span>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* SCHEDULED TAB */}
          <TabsContent value="scheduled" className="space-y-4">
            {loading ? (
              <LoadingState />
            ) : (bookingRequests.filter(r => r.status === 'accepted').length === 0 && donorAcceptedBookings.filter(r => r.status === 'accepted').length === 0) ? (
              <EmptyState message="No confirmed scheduled donations yet. Once a donor accepts your booking (or you accept one), it will appear here with a countdown." />
            ) : (
              <div className="space-y-4">
                {bookingRequests.filter(r => r.status === 'accepted').length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-success">
                      <CheckCircle className="w-4 h-4" />
                      My Confirmed Bookings ({bookingRequests.filter(r => r.status === 'accepted').length})
                    </div>
                    {bookingRequests.filter(r => r.status === 'accepted').map((request) => (
                      <BookingCard
                        key={request.id}
                        request={request}
                        onCancel={() => handleCancelRequest(request)}
                        onComplete={() => handleCompleteRequest(request)}
                        onToggleLiveLocation={handleToggleLiveLocation}
                        isDonorView={false}
                        isSharing={false}
                      />
                    ))}
                  </div>
                )}
                
                {donorAcceptedBookings.filter(r => r.status === 'accepted').length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <Calendar className="w-4 h-4" />
                      Donations I'm Scheduled For ({donorAcceptedBookings.filter(r => r.status === 'accepted').length})
                    </div>
                    {donorAcceptedBookings.filter(r => r.status === 'accepted').map((request) => (
                      <BookingCard
                        key={request.id}
                        request={request}
                        onCancel={() => handleCancelRequest(request)}
                        onComplete={() => handleCompleteRequest(request)}
                        onToggleLiveLocation={handleToggleLiveLocation}
                        isDonorView={true}
                        isSharing={profile?.liveSharing && profile?.liveSharingForRequestId === request.id}
                      />
                    ))}
                  </div>
                )}

                {[...bookingRequests, ...donorAcceptedBookings].filter(r => ['cancelled','completed'].includes(r.status)).length > 0 && (
                  <Card 
                    className="border-dashed cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => navigate('/history')}
                  >
                    <CardContent className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <History className="w-4 h-4" />
                        <span>View past bookings in History</span>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

const LoadingState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-12">
    <BloodDropIcon className="w-10 h-10 text-primary animate-blood-pulse" />
    <p className="mt-4 text-muted-foreground">Loading requests...</p>
  </div>
);

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <Card className="border-dashed">
    <CardContent className="p-8 text-center text-muted-foreground">
      <BloodDropIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
      <p>{message}</p>
    </CardContent>
  </Card>
);

interface IncomingRequestCardProps {
  request: BloodRequest;
  onAccept: () => void;
  onDecline: () => void;
  userLocation?: { lat: number; lng: number } | null;
  isHighlighted?: boolean;
}

const IncomingRequestCard: React.FC<IncomingRequestCardProps> = ({ request, onAccept, onDecline, userLocation, isHighlighted }) => {
  const [showProfile, setShowProfile] = useState(false);
  const [showAcceptDialog, setShowAcceptDialog] = useState(false);
  const [showDeclineDialog, setShowDeclineDialog] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (isHighlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isHighlighted]);

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const getDistanceAndETA = () => {
    if (!userLocation || !request.hospitalLocation?.lat || !request.hospitalLocation?.lng) return null;
    const R = 6371;
    const dLat = ((request.hospitalLocation.lat - userLocation.lat) * Math.PI) / 180;
    const dLng = ((request.hospitalLocation.lng - userLocation.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((userLocation.lat * Math.PI) / 180) *
        Math.cos((request.hospitalLocation.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const etaMinutes = Math.round((distanceKm / 25) * 60);
    return {
      distance: distanceKm < 1 ? `${Math.round(distanceKm * 1000)}m` : `${distanceKm.toFixed(1)}km`,
      eta: etaMinutes < 60 ? `~${etaMinutes} min` : `~${Math.floor(etaMinutes / 60)}h ${etaMinutes % 60}m`,
    };
  };

  const distanceInfo = getDistanceAndETA();

  return (
    <>
      <Card 
        ref={cardRef}
        className={`animate-fade-in transition-all duration-500 ${
          isHighlighted ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
        } ${
          request.isAmberAlert 
            ? 'border-destructive/50 bg-destructive/5' 
            : request.isEmergency 
            ? 'border-primary/50 bg-primary/5' 
            : ''
        }`}
      >
        <CardContent className="p-4 space-y-4">
          {request.isAmberAlert ? (
            <div className="flex items-center gap-2 text-destructive font-medium">
              <Siren className="w-4 h-4" />
              AMBER ALERT - Urgent Request
            </div>
          ) : request.isEmergency && (
            <div className="flex items-center gap-2 text-primary font-medium">
              <AlertCircle className="w-4 h-4" />
              Emergency Request
            </div>
          )}

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <BloodGroupBadge bloodGroup={request.bloodGroup} size="lg" />
              <div>
                <h4 className="font-semibold">{request.patientName}</h4>
                <p className="text-sm text-muted-foreground">
                  {request.bagsNeeded} bag{request.bagsNeeded > 1 ? 's' : ''} needed
                </p>
              </div>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <Clock className="w-3.5 h-3.5 inline mr-1" />
              {formatDistanceToNow(request.createdAt, { addSuffix: true })}
            </div>
          </div>

          <div 
            className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-secondary/50 cursor-pointer transition-colors"
            onClick={() => setShowProfile(true)}
          >
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {request.requesterName ? getInitials(request.requesterName) : <User className="w-4 h-4" />}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Requested by {request.requesterName}</p>
              <p className="text-xs text-muted-foreground">{request.requesterPhone}</p>
            </div>
            <Eye className="w-4 h-4 text-muted-foreground" />
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="line-clamp-1">{request.hospitalName}, {request.area}</span>
            </div>
            {distanceInfo && (
              <div className="flex items-center gap-3 p-2 bg-secondary/50 rounded-lg">
                <div className="flex items-center gap-1.5 text-primary">
                  <Navigation className="w-3.5 h-3.5" />
                  <span className="font-medium">{distanceInfo.distance}</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{distanceInfo.eta}</span>
                </div>
              </div>
            )}
            {request.notes && (
              <p className="text-muted-foreground italic pl-6">"{request.notes}"</p>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                const url = request.hospitalLocation?.lat && request.hospitalLocation?.lng
                  ? `https://www.google.com/maps/dir/?api=1&destination=${request.hospitalLocation.lat},${request.hospitalLocation.lng}&travelmode=driving`
                  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${request.hospitalName}, ${request.area}, Bangladesh`)}`;
                window.open(url, "_blank", "noopener,noreferrer");
              }}
            >
              <Navigation className="w-4 h-4 mr-1" />
              Navigate
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowDeclineDialog(true)}>
              <XCircle className="w-4 h-4 mr-1" />
              Decline
            </Button>
            <Button size="sm" className="flex-1" onClick={() => setShowAcceptDialog(true)}>
              <CheckCircle className="w-4 h-4 mr-1" />
              Accept
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={showAcceptDialog}
        onOpenChange={setShowAcceptDialog}
        title="Accept Blood Request?"
        description={`You are about to accept the blood donation request for ${request.patientName}. This will set your donor status to cooldown for 3 months.`}
        confirmLabel="Yes, Accept"
        cancelLabel="Cancel"
        variant="accept"
        onConfirm={() => { setShowAcceptDialog(false); onAccept(); }}
      />
      <ConfirmationDialog
        open={showDeclineDialog}
        onOpenChange={setShowDeclineDialog}
        title="Decline Blood Request?"
        description={`Are you sure you want to decline the blood donation request for ${request.patientName}? The requester will be notified.`}
        confirmLabel="Yes, Decline"
        cancelLabel="Cancel"
        variant="decline"
        onConfirm={() => { setShowDeclineDialog(false); onDecline(); }}
      />
      <ProfileViewDialog
        open={showProfile}
        onOpenChange={setShowProfile}
        userId={request.requesterId}
        userName={request.requesterName}
      />
    </>
  );
};

interface OutgoingRequestCardProps {
  request: BloodRequest;
  onCancel: () => void;
  onComplete: () => void;
  onRemind: () => void;
  onRequestLocation: (donorId: string, donorName: string, requestId: string) => void;
  isHighlighted?: boolean;
}

const OutgoingRequestCard: React.FC<OutgoingRequestCardProps> = ({ request, onCancel, onComplete, onRemind, onRequestLocation, isHighlighted }) => {
  const [showTrackingMap, setShowTrackingMap] = useState(false);
  const [showDonorProfile, setShowDonorProfile] = useState(false);
  const [donorLocation, setDonorLocation] = useState<UserLocation | null>(request.donorLiveLocation || null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (isHighlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isHighlighted]);

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  
  useEffect(() => {
    if (request.status !== 'accepted' || !request.acceptedDonorId) return;

    const unsubRequest = onSnapshot(doc(db, 'requests', request.id), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const permissionStatus = data.locationPermissionStatus;
        if (permissionStatus === 'denied') {
          setDonorLocation(null); setAccuracy(null); return;
        }
        if (data.donorLiveLocation?.lat && data.donorLiveLocation?.lng && permissionStatus === 'accepted') {
          setDonorLocation({ lat: data.donorLiveLocation.lat, lng: data.donorLiveLocation.lng });
          setLastUpdated(data.updatedAt?.toDate() || new Date());
          setAccuracy(data.donorLiveLocation.accuracy || null);
        } else {
          setDonorLocation(null); setAccuracy(null);
        }
      }
    });

    const unsubDonor = onSnapshot(doc(db, 'users', request.acceptedDonorId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (
          data.liveSharing &&
          data.liveSharingForRequestId === request.id &&
          data.location?.lat &&
          data.location?.lng &&
          request.locationPermissionStatus !== 'denied'
        ) {
          setDonorLocation({ lat: data.location.lat, lng: data.location.lng });
          setLastUpdated(new Date());
          setAccuracy(data.location.accuracy || null);
        }
      }
    });

    return () => { unsubRequest(); unsubDonor(); };
  }, [request.id, request.status, request.acceptedDonorId]);

  const statusConfig = {
    pending:   { label: 'Pending',   className: 'bg-warning/10 text-warning' },
    accepted:  { label: 'Accepted',  className: 'bg-success/10 text-success' },
    declined:  { label: 'Declined',  className: 'bg-destructive/10 text-destructive' },
    completed: { label: 'Completed', className: 'bg-success/10 text-success' },
    cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
  };
  const config = statusConfig[request.status as keyof typeof statusConfig] || statusConfig.pending;

  return (
    <>
      <Card 
        ref={cardRef}
        className={`animate-fade-in transition-all duration-500 ${isHighlighted ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
      >
        <CardContent className="p-4 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <BloodGroupBadge bloodGroup={request.bloodGroup} size="lg" />
              <div>
                <h4 className="font-semibold">{request.patientName}</h4>
                <p className="text-sm text-muted-foreground">
                  {request.bagsNeeded} bag{request.bagsNeeded > 1 ? 's' : ''} at {request.hospitalName}
                </p>
              </div>
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
              {config.label}
            </span>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            {formatDistanceToNow(request.createdAt, { addSuffix: true })}
            {request.isAmberAlert ? (
              <span className="flex items-center gap-1 text-destructive">
                <Siren className="w-3.5 h-3.5" />Amber Alert
              </span>
            ) : request.isEmergency && (
              <span className="flex items-center gap-1 text-primary">
                <AlertCircle className="w-3.5 h-3.5" />Emergency
              </span>
            )}
          </div>

          {request.status === 'accepted' && (
            <div className="p-3 rounded-lg bg-success/10 border border-success/20 space-y-3">
              <div 
                className="flex items-center gap-3 p-2 -m-2 rounded-lg hover:bg-success/10 cursor-pointer transition-colors"
                onClick={() => request.acceptedDonorId && setShowDonorProfile(true)}
              >
                <Avatar className="w-10 h-10 border-2 border-success/30">
                  <AvatarFallback className="bg-success/20 text-success">
                    {request.acceptedDonorName ? getInitials(request.acceptedDonorName) : <User className="w-4 h-4" />}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-sm font-medium text-success">A donor has accepted your request!</p>
                  {request.acceptedDonorName && (
                    <p className="text-sm text-muted-foreground font-medium">{request.acceptedDonorName}</p>
                  )}
                </div>
                <Eye className="w-4 h-4 text-success/60" />
              </div>
              
              {donorLocation ? (
                <div className="flex items-center gap-2 p-2 bg-primary/10 border border-primary/20 rounded-lg">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                  <span className="text-sm text-primary font-medium">Donor is sharing live location</span>
                  <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => setShowTrackingMap(true)}>
                    <Eye className="w-3 h-3 mr-1" />Track
                  </Button>
                </div>
              ) : request.locationPermissionStatus === 'pending' ? (
                <div className="flex items-center gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                  <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">Waiting for donor to share location...</span>
                </div>
              ) : request.locationPermissionStatus === 'denied' ? (
                <div className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <XCircle className="w-4 h-4 text-destructive" />
                  <span className="text-sm text-destructive">Donor declined location sharing</span>
                  <Button size="sm" variant="outline" className="ml-auto h-7 text-xs"
                    onClick={() => request.acceptedDonorId && onRequestLocation(request.acceptedDonorId, request.acceptedDonorName || 'Donor', request.id)}>
                    <Navigation className="w-3 h-3 mr-1" />Request Again
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-2 bg-muted border border-border rounded-lg">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Live location not shared yet</span>
                  <Button size="sm" variant="outline" className="ml-auto h-7 text-xs"
                    onClick={() => request.acceptedDonorId && onRequestLocation(request.acceptedDonorId, request.acceptedDonorName || 'Donor', request.id)}>
                    <Navigation className="w-3 h-3 mr-1" />Request Location
                  </Button>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                {request.acceptedDonorPhone && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`tel:${request.acceptedDonorPhone}`}>
                      <Phone className="w-4 h-4 mr-1" />Call
                    </a>
                  </Button>
                )}
                {request.acceptedDonorId && (
                  <ChatButton requestId={request.id} recipientId={request.acceptedDonorId} recipientName={request.acceptedDonorName || 'Donor'} />
                )}
                {donorLocation && (
                  <Button size="sm" variant="outline" onClick={() => setShowTrackingMap(true)}>
                    <Navigation className="w-4 h-4 mr-1" />Track Donor
                  </Button>
                )}
                <Button size="sm" onClick={onComplete}>
                  <CheckCircle className="w-4 h-4 mr-1" />Complete
                </Button>
              </div>
            </div>
          )}

          {request.status === 'pending' && (
            <div className="flex gap-2 flex-wrap">
              {request.targetDonorId && (
                <Button 
                  variant="outline" size="sm" onClick={onRemind}
                  disabled={!!(request.lastReminderSentAt && (Date.now() - request.lastReminderSentAt.getTime() < REMINDER_COOLDOWN_MS))}
                >
                  <Bell className="w-4 h-4 mr-1" />
                  {request.lastReminderSentAt && (Date.now() - request.lastReminderSentAt.getTime() < REMINDER_COOLDOWN_MS) 
                    ? `Wait ${Math.ceil((REMINDER_COOLDOWN_MS - (Date.now() - request.lastReminderSentAt.getTime())) / 60000)}m`
                    : 'Remind'}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onCancel}>Cancel Request</Button>
            </div>
          )}

          {request.status === 'expired' && (
            <div className="p-2 rounded-lg bg-muted text-muted-foreground text-sm">
              This request expired after 24 hours without response.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showTrackingMap} onOpenChange={setShowTrackingMap}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Navigation className="w-5 h-5 text-primary" />
              Track {request.acceptedDonorName || 'Donor'}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-[400px]">
            <DonorTrackingMap
              donorLocation={donorLocation}
              hospitalLocation={request.hospitalLocation}
              donorName={request.acceptedDonorName || 'Donor'}
              lastUpdated={lastUpdated}
              isSharing={!!donorLocation}
              accuracy={accuracy}
            />
          </div>
        </DialogContent>
      </Dialog>

      {request.acceptedDonorId && (
        <ProfileViewDialog
          open={showDonorProfile}
          onOpenChange={setShowDonorProfile}
          userId={request.acceptedDonorId}
          userName={request.acceptedDonorName}
        />
      )}
    </>
  );
};

interface PendingBookingCardProps {
  request: BloodRequest;
  onCancel: () => void;
  onRemind: () => void;
}

const PendingBookingCard: React.FC<PendingBookingCardProps> = ({ request, onCancel, onRemind }) => {
  const getScheduledDateString = () => {
    if (!request.scheduledAt) return '';
    return format(new Date(request.scheduledAt), 'PPP p');
  };

  return (
    <Card className="animate-fade-in border-2 border-primary/20 bg-primary/5">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">Scheduled Booking</span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning">
            Awaiting Response
          </span>
        </div>

        {request.scheduledAt && (
          <div className="p-3 rounded-lg bg-secondary/50 border border-secondary">
            <div className="flex items-center gap-2">
              <Timer className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Scheduled for</p>
                <p className="font-semibold">{getScheduledDateString()}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <BloodGroupBadge bloodGroup={request.bloodGroup} size="lg" />
            <div>
              <h4 className="font-semibold">{request.patientName}</h4>
              <p className="text-sm text-muted-foreground">
                {request.bagsNeeded} bag{request.bagsNeeded > 1 ? 's' : ''} at {request.hospitalName}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="line-clamp-1">{request.hospitalName}, {request.area}</span>
        </div>

        {request.targetDonorId && (
          <div className="p-2 rounded-lg bg-secondary/50 text-sm">
            <span className="text-muted-foreground">Direct request to a specific donor</span>
          </div>
        )}

        <div className="flex gap-2 flex-wrap pt-2">
          {request.targetDonorId && (
            <Button 
              variant="outline" size="sm" onClick={onRemind}
              disabled={!!(request.lastReminderSentAt && (Date.now() - request.lastReminderSentAt.getTime() < REMINDER_COOLDOWN_MS))}
            >
              <Bell className="w-4 h-4 mr-1" />
              {request.lastReminderSentAt && (Date.now() - request.lastReminderSentAt.getTime() < REMINDER_COOLDOWN_MS) 
                ? `Wait ${Math.ceil((REMINDER_COOLDOWN_MS - (Date.now() - request.lastReminderSentAt.getTime())) / 60000)}m`
                : 'Remind'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel Booking</Button>
        </div>
      </CardContent>
    </Card>
  );
};

interface OngoingDonorCardProps {
  request: BloodRequest;
  onComplete: () => void;
  onToggleLiveLocation: (enabled: boolean, location?: { lat: number; lng: number }, requestId?: string) => void;
  isSharing?: boolean;
}

const OngoingDonorCard: React.FC<OngoingDonorCardProps> = ({ request, onComplete, onToggleLiveLocation, isSharing = false }) => {
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [isEnablingLocation, setIsEnablingLocation] = useState(false);
  const { getCurrentPosition } = useGeolocation();

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const handleEnableLocationSharing = async () => {
    setIsEnablingLocation(true);
    try {
      const position = await getCurrentPosition();
      onToggleLiveLocation(true, { lat: position.lat, lng: position.lng }, request.id);
      toast.success('Live location sharing enabled!');
    } catch (error) {
      toast.error('Could not get your location. Please check GPS settings.');
    } finally {
      setIsEnablingLocation(false);
    }
  };

  const openNavigation = () => {
    const url = request.hospitalLocation?.lat && request.hospitalLocation?.lng
      ? `https://www.google.com/maps/dir/?api=1&destination=${request.hospitalLocation.lat},${request.hospitalLocation.lng}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${request.hospitalName}, ${request.area}, Bangladesh`)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <Card className="animate-fade-in border-2 border-success/30 bg-success/5">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Navigation className="w-4 h-4 text-success" />
              <span className="text-sm font-medium text-success">Active Donation</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">In Progress</span>
          </div>

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <BloodGroupBadge bloodGroup={request.bloodGroup} size="lg" />
              <div>
                <h4 className="font-semibold">{request.patientName}</h4>
                <p className="text-sm text-muted-foreground">
                  {request.bagsNeeded} bag{request.bagsNeeded > 1 ? 's' : ''} needed
                </p>
              </div>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <Clock className="w-3.5 h-3.5 inline mr-1" />
              {formatDistanceToNow(request.createdAt, { addSuffix: true })}
            </div>
          </div>

          <div 
            className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20 cursor-pointer hover:bg-primary/15 transition-colors"
            onClick={() => setShowProfileDialog(true)}
          >
            <Avatar className="w-10 h-10 border-2 border-primary/30">
              <AvatarFallback className="bg-primary/20 text-primary">
                {request.requesterName ? getInitials(request.requesterName) : <User className="w-4 h-4" />}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="text-sm font-medium text-primary">You're helping</p>
              <p className="text-sm">{request.requesterName}</p>
            </div>
            <Eye className="w-4 h-4 text-primary/60" />
          </div>

          <div className="flex items-center gap-2 text-sm">
            <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="line-clamp-1">{request.hospitalName}, {request.area}</span>
          </div>

          {isSharing ? (
            <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/20 rounded-lg">
              <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
              <span className="text-sm text-success font-medium flex-1">Sharing your live location</span>
              <Button size="sm" variant="outline" className="h-7 text-xs border-success/30"
                onClick={() => onToggleLiveLocation(false, undefined, request.id)}>
                Stop Sharing
              </Button>
            </div>
          ) : request.locationPermissionStatus === 'pending' ? (
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              <span className="text-sm text-amber-600 dark:text-amber-400 font-medium flex-1">Location request pending</span>
              <Button size="sm" onClick={handleEnableLocationSharing} disabled={isEnablingLocation} className="h-7 text-xs">
                {isEnablingLocation ? 'Getting...' : 'Share Location'}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-muted border border-border rounded-lg">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground flex-1">Share your location to help the requester track you</span>
              <Button size="sm" variant="outline" onClick={handleEnableLocationSharing} disabled={isEnablingLocation} className="h-7 text-xs">
                <Navigation className="w-3 h-3 mr-1" />
                {isEnablingLocation ? 'Getting...' : 'Share'}
              </Button>
            </div>
          )}

          <div className="flex gap-2 flex-wrap pt-2">
            {request.requesterPhone && (
              <Button size="sm" variant="outline" asChild>
                <a href={`tel:${request.requesterPhone}`}><Phone className="w-4 h-4 mr-1" />Call</a>
              </Button>
            )}
            {request.requesterId && (
              <ChatButton requestId={request.id} recipientId={request.requesterId} recipientName={request.requesterName || 'Requester'} />
            )}
            <Button size="sm" variant="outline" onClick={openNavigation}>
              <Navigation className="w-4 h-4 mr-1" />Navigate
            </Button>
            <Button size="sm" onClick={onComplete}>
              <CheckCircle className="w-4 h-4 mr-1" />Complete
            </Button>
          </div>
        </CardContent>
      </Card>

      {request.requesterId && (
        <ProfileViewDialog open={showProfileDialog} onOpenChange={setShowProfileDialog} userId={request.requesterId} userName={request.requesterName} />
      )}
    </>
  );
};

interface BookingCardProps {
  request: BloodRequest;
  onCancel: () => void;
  onComplete: () => void;
  onToggleLiveLocation: (enabled: boolean, location?: { lat: number; lng: number }, requestId?: string) => void;
  isDonorView?: boolean;
  isSharing?: boolean;
}

const BookingCard: React.FC<BookingCardProps> = ({ request, onCancel, onComplete, onToggleLiveLocation, isDonorView = false, isSharing = false }) => {
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [countdown, setCountdown] = useState<string>('');
  const [urgencyLevel, setUrgencyLevel] = useState<'normal' | 'soon' | 'imminent' | 'now'>('normal');
  const [isEnablingLocation, setIsEnablingLocation] = useState(false);
  const { getCurrentPosition } = useGeolocation();

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const handleEnableLocationSharing = async () => {
    setIsEnablingLocation(true);
    try {
      const position = await getCurrentPosition();
      onToggleLiveLocation(true, { lat: position.lat, lng: position.lng }, request.id);
      toast.success('Live location sharing enabled!');
    } catch (error) {
      toast.error('Could not get your location. Please check GPS settings.');
    } finally {
      setIsEnablingLocation(false);
    }
  };

  const openNavigation = (hospitalLocation: { lat?: number; lng?: number } | undefined, hospitalName: string, area: string) => {
    const url = hospitalLocation?.lat && hospitalLocation?.lng
      ? `https://www.google.com/maps/dir/?api=1&destination=${hospitalLocation.lat},${hospitalLocation.lng}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${hospitalName}, ${area}, Bangladesh`)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    if (!request.scheduledAt) return;

    const updateCountdown = () => {
      const now = new Date();
      const scheduled = new Date(request.scheduledAt!);
      const diffMs = scheduled.getTime() - now.getTime();
      
      if (diffMs <= 0) {
        setCountdown('Time has arrived!'); setUrgencyLevel('now'); return;
      }
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      
      if (hours >= 24) {
        setCountdown(`${Math.floor(hours / 24)}d ${hours % 24}h remaining`); setUrgencyLevel('normal');
      } else if (hours >= 1) {
        setCountdown(`${hours}h ${minutes}m remaining`); setUrgencyLevel(hours <= 1 ? 'soon' : 'normal');
      } else if (minutes >= 5) {
        setCountdown(`${minutes}m remaining`); setUrgencyLevel('imminent');
      } else {
        setCountdown(`${minutes}m remaining - Almost time!`); setUrgencyLevel('now');
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, [request.scheduledAt]);

  const urgencyStyles = {
    normal:   'bg-secondary/50 border-secondary',
    soon:     'bg-warning/10 border-warning/30',
    imminent: 'bg-primary/10 border-primary/30',
    now:      'bg-destructive/10 border-destructive/30 animate-pulse',
  };

  const statusConfig = {
    pending:   { label: 'Awaiting Response', className: 'bg-warning/10 text-warning' },
    accepted:  { label: 'Confirmed',         className: 'bg-success/10 text-success' },
    declined:  { label: 'Declined',          className: 'bg-destructive/10 text-destructive' },
    completed: { label: 'Completed',         className: 'bg-success/10 text-success' },
    cancelled: { label: 'Cancelled',         className: 'bg-muted text-muted-foreground' },
    expired:   { label: 'Expired',           className: 'bg-muted text-muted-foreground' },
  };
  const config = statusConfig[request.status as keyof typeof statusConfig] || statusConfig.pending;

  return (
    <>
      <Card className={`animate-fade-in border ${urgencyStyles[urgencyLevel]}`}>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Scheduled Booking</span>
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
              {config.label}
            </span>
          </div>

          {request.scheduledAt && request.status !== 'completed' && request.status !== 'cancelled' && (
            <div className={`p-3 rounded-lg border ${urgencyStyles[urgencyLevel]}`}>
              <div className="flex items-center gap-2">
                <Timer className={`w-5 h-5 ${urgencyLevel === 'now' ? 'text-destructive' : urgencyLevel === 'imminent' ? 'text-primary' : 'text-muted-foreground'}`} />
                <div>
                  <p className="text-sm text-muted-foreground">Scheduled for</p>
                  <p className="font-semibold">{format(new Date(request.scheduledAt), 'PPP p')}</p>
                  <p className={`text-sm font-medium ${urgencyLevel === 'now' ? 'text-destructive' : urgencyLevel === 'imminent' ? 'text-primary' : 'text-warning'}`}>
                    {countdown}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <BloodGroupBadge bloodGroup={request.bloodGroup} size="lg" />
              <div>
                <h4 className="font-semibold">{request.patientName}</h4>
                <p className="text-sm text-muted-foreground">
                  {request.bagsNeeded} bag{request.bagsNeeded > 1 ? 's' : ''} at {request.hospitalName}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="line-clamp-1">{request.hospitalName}, {request.area}</span>
          </div>

          {request.status === 'accepted' && !isDonorView && request.acceptedDonorId && (
            <div className="p-3 rounded-lg bg-success/10 border border-success/20 space-y-3">
              <div 
                className="flex items-center gap-3 cursor-pointer hover:bg-success/10 rounded-lg p-2 -m-2 transition-colors"
                onClick={() => setShowProfileDialog(true)}
              >
                <Avatar className="w-10 h-10 border-2 border-success/30">
                  <AvatarFallback className="bg-success/20 text-success">
                    {request.acceptedDonorName ? getInitials(request.acceptedDonorName) : <User className="w-4 h-4" />}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-sm font-medium text-success">Donor Confirmed</p>
                  <p className="text-sm">{request.acceptedDonorName}</p>
                </div>
                <Eye className="w-4 h-4 text-success/60" />
              </div>
              <div className="flex gap-2 flex-wrap">
                {request.acceptedDonorPhone && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`tel:${request.acceptedDonorPhone}`}><Phone className="w-4 h-4 mr-1" />Call Donor</a>
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => openNavigation(request.hospitalLocation, request.hospitalName, request.area)}>
                  <Navigation className="w-4 h-4 mr-1" />Navigate
                </Button>
              </div>
            </div>
          )}

          {request.status === 'accepted' && isDonorView && (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 space-y-3">
              <div 
                className="flex items-center gap-3 cursor-pointer hover:bg-primary/10 rounded-lg p-2 -m-2 transition-colors"
                onClick={() => setShowProfileDialog(true)}
              >
                <Avatar className="w-10 h-10 border-2 border-primary/30">
                  <AvatarFallback className="bg-primary/20 text-primary">
                    {request.requesterName ? getInitials(request.requesterName) : <User className="w-4 h-4" />}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-sm font-medium text-primary">You're donating for</p>
                  <p className="text-sm">{request.requesterName}</p>
                </div>
                <Eye className="w-4 h-4 text-primary/60" />
              </div>

              {isSharing ? (
                <div className="flex items-center gap-2 p-2 bg-success/10 border border-success/20 rounded-lg">
                  <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
                  <span className="text-sm text-success font-medium flex-1">Sharing live location</span>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:bg-destructive/10"
                    onClick={() => onToggleLiveLocation(false, undefined, request.id)}>
                    <XCircle className="w-3 h-3 mr-1" />Stop
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-2 bg-muted border border-border rounded-lg">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground flex-1">Share your location with requester</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleEnableLocationSharing} disabled={isEnablingLocation}>
                    {isEnablingLocation ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Navigation className="w-3 h-3 mr-1" />}
                    Share Location
                  </Button>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                {request.requesterPhone && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`tel:${request.requesterPhone}`}><Phone className="w-4 h-4 mr-1" />Call Requester</a>
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => openNavigation(request.hospitalLocation, request.hospitalName, request.area)}>
                  <Navigation className="w-4 h-4 mr-1" />Navigate
                </Button>
              </div>
            </div>
          )}

          {request.status === 'cancelled' && (
            <div className="p-3 rounded-lg bg-muted border border-border">
              <p className="text-sm text-muted-foreground">This booking was cancelled.</p>
            </div>
          )}
          {request.status === 'completed' && (
            <div className="p-3 rounded-lg bg-success/10 border border-success/20">
              <p className="text-sm text-success font-medium">✓ Donation completed successfully!</p>
            </div>
          )}

          <div className="flex gap-2 flex-wrap pt-2">
            {request.status === 'accepted' && (
              <Button size="sm" onClick={onComplete} className="flex-1">
                <CheckCircle className="w-4 h-4 mr-1" />Mark Complete
              </Button>
            )}
            {(request.status === 'pending' || request.status === 'accepted') && (
              <Button variant="outline" size="sm" onClick={onCancel}>Cancel Booking</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <ProfileViewDialog
        open={showProfileDialog}
        onOpenChange={setShowProfileDialog}
        userId={isDonorView ? request.requesterId : (request.acceptedDonorId || '')}
        userName={isDonorView ? request.requesterName : request.acceptedDonorName}
      />
    </>
  );
};

interface IncomingBookingCardProps {
  request: BloodRequest;
  onAccept: () => void;
  onDecline: () => void;
  userLocation?: { lat: number; lng: number } | null;
}

const IncomingBookingCard: React.FC<IncomingBookingCardProps> = ({ request, onAccept, onDecline, userLocation }) => {
  const [showProfile, setShowProfile] = useState(false);
  const [showAcceptDialog, setShowAcceptDialog] = useState(false);
  const [showDeclineDialog, setShowDeclineDialog] = useState(false);

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const getDistance = () => {
    if (!userLocation || !request.hospitalLocation?.lat || !request.hospitalLocation?.lng) return null;
    const R = 6371;
    const dLat = ((request.hospitalLocation.lat - userLocation.lat) * Math.PI) / 180;
    const dLng = ((request.hospitalLocation.lng - userLocation.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((userLocation.lat * Math.PI) / 180) *
        Math.cos((request.hospitalLocation.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return distanceKm < 1 ? `${Math.round(distanceKm * 1000)}m` : `${distanceKm.toFixed(1)}km`;
  };

  const distance = getDistance();

  return (
    <>
      <Card className="animate-fade-in border-2 border-primary/20 bg-primary/5">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Scheduled Booking Request</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning">
              Awaiting Response
            </span>
          </div>

          {request.scheduledAt && (
            <div className="p-3 rounded-lg bg-secondary/50 border border-secondary">
              <div className="flex items-center gap-2">
                <Timer className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Scheduled for</p>
                  <p className="font-semibold">{format(new Date(request.scheduledAt), 'PPP p')}</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <BloodGroupBadge bloodGroup={request.bloodGroup} size="lg" />
              <div>
                <h4 className="font-semibold">{request.patientName}</h4>
                <p className="text-sm text-muted-foreground">
                  {request.bagsNeeded} bag{request.bagsNeeded > 1 ? 's' : ''} needed
                </p>
              </div>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <Clock className="w-3.5 h-3.5 inline mr-1" />
              {formatDistanceToNow(request.createdAt, { addSuffix: true })}
            </div>
          </div>

          <div 
            className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-secondary/50 cursor-pointer transition-colors"
            onClick={() => setShowProfile(true)}
          >
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {request.requesterName ? getInitials(request.requesterName) : <User className="w-4 h-4" />}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Requested by {request.requesterName}</p>
              <p className="text-xs text-muted-foreground">{request.requesterPhone}</p>
            </div>
            <Eye className="w-4 h-4 text-muted-foreground" />
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="line-clamp-1">{request.hospitalName}, {request.area}</span>
              {distance && <span className="text-primary font-medium">({distance})</span>}
            </div>
            {request.notes && (
              <p className="text-muted-foreground italic pl-6">"{request.notes}"</p>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button 
              variant="outline" size="sm"
              onClick={() => {
                const url = request.hospitalLocation?.lat && request.hospitalLocation?.lng
                  ? `https://www.google.com/maps/dir/?api=1&destination=${request.hospitalLocation.lat},${request.hospitalLocation.lng}&travelmode=driving`
                  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${request.hospitalName}, ${request.area}, Bangladesh`)}`;
                window.open(url, "_blank", "noopener,noreferrer");
              }}
            >
              <Navigation className="w-4 h-4 mr-1" />Navigate
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowDeclineDialog(true)}>
              <XCircle className="w-4 h-4 mr-1" />Decline
            </Button>
            <Button size="sm" className="flex-1" onClick={() => setShowAcceptDialog(true)}>
              <CheckCircle className="w-4 h-4 mr-1" />Accept
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={showAcceptDialog}
        onOpenChange={setShowAcceptDialog}
        title="Accept Booking Request?"
        description={`You are about to accept the scheduled blood donation for ${request.patientName} on ${request.scheduledAt ? format(new Date(request.scheduledAt), 'PPP p') : 'the scheduled date'}. This will set your donor status to cooldown.`}
        confirmLabel="Yes, Accept"
        cancelLabel="Cancel"
        variant="accept"
        onConfirm={() => { setShowAcceptDialog(false); onAccept(); }}
      />
      <ConfirmationDialog
        open={showDeclineDialog}
        onOpenChange={setShowDeclineDialog}
        title="Decline Booking Request?"
        description={`Are you sure you want to decline the scheduled blood donation for ${request.patientName}? The requester will be notified.`}
        confirmLabel="Yes, Decline"
        cancelLabel="Cancel"
        variant="decline"
        onConfirm={() => { setShowDeclineDialog(false); onDecline(); }}
      />
      <ProfileViewDialog
        open={showProfile}
        onOpenChange={setShowProfile}
        userId={request.requesterId}
        userName={request.requesterName}
      />
    </>
  );
};

export default Requests;
