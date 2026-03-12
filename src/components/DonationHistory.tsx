import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BloodGroupBadge } from '@/components/BloodGroupBadge';
import { BloodDropIcon } from '@/components/BloodDropIcon';
import { Droplet, Calendar, MapPin, User, Phone, Award, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';

interface DonationRecord {
  id: string;
  requestId: string;
  donorId: string;
  donorName: string;
  donorPhone: string;
  requesterId: string;
  requesterName: string;
  requesterPhone: string;
  bloodGroup: string;
  bagsNeeded: number;
  hospitalName: string;
  area: string;
  completedAt: Date;
}

interface DonationHistoryProps {
  mode: 'donor' | 'requester';
}

export const DonationHistory: React.FC<DonationHistoryProps> = ({ mode }) => {
  const { user } = useAuth();
  const [donations, setDonations] = useState<DonationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalDonations: 0,
    totalBags: 0,
    uniqueRecipients: 0,
  });

  useEffect(() => {
    if (!user) return;
    fetchDonationHistory();
  }, [user, mode]);

  const fetchDonationHistory = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Query completed requests
      const fieldName = mode === 'donor' ? 'acceptedDonorId' : 'requesterId';
      const requestsQuery = query(
        collection(db, 'requests'),
        where(fieldName, '==', user.uid),
        where('status', '==', 'completed'),
        orderBy('updatedAt', 'desc')
      );

      const snapshot = await getDocs(requestsQuery);
      const records: DonationRecord[] = [];
      const uniqueIds = new Set<string>();

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        
        // Get additional user info if needed
        let donorName = data.acceptedDonorName || 'Unknown Donor';
        let donorPhone = data.acceptedDonorPhone || '';
        let requesterName = data.requesterName || 'Unknown';
        let requesterPhone = data.requesterPhone || data.contactPhone || '';

        // Track unique recipients/donors
        if (mode === 'donor') {
          uniqueIds.add(data.requesterId);
        } else {
          uniqueIds.add(data.acceptedDonorId);
        }

        records.push({
          id: docSnap.id,
          requestId: docSnap.id,
          donorId: data.acceptedDonorId,
          donorName,
          donorPhone,
          requesterId: data.requesterId,
          requesterName,
          requesterPhone,
          bloodGroup: data.bloodGroup,
          bagsNeeded: data.bagsNeeded || 1,
          hospitalName: data.hospitalName,
          area: data.area,
          completedAt: data.updatedAt?.toDate() || new Date(),
        });
      }

      setDonations(records);
      setStats({
        totalDonations: records.length,
        totalBags: records.reduce((sum, r) => sum + r.bagsNeeded, 0),
        uniqueRecipients: uniqueIds.size,
      });
    } catch (error) {
      console.error('Error fetching donation history:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <BloodDropIcon className="w-10 h-10 text-primary animate-blood-pulse" />
        <p className="mt-4 text-muted-foreground">Loading history...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
          <CardContent className="p-4 text-center">
            <Droplet className="w-6 h-6 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-bold">{stats.totalDonations}</p>
            <p className="text-xs text-muted-foreground">
              {mode === 'donor' ? 'Donations' : 'Requests'}
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-success/10 to-success/5">
          <CardContent className="p-4 text-center">
            <TrendingUp className="w-6 h-6 mx-auto mb-2 text-success" />
            <p className="text-2xl font-bold">{stats.totalBags}</p>
            <p className="text-xs text-muted-foreground">Total Bags</p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-warning/10 to-warning/5">
          <CardContent className="p-4 text-center">
            <Award className="w-6 h-6 mx-auto mb-2 text-warning" />
            <p className="text-2xl font-bold">{stats.uniqueRecipients}</p>
            <p className="text-xs text-muted-foreground">
              {mode === 'donor' ? 'People Helped' : 'Donors Met'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Donation List */}
      <div className="space-y-3">
        <h3 className="font-semibold text-muted-foreground flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          {mode === 'donor' ? 'Donation History' : 'Received Donations'}
        </h3>

        {donations.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground">
              <BloodDropIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No {mode === 'donor' ? 'donations' : 'received donations'} yet</p>
              <p className="text-sm mt-1">
                {mode === 'donor' 
                  ? 'Your completed donations will appear here'
                  : 'Donations you receive will appear here'
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          donations.map((donation) => (
            <DonationCard key={donation.id} donation={donation} mode={mode} />
          ))
        )}
      </div>
    </div>
  );
};

interface DonationCardProps {
  donation: DonationRecord;
  mode: 'donor' | 'requester';
}

const DonationCard: React.FC<DonationCardProps> = ({ donation, mode }) => {
  const personName = mode === 'donor' ? donation.requesterName : donation.donorName;
  const personPhone = mode === 'donor' ? donation.requesterPhone : donation.donorPhone;
  const personLabel = mode === 'donor' ? 'Recipient' : 'Donor';

  return (
    <Card className="animate-fade-in">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <BloodGroupBadge bloodGroup={donation.bloodGroup as any} size="sm" />
            <div>
              <p className="font-semibold text-sm">
                {donation.bagsNeeded} bag{donation.bagsNeeded > 1 ? 's' : ''} donated
              </p>
              <p className="text-xs text-muted-foreground">
                {format(donation.completedAt, 'MMM d, yyyy')}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3 space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="w-3.5 h-3.5" />
            <span>{personLabel}: <span className="text-foreground">{personName}</span></span>
          </div>
          
          {personPhone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="w-3.5 h-3.5" />
              <a href={`tel:${personPhone}`} className="text-primary hover:underline">
                {personPhone}
              </a>
            </div>
          )}
          
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="w-3.5 h-3.5" />
            <span>{donation.hospitalName}, {donation.area}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DonationHistory;
