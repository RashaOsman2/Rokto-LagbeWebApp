import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, limit, startAfter, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useIncomingRequestCount } from '@/hooks/useIncomingRequestCount';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { BloodGroupBadge } from '@/components/BloodGroupBadge';
import { StatusBadge } from '@/components/StatusBadge';
import { BloodDropIcon } from '@/components/BloodDropIcon';
import { ProfileViewDialog } from '@/components/ProfileViewDialog';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import { NotificationBell } from '@/components/NotificationBell';
import { BLOOD_GROUPS, AREAS, BloodGroup, Area, UserProfile } from '@/types';
import { Phone, MapPin, Search, AlertCircle, LogOut, User, Inbox, PlusCircle, Navigation, Clock, Heart, ChevronRight, Building2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const Home: React.FC = () => {
  const { user, profile, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { getCurrentPosition } = useGeolocation();
  const incomingRequestCount = useIncomingRequestCount();
  
  const [searchBloodGroup, setSearchBloodGroup] = useState<BloodGroup | 'all'>('all');
  const [searchArea, setSearchArea] = useState<Area | 'all'>('all');
  const [donors, setDonors] = useState<(UserProfile & { location?: { lat: number; lng: number } })[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  
  // Store last document for pagination cursor
  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  // Store current search filters for pagination
  const currentFiltersRef = useRef<{ bloodGroup: BloodGroup | 'all'; area: Area | 'all' }>({
    bloodGroup: 'all',
    area: 'all'
  });
  // Ref for infinite scroll sentinel
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Only get user location if permission was previously granted
  useEffect(() => {
    let isMounted = true;
    
    const checkLocationPermission = async () => {
      try {
        if (!navigator.permissions) return;
        
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        if (permission.state === 'granted' && isMounted) {
          getCurrentPosition()
            .then((pos) => {
              if (isMounted) {
                setUserLocation({ lat: pos.lat, lng: pos.lng });
              }
            })
            .catch(() => {});
        }
      } catch {}
    };
    
    checkLocationPermission();
    
    return () => {
      isMounted = false;
    };
  }, [getCurrentPosition]);

  // Calculate distance between two coordinates
  const calculateDistance = useCallback((lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  const SEARCH_LIMIT = 20;

  // Build query based on filters
  const buildQuery = useCallback((
    bloodGroup: BloodGroup | 'all',
    area: Area | 'all',
    cursor?: QueryDocumentSnapshot<DocumentData> | null
  ) => {
    const usersCollection = collection(db, 'users');
    
    if (bloodGroup !== 'all' && area !== 'all') {
      return cursor
        ? query(usersCollection, where('isDonor', '==', true), where('donorStatus', '==', 'available'), where('bloodGroup', '==', bloodGroup), where('area', '==', area), startAfter(cursor), limit(SEARCH_LIMIT))
        : query(usersCollection, where('isDonor', '==', true), where('donorStatus', '==', 'available'), where('bloodGroup', '==', bloodGroup), where('area', '==', area), limit(SEARCH_LIMIT));
    } else if (bloodGroup !== 'all') {
      return cursor
        ? query(usersCollection, where('isDonor', '==', true), where('donorStatus', '==', 'available'), where('bloodGroup', '==', bloodGroup), startAfter(cursor), limit(SEARCH_LIMIT))
        : query(usersCollection, where('isDonor', '==', true), where('donorStatus', '==', 'available'), where('bloodGroup', '==', bloodGroup), limit(SEARCH_LIMIT));
    } else if (area !== 'all') {
      return cursor
        ? query(usersCollection, where('isDonor', '==', true), where('donorStatus', '==', 'available'), where('area', '==', area), startAfter(cursor), limit(SEARCH_LIMIT))
        : query(usersCollection, where('isDonor', '==', true), where('donorStatus', '==', 'available'), where('area', '==', area), limit(SEARCH_LIMIT));
    } else {
      return cursor
        ? query(usersCollection, where('isDonor', '==', true), where('donorStatus', '==', 'available'), startAfter(cursor), limit(SEARCH_LIMIT))
        : query(usersCollection, where('isDonor', '==', true), where('donorStatus', '==', 'available'), limit(SEARCH_LIMIT));
    }
  }, []);

  // Process query results - ONLY individual donors, exclude hospital/bloodbank accounts
  const processResults = useCallback((querySnapshot: any) => {
    const results: (UserProfile & { location?: { lat: number; lng: number } })[] = [];
    
    querySnapshot.forEach((docSnap: QueryDocumentSnapshot<DocumentData>) => {
      const data = docSnap.data() as Record<string, any>;
      
      // Skip current user
      if (docSnap.id === user?.uid) return;
      // Skip incomplete profiles
      if (!data.bloodGroup || !data.area || !data.fullName) return;
      // EXCLUDE hospital and bloodbank accounts - only show individual donors
      if (data.role === 'hospital' || data.role === 'bloodbank') return;
      
      const location = (data.location?.lat && data.location?.lng) 
        ? { lat: data.location.lat, lng: data.location.lng }
        : undefined;
        
      results.push({
        ...data,
        uid: docSnap.id,
        lastDonationDate: data.lastDonationDate?.toDate() || null,
        createdAt: data.createdAt?.toDate() || new Date(),
        location,
      } as UserProfile & { location?: { lat: number; lng: number } });
    });

    return results;
  }, [user?.uid]);

  // Sort results by distance
  const sortByDistance = useCallback((results: (UserProfile & { location?: { lat: number; lng: number } })[]) => {
    if (!userLocation || results.length <= 1) return results;
    
    return [...results].sort((a, b) => {
      if (!a.location && !b.location) return 0;
      if (!a.location) return 1;
      if (!b.location) return -1;
      
      const distA = calculateDistance(userLocation.lat, userLocation.lng, a.location.lat, a.location.lng);
      const distB = calculateDistance(userLocation.lat, userLocation.lng, b.location.lat, b.location.lng);
      
      return distA - distB;
    });
  }, [userLocation, calculateDistance]);

  const handleSearch = async () => {
    setLoading(true);
    setHasSearched(true);
    setHasMoreResults(false);
    setTotalCount(null);
    lastDocRef.current = null;
    
    currentFiltersRef.current = { bloodGroup: searchBloodGroup, area: searchArea };
    
    try {
      const q = buildQuery(searchBloodGroup, searchArea);
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        lastDocRef.current = querySnapshot.docs[querySnapshot.docs.length - 1];
        const hasMore = querySnapshot.docs.length === SEARCH_LIMIT;
        setHasMoreResults(hasMore);
        setTotalCount(hasMore ? null : querySnapshot.docs.length);
      }

      let results = processResults(querySnapshot);
      results = sortByDistance(results);
      setDonors(results);

      if (results.length === 0) {
        toast.info('No donors found matching your criteria. Try checking Blood Banks for hospital stock.');
      } else {
        toast.success(`Found ${results.length} donor${results.length > 1 ? 's' : ''}`);
      }
    } catch (error: any) {
      console.error('Search error:', error);
      if (error.code === 'failed-precondition') {
        toast.error('Search requires a database index.');
      } else {
        toast.error('Failed to search. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = useCallback(async () => {
    if (!lastDocRef.current || loadingMore || !hasMoreResults) return;
    
    setLoadingMore(true);
    
    try {
      const { bloodGroup, area } = currentFiltersRef.current;
      const q = buildQuery(bloodGroup, area, lastDocRef.current);
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        lastDocRef.current = querySnapshot.docs[querySnapshot.docs.length - 1];
        const hasMore = querySnapshot.docs.length === SEARCH_LIMIT;
        setHasMoreResults(hasMore);
        if (!hasMore) {
          setTotalCount(prev => (prev || 0) + querySnapshot.docs.length);
        }
      } else {
        setHasMoreResults(false);
      }

      const newResults = processResults(querySnapshot);
      
      if (newResults.length > 0) {
        setDonors(prev => {
          const combined = [...prev, ...newResults];
          return sortByDistance(combined);
        });
      } else {
        setHasMoreResults(false);
      }
    } catch (error: any) {
      console.error('Load more error:', error);
      toast.error('Failed to load more donors.');
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMoreResults, buildQuery, processResults, sortByDistance]);

  // Infinite scroll observer
  useEffect(() => {
    if (!hasMoreResults || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreResults && !loadingMore) {
          handleLoadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) observer.observe(currentRef);

    return () => {
      if (currentRef) observer.unobserve(currentRef);
    };
  }, [hasMoreResults, loadingMore, handleLoadMore]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      toast.error('Failed to logout');
    }
  };

  // Calculate days until next donation
  const getDaysUntilNextDonation = () => {
    if (!profile?.lastDonationDate) return null;
    const lastDonation = new Date(profile.lastDonationDate);
    const nextEligible = new Date(lastDonation);
    nextEligible.setMonth(nextEligible.getMonth() + 3);
    const today = new Date();
    const diffTime = nextEligible.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const daysUntilNextDonation = getDaysUntilNextDonation();

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50">
        <div className="container max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <BloodDropIcon className="w-8 h-8 text-primary animate-heartbeat" />
              </div>
              <span className="font-bold text-xl tracking-tight">RoktoLagbe<span className="text-primary">?</span></span>
            </div>
            <div className="flex items-center gap-1">
              <NotificationBell />
              {profile?.role === 'hospital' && (
                <Button variant="ghost" size="sm" onClick={() => navigate('/hospital-dashboard')} className="hover:bg-accent text-xs">
                  <Building2 className="w-4 h-4 mr-1" />
                  Dashboard
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => navigate('/profile')} className="hover:bg-accent">
                <User className="w-5 h-5" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="hover:bg-accent">
                    <LogOut className="w-5 h-5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="animate-scale-in">
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('auth.logoutConfirm')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('auth.logoutDescription')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleLogout}>
                      {t('common.yes')}, {t('auth.logout')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </header>

      <main className="container max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Hero Welcome Card */}
        {profile && (
          <div className="animate-fade-in-up">
            <Card className="overflow-hidden border-0 elevation-3">
              <div className="hero-gradient">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-muted-foreground">{t('home.welcome')},</p>
                        <h2 className="text-2xl font-bold text-foreground">{profile.fullName?.split(' ')[0]}!</h2>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-2">
                        <BloodGroupBadge bloodGroup={profile.bloodGroup} size="md" />
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground bg-secondary/50 px-2.5 py-1 rounded-full">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{profile.area}</span>
                        </div>
                        {profile.isDonor && <StatusBadge status={profile.donorStatus} />}
                      </div>

                      {/* Next donation eligibility */}
                      {profile.isDonor && profile.donorStatus === 'cooldown' && daysUntilNextDonation !== null && (
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="w-4 h-4 text-warning" />
                          <span className="text-muted-foreground">
                            {daysUntilNextDonation} {t('donor.cooldownDays')}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {!profile.isDonor && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => navigate('/profile')}
                        className="shrink-0 group"
                      >
                        <Heart className="w-4 h-4 mr-1.5 group-hover:text-primary transition-colors" />
                        {t('home.becomeDonor')}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </div>
            </Card>
          </div>
        )}

        {/* Primary Action Buttons */}
        <div className="grid grid-cols-2 gap-4 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <Button
            variant="outline"
            className="h-auto py-4 flex flex-col items-center gap-2 relative card-hover bg-card border-border/60"
            onClick={() => navigate('/requests')}
          >
            <div className="relative">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <Inbox className="w-6 h-6 text-primary" />
              </div>
              {incomingRequestCount > 0 && (
                <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-destructive text-destructive-foreground rounded-full notification-dot">
                  {incomingRequestCount > 9 ? '9+' : incomingRequestCount}
                </span>
              )}
            </div>
            <div className="text-center">
              <span className="text-sm font-semibold">{t('requests.myRequests')}</span>
              <p className="text-xs text-muted-foreground mt-0.5">
                {incomingRequestCount > 0 
                  ? `${incomingRequestCount} ${t('history.pending')}`
                  : t('requests.viewHistory')}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
          </Button>
          
          <Button
            className="h-auto py-4 flex flex-col items-center gap-2 card-hover bg-primary hover:bg-primary/90"
            onClick={() => navigate('/create-request')}
          >
            <div className="p-2.5 rounded-xl bg-white/20">
              <PlusCircle className="w-6 h-6 text-white" />
            </div>
            <div className="text-center text-white">
              <span className="text-sm font-semibold">{t('home.requestBlood')}</span>
              <p className="text-xs text-white/80 mt-0.5">{t('requests.createRequest')}</p>
            </div>
          </Button>
        </div>

        {/* Secondary Actions */}
        <div className="grid grid-cols-2 gap-4 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
          <Button
            variant="outline"
            className="h-auto py-3 flex items-center gap-3 justify-start card-hover bg-card border-border/60"
            onClick={() => navigate('/hospitals')}
          >
            <div className="p-2 rounded-lg bg-destructive/10">
              <Building2 className="w-5 h-5 text-destructive" />
            </div>
            <div className="text-left">
              <span className="text-sm font-semibold">Blood Banks</span>
              <p className="text-xs text-muted-foreground">View stock</p>
            </div>
          </Button>
          
          {profile?.role === 'admin' && (
            <Button
              variant="outline"
              className="h-auto py-3 flex items-center gap-3 justify-start card-hover bg-card border-border/60"
              onClick={() => navigate('/admin')}
            >
              <div className="p-2 rounded-lg bg-amber-500/10">
                <ShieldCheck className="w-5 h-5 text-amber-600" />
              </div>
              <div className="text-left">
                <span className="text-sm font-semibold">Admin</span>
                <p className="text-xs text-muted-foreground">Manage</p>
              </div>
            </Button>
          )}
        </div>

        {/* Search Section */}
        <div className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <Card className="elevation-2 border-border/60">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Search className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{t('home.findDonors')}</h3>
                  <p className="text-xs text-muted-foreground">{t('common.search')}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">Blood Group</label>
                  <Select
                    value={searchBloodGroup}
                    onValueChange={(v) => setSearchBloodGroup(v as BloodGroup | 'all')}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="All groups" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Groups</SelectItem>
                      {BLOOD_GROUPS.map((bg) => (
                        <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">Area</label>
                  <Select
                    value={searchArea}
                    onValueChange={(v) => setSearchArea(v as Area | 'all')}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="All areas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Areas</SelectItem>
                      {AREAS.map((area) => (
                        <SelectItem key={area} value={area}>{area}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={handleSearch} className="w-full" disabled={loading} size="lg">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Searching...
                  </span>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Search Donors
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Search Results - ONLY Individual Donors */}
        {hasSearched && (
          <div className="space-y-4 animate-fade-in">
            {/* Donors Results */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-destructive" />
                  <h3 className="font-semibold text-foreground">
                    {donors.length > 0 
                      ? totalCount !== null 
                        ? `${donors.length} of ${totalCount} donors`
                        : `${donors.length} donor${donors.length > 1 ? 's' : ''}${hasMoreResults ? '+' : ''}`
                      : 'No donors found'
                    }
                  </h3>
                </div>
                {hasMoreResults && donors.length > 0 && (
                  <p className="text-xs text-muted-foreground">Scroll for more</p>
                )}
              </div>
            
              {donors.length === 0 ? (
                <Card className="border-dashed border-2">
                  <CardContent className="p-6 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                      <BloodDropIcon className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground font-medium">No donors match your search.</p>
                    <p className="text-sm text-muted-foreground mt-1">Try Blood Banks for hospital stock or create an emergency request.</p>
                    <div className="flex flex-col sm:flex-row gap-2 mt-4 justify-center">
                      <Button 
                        variant="outline"
                        onClick={() => navigate('/hospitals')}
                      >
                        <Building2 className="w-4 h-4 mr-2" />
                        Check Blood Banks
                      </Button>
                      <Button 
                        variant="destructive" 
                        onClick={() => navigate('/create-request')}
                      >
                        <AlertCircle className="w-4 h-4 mr-2" />
                        Create Emergency Request
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {donors.map((donor, index) => (
                    <div key={donor.uid} style={{ animationDelay: `${index * 0.05}s` }} className="animate-fade-in">
                      <DonorCard 
                        donor={donor}
                        userLocation={userLocation}
                        onRequest={() => navigate(`/create-request?donorId=${donor.uid}`)}
                      />
                    </div>
                  ))}
                  
                  {/* Infinite scroll sentinel */}
                  {hasMoreResults && (
                    <div ref={loadMoreRef} className="py-4 flex justify-center">
                      {loadingMore && (
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                          Loading more...
                        </span>
                      )}
                    </div>
                  )}
                  
                  {!hasMoreResults && donors.length > SEARCH_LIMIT - 1 && (
                    <p className="text-center text-sm text-muted-foreground py-2">
                      All donors loaded
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick action when no search */}
        {!hasSearched && (
          <div className="animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            <Card className="border-dashed border-2 border-primary/30 bg-primary/5 overflow-hidden">
              <CardContent className="p-6 text-center relative">
                <div className="absolute inset-0 hero-gradient opacity-50" />
                <div className="relative z-10">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                    <AlertCircle className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="font-bold text-lg mb-1">Need Blood Urgently?</h3>
                  <p className="text-sm text-muted-foreground mb-5">
                    Create an emergency request to alert all matching donors in your area
                  </p>
                  <Button 
                    size="lg"
                    onClick={() => navigate('/create-request')}
                    className="shadow-lg"
                  >
                    <PlusCircle className="w-5 h-5 mr-2" />
                    Create Blood Request
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* Floating Action Button */}
      <FloatingActionButton />
    </div>
  );
};

interface DonorCardProps {
  donor: UserProfile & { location?: { lat: number; lng: number } };
  userLocation: { lat: number; lng: number } | null;
  onRequest: () => void;
}

const DonorCard: React.FC<DonorCardProps> = ({ donor, userLocation, onRequest }) => {
  const [showProfile, setShowProfile] = useState(false);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getDistance = () => {
    if (!userLocation || !donor.location) return null;
    const R = 6371;
    const dLat = ((donor.location.lat - userLocation.lat) * Math.PI) / 180;
    const dLng = ((donor.location.lng - userLocation.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((userLocation.lat * Math.PI) / 180) *
        Math.cos((donor.location.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dist = R * c;
    return dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`;
  };

  const openInGoogleMaps = () => {
    if (donor.location) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${donor.location.lat},${donor.location.lng}`,
        '_blank',
        'noopener,noreferrer'
      );
    }
  };

  const distance = getDistance();

  return (
    <>
      <Card className="card-hover bg-card border-border/60 overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <button 
              className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
              onClick={() => setShowProfile(true)}
            >
              <Avatar className="w-12 h-12 border-2 border-primary/20 ring-2 ring-primary/10 ring-offset-2 ring-offset-background">
                <AvatarImage src={donor.photoURL || undefined} alt={donor.fullName} />
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {getInitials(donor.fullName)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h4 className="font-semibold hover:text-primary transition-colors">{donor.fullName}</h4>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                  <BloodGroupBadge bloodGroup={donor.bloodGroup} size="sm" />
                  <span>•</span>
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{donor.area}</span>
                  {distance && (
                    <>
                      <span>•</span>
                      <span className="text-primary font-medium">{distance}</span>
                    </>
                  )}
                </div>
              </div>
            </button>
            <StatusBadge status={donor.donorStatus} />
          </div>
          
          <div className="mt-4 flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" asChild>
              <a href={`tel:${donor.phoneNumber}`}>
                <Phone className="w-4 h-4 mr-1.5" />
                Call
              </a>
            </Button>
            {donor.location && (
              <Button variant="outline" size="sm" onClick={openInGoogleMaps}>
                <Navigation className="w-4 h-4" />
              </Button>
            )}
            <Button size="sm" className="flex-1" onClick={onRequest}>
              Request Blood
            </Button>
          </div>
        </CardContent>
      </Card>

      <ProfileViewDialog
        open={showProfile}
        onOpenChange={setShowProfile}
        userId={donor.uid}
        userName={donor.fullName}
      />
    </>
  );
};

export default Home;
