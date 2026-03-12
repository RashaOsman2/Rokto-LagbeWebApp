import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BloodGroupBadge } from '@/components/BloodGroupBadge';
import { BloodDropIcon } from '@/components/BloodDropIcon';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { 
  ArrowLeft, 
  Heart, 
  Users, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Calendar,
  MapPin,
  Phone,
  User,
  Filter,
  Droplet,
  TrendingUp,
  Award,
  RefreshCw,
  Ban,
  Timer
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { BloodRequest } from '@/types';

type FilterStatus = 'all' | 'completed' | 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';

interface RequestRecord {
  id: string;
  patientName: string;
  bloodGroup: string;
  bagsNeeded: number;
  hospitalName: string;
  area: string;
  status: string;
  requestType: string;
  createdAt: Date;
  updatedAt: Date;
  scheduledAt?: Date | null;
  // For donations I made
  requesterName?: string;
  requesterPhone?: string;
  requesterId?: string;
  // For requests I made
  acceptedDonorName?: string;
  acceptedDonorPhone?: string;
  acceptedDonorId?: string;
  isEmergency?: boolean;
  isAmberAlert?: boolean;
  notes?: string;
}

const History: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'donated' | 'received'>('donated');
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [donatedRequests, setDonatedRequests] = useState<RequestRecord[]>([]);
  const [myRequests, setMyRequests] = useState<RequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Stats
  const [donorStats, setDonorStats] = useState({
    totalDonations: 0,
    totalBags: 0,
    peopleHelped: 0,
  });
  const [requesterStats, setRequesterStats] = useState({
    totalRequests: 0,
    completed: 0,
    pending: 0,
  });

  const fetchHistory = useCallback(async () => {
    if (!user) {
      console.log('History: No user found');
      setLoading(false);
      return;
    }
    
    console.log('History: Fetching for user', user.uid);
    
    try {
      // Fetch requests where I was the donor (accepted)
      const donorQuery = query(
        collection(db, 'requests'),
        where('acceptedDonorId', '==', user.uid)
      );
      
      const donorSnapshot = await getDocs(donorQuery);
      console.log('History: Donor requests found:', donorSnapshot.size);
      
      const donated: RequestRecord[] = [];
      const uniqueRecipients = new Set<string>();
      let totalBags = 0;
      let completedDonations = 0;

      donorSnapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        console.log('History: Donor request data:', docSnap.id, data.status);
        donated.push({
          id: docSnap.id,
          patientName: data.patientName,
          bloodGroup: data.bloodGroup,
          bagsNeeded: data.bagsNeeded || 1,
          hospitalName: data.hospitalName,
          area: data.area,
          status: data.status,
          requestType: data.requestType || 'immediate',
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          scheduledAt: data.scheduledAt?.toDate() || null,
          requesterName: data.requesterName,
          requesterPhone: data.requesterPhone || data.contactPhone,
          requesterId: data.requesterId,
          isEmergency: data.isEmergency,
          isAmberAlert: data.isAmberAlert,
          notes: data.notes,
        });

        if (data.status === 'completed') {
          completedDonations++;
          totalBags += data.bagsNeeded || 1;
          if (data.requesterId) {
            uniqueRecipients.add(data.requesterId);
          }
        }
      });

      // Sort by updatedAt descending (manually since we removed orderBy to avoid index issues)
      donated.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

      setDonatedRequests(donated);
      setDonorStats({
        totalDonations: completedDonations,
        totalBags,
        peopleHelped: uniqueRecipients.size,
      });

      // Fetch requests I created
      const myQuery = query(
        collection(db, 'requests'),
        where('requesterId', '==', user.uid)
      );

      const mySnapshot = await getDocs(myQuery);
      console.log('History: My requests found:', mySnapshot.size);
      
      const mine: RequestRecord[] = [];
      let pendingCount = 0;
      let completedCount = 0;

      mySnapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        console.log('History: My request data:', docSnap.id, data.status);
        mine.push({
          id: docSnap.id,
          patientName: data.patientName,
          bloodGroup: data.bloodGroup,
          bagsNeeded: data.bagsNeeded || 1,
          hospitalName: data.hospitalName,
          area: data.area,
          status: data.status,
          requestType: data.requestType || 'immediate',
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          scheduledAt: data.scheduledAt?.toDate() || null,
          acceptedDonorName: data.acceptedDonorName,
          acceptedDonorPhone: data.acceptedDonorPhone,
          acceptedDonorId: data.acceptedDonorId,
          isEmergency: data.isEmergency,
          isAmberAlert: data.isAmberAlert,
          notes: data.notes,
        });

        if (data.status === 'pending') pendingCount++;
        if (data.status === 'completed') completedCount++;
      });

      // Sort by createdAt descending
      mine.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      setMyRequests(mine);
      setRequesterStats({
        totalRequests: mine.length,
        completed: completedCount,
        pending: pendingCount,
      });

    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchHistory();
  };

  const getFilteredRequests = (requests: RequestRecord[]): RequestRecord[] => {
    if (filter === 'all') return requests;
    return requests.filter(r => r.status === filter);
  };

  const filteredDonated = getFilteredRequests(donatedRequests);
  const filteredMyRequests = getFilteredRequests(myRequests);

  const filterOptions: { value: FilterStatus; label: string; icon: React.ReactNode }[] = [
    { value: 'all', label: t('history.filterAll'), icon: <Filter className="w-3.5 h-3.5" /> },
    { value: 'completed', label: t('history.filterCompleted'), icon: <CheckCircle className="w-3.5 h-3.5" /> },
    { value: 'pending', label: t('history.filterPending'), icon: <Clock className="w-3.5 h-3.5" /> },
    { value: 'accepted', label: t('history.filterAccepted'), icon: <Heart className="w-3.5 h-3.5" /> },
    { value: 'declined', label: t('history.filterDeclined'), icon: <XCircle className="w-3.5 h-3.5" /> },
    { value: 'cancelled', label: t('history.filterCancelled'), icon: <Ban className="w-3.5 h-3.5" /> },
    { value: 'expired', label: t('history.filterExpired'), icon: <Timer className="w-3.5 h-3.5" /> },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="container max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-2">
                <BloodDropIcon className="w-6 h-6 text-primary animate-blood-pulse" />
                <h1 className="font-bold text-lg">{t('history.title')}</h1>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </header>

      <main className="container max-w-2xl mx-auto px-4 py-6 space-y-6">
        <Tabs 
          value={activeTab} 
          onValueChange={(v) => {
            setActiveTab(v as 'donated' | 'received');
            setFilter('all');
          }} 
          className="space-y-6"
        >
          <TabsList className="grid w-full grid-cols-2 h-12 p-1 bg-muted/50">
            <TabsTrigger value="donated" className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Heart className="w-4 h-4" />
              {t('history.myDonations')}
            </TabsTrigger>
            <TabsTrigger value="received" className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Users className="w-4 h-4" />
              {t('history.myRequests')}
            </TabsTrigger>
          </TabsList>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {filterOptions.map((opt) => (
              <Button
                key={opt.value}
                variant={filter === opt.value ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5 text-xs h-8"
                onClick={() => setFilter(opt.value)}
              >
                {opt.icon}
                {opt.label}
              </Button>
            ))}
          </div>

          {/* My Donations Tab */}
          <TabsContent value="donated" className="space-y-6 animate-fade-in">
            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
                <CardContent className="p-4 text-center">
                  <Droplet className="w-6 h-6 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-bold">{donorStats.totalDonations}</p>
                  <p className="text-xs text-muted-foreground">Donations</p>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-success/10 to-success/5">
                <CardContent className="p-4 text-center">
                  <TrendingUp className="w-6 h-6 mx-auto mb-2 text-success" />
                  <p className="text-2xl font-bold">{donorStats.totalBags}</p>
                  <p className="text-xs text-muted-foreground">Total Bags</p>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-warning/10 to-warning/5">
                <CardContent className="p-4 text-center">
                  <Award className="w-6 h-6 mx-auto mb-2 text-warning" />
                  <p className="text-2xl font-bold">{donorStats.peopleHelped}</p>
                  <p className="text-xs text-muted-foreground">People Helped</p>
                </CardContent>
              </Card>
            </div>

            {/* Donation List */}
            <div className="space-y-3">
              <h3 className="font-semibold text-muted-foreground flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4" />
                Donation History ({filteredDonated.length})
              </h3>

              {filteredDonated.length === 0 ? (
                <EmptyState 
                  message={filter === 'all' 
                    ? "No donations yet. Accept a blood request to start saving lives!" 
                    : `No ${filter} donations found.`
                  } 
                />
              ) : (
                filteredDonated.map((request) => (
                  <HistoryCard 
                    key={request.id} 
                    request={request} 
                    mode="donor" 
                  />
                ))
              )}
            </div>
          </TabsContent>

          {/* My Requests Tab */}
          <TabsContent value="received" className="space-y-6 animate-fade-in">
            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
                <CardContent className="p-4 text-center">
                  <Droplet className="w-6 h-6 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-bold">{requesterStats.totalRequests}</p>
                  <p className="text-xs text-muted-foreground">Total Requests</p>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-success/10 to-success/5">
                <CardContent className="p-4 text-center">
                  <CheckCircle className="w-6 h-6 mx-auto mb-2 text-success" />
                  <p className="text-2xl font-bold">{requesterStats.completed}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-warning/10 to-warning/5">
                <CardContent className="p-4 text-center">
                  <Clock className="w-6 h-6 mx-auto mb-2 text-warning" />
                  <p className="text-2xl font-bold">{requesterStats.pending}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </CardContent>
              </Card>
            </div>

            {/* Request List */}
            <div className="space-y-3">
              <h3 className="font-semibold text-muted-foreground flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4" />
                Request History ({filteredMyRequests.length})
              </h3>

              {filteredMyRequests.length === 0 ? (
                <EmptyState 
                  message={filter === 'all' 
                    ? "No requests yet. Create a blood request when you need help." 
                    : `No ${filter} requests found.`
                  } 
                />
              ) : (
                filteredMyRequests.map((request) => (
                  <HistoryCard 
                    key={request.id} 
                    request={request} 
                    mode="requester" 
                  />
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

// Empty State Component
const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <Card className="border-dashed">
    <CardContent className="p-8 text-center text-muted-foreground">
      <BloodDropIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
      <p>{message}</p>
    </CardContent>
  </Card>
);

// History Card Component
interface HistoryCardProps {
  request: RequestRecord;
  mode: 'donor' | 'requester';
}

const HistoryCard: React.FC<HistoryCardProps> = ({ request, mode }) => {
  const personName = mode === 'donor' ? request.requesterName : request.acceptedDonorName;
  const personPhone = mode === 'donor' ? request.requesterPhone : request.acceptedDonorPhone;
  const personLabel = mode === 'donor' ? 'Recipient' : 'Donor';

  const statusConfig: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    pending: { label: 'Pending', className: 'bg-warning/10 text-warning', icon: <Clock className="w-3 h-3" /> },
    accepted: { label: 'Accepted', className: 'bg-primary/10 text-primary', icon: <Heart className="w-3 h-3" /> },
    completed: { label: 'Completed', className: 'bg-success/10 text-success', icon: <CheckCircle className="w-3 h-3" /> },
    declined: { label: 'Declined', className: 'bg-destructive/10 text-destructive', icon: <XCircle className="w-3 h-3" /> },
    cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground', icon: <Ban className="w-3 h-3" /> },
    expired: { label: 'Expired', className: 'bg-muted text-muted-foreground', icon: <Timer className="w-3 h-3" /> },
  };

  const config = statusConfig[request.status] || statusConfig.pending;

  return (
    <Card className="animate-fade-in hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <BloodGroupBadge bloodGroup={request.bloodGroup as any} size="sm" />
            <div>
              <p className="font-semibold text-sm">{request.patientName}</p>
              <p className="text-xs text-muted-foreground">
                {request.bagsNeeded} bag{request.bagsNeeded > 1 ? 's' : ''} • {request.requestType === 'booking' ? 'Booking' : 'Immediate'}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${config.className}`}>
              {config.icon}
              {config.label}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(request.updatedAt, { addSuffix: true })}
            </span>
          </div>
        </div>

        <div className="mt-3 space-y-2 text-sm">
          {/* Location */}
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{request.hospitalName}, {request.area}</span>
          </div>

          {/* Person info (donor or requester) */}
          {personName && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="w-3.5 h-3.5 flex-shrink-0" />
              <span>
                {personLabel}: <span className="text-foreground">{personName}</span>
              </span>
            </div>
          )}

          {/* Phone */}
          {personPhone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="w-3.5 h-3.5 flex-shrink-0" />
              <a href={`tel:${personPhone}`} className="text-primary hover:underline">
                {personPhone}
              </a>
            </div>
          )}

          {/* Scheduled date for bookings */}
          {request.scheduledAt && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Scheduled: {format(request.scheduledAt, 'PPP p')}</span>
            </div>
          )}

          {/* Emergency/Amber Alert badges */}
          {(request.isEmergency || request.isAmberAlert) && (
            <div className="flex items-center gap-2 pt-1">
              {request.isAmberAlert && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Amber Alert
                </span>
              )}
              {request.isEmergency && !request.isAmberAlert && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Emergency
                </span>
              )}
            </div>
          )}

          {/* Notes */}
          {request.notes && (
            <p className="text-muted-foreground italic text-xs pt-1">"{request.notes}"</p>
          )}

          {/* Date info */}
          <div className="text-xs text-muted-foreground pt-2 border-t border-border mt-2">
            Created: {format(request.createdAt, 'PPP')}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default History;
