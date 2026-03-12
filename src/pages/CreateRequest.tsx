import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, addDoc, doc, getDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BloodDropIcon } from '@/components/BloodDropIcon';
import { BloodGroupBadge } from '@/components/BloodGroupBadge';
import { LocationSearch } from '@/components/LocationSearch';
import { BLOOD_GROUPS, AREAS, BloodGroup, Area, UserProfile, RequestType } from '@/types';
import { ArrowLeft, AlertCircle, Loader2, Siren, Plus, Minus, Calendar, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

const CreateRequest: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const targetDonorId = searchParams.get('donorId');
  
  const [loading, setLoading] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [targetDonor, setTargetDonor] = useState<UserProfile | null>(null);
  const [isForSelf, setIsForSelf] = useState(true);
  const [hospitalLocation, setHospitalLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [requestType, setRequestType] = useState<RequestType>('immediate');

  const [formData, setFormData] = useState({
    patientName: profile?.fullName || '',
    contactPhone: profile?.phoneNumber || '',
    bloodGroup: '' as BloodGroup | '',
    bagsNeeded: 1,
    hospitalName: '',
    hospitalAddress: '',
    area: profile?.area || '' as Area | '',
    notes: '',
    isEmergency: !targetDonorId,
    isAmberAlert: false,
    scheduledDate: '',
    scheduledTime: '',
  });

  useEffect(() => {
    if (targetDonorId) {
      fetchTargetDonor();
    }
  }, [targetDonorId]);

  useEffect(() => {
    if (isForSelf && profile) {
      setFormData(prev => ({
        ...prev,
        patientName: profile.fullName || '',
        contactPhone: profile.phoneNumber || '',
      }));
    }
  }, [isForSelf, profile]);

  const fetchTargetDonor = async () => {
    if (!targetDonorId) return;
    
    try {
      const docRef = doc(db, 'users', targetDonorId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTargetDonor({
          ...data,
          uid: docSnap.id,
          lastDonationDate: data.lastDonationDate?.toDate() || null,
          createdAt: data.createdAt?.toDate() || new Date(),
        } as UserProfile);
        
        // Pre-fill blood group from target donor
        setFormData(prev => ({
          ...prev,
          bloodGroup: data.bloodGroup,
          isEmergency: false,
          isAmberAlert: false,
        }));
      }
    } catch (error) {
      console.error('Error fetching donor:', error);
    }
  };

  // Fixed bag count handlers
  const incrementBags = () => {
    setFormData(prev => ({
      ...prev,
      bagsNeeded: Math.min(10, prev.bagsNeeded + 1)
    }));
  };

  const decrementBags = () => {
    setFormData(prev => ({
      ...prev,
      bagsNeeded: Math.max(1, prev.bagsNeeded - 1)
    }));
  };

  // Notify matching donors when emergency request is created
  const notifyMatchingDonors = async (
    requestId: string,
    bloodGroup: string,
    patientName: string,
    hospitalName: string,
    requesterName: string,
    area: string,
    isAmberAlert: boolean
  ) => {
    try {
      // Query matching donors from Firestore
      let donorsQuery;
      
      if (isAmberAlert) {
        // Amber alert: notify ALL donors with matching blood type
        donorsQuery = query(
          collection(db, 'users'),
          where('isDonor', '==', true),
          where('bloodGroup', '==', bloodGroup),
          where('donorStatus', '==', 'available')
        );
      } else {
        // Regular emergency: notify donors in same area
        donorsQuery = query(
          collection(db, 'users'),
          where('isDonor', '==', true),
          where('bloodGroup', '==', bloodGroup),
          where('donorStatus', '==', 'available'),
          where('area', '==', area)
        );
      }

      const donorsSnap = await getDocs(donorsQuery);
      const donors: Array<{ fcmToken: string; donorName: string }> = [];

      donorsSnap.forEach((docSnap) => {
        const data = docSnap.data() as { fcmToken?: string; fullName?: string };
        if (data.fcmToken && docSnap.id !== user?.uid) {
          donors.push({
            fcmToken: data.fcmToken,
            donorName: data.fullName || 'Donor',
          });
        }
      });

      if (donors.length === 0) {
        console.log('No matching donors with FCM tokens found');
        return;
      }

      // Call edge function to send push notifications
      const { error } = await supabase.functions.invoke('notify-matching-donors', {
        body: {
          donors,
          bloodGroup,
          patientName,
          hospitalName,
          requesterName,
          requestId,
          urgencyLevel: isAmberAlert ? 'critical' : 'high',
        },
      });

      if (error) {
        console.error('Error notifying donors:', error);
      } else {
        console.log(`Notified ${donors.length} matching donors`);
      }
    } catch (error) {
      console.error('Error querying/notifying donors:', error);
    }
  };

  // Check for existing pending request to the same donor
  const checkDuplicateRequest = async (donorId: string): Promise<boolean> => {
    if (!user) return false;
    
    try {
      const duplicateQuery = query(
        collection(db, 'requests'),
        where('requesterId', '==', user.uid),
        where('targetDonorId', '==', donorId),
        where('status', '==', 'pending')
      );
      
      const snapshot = await getDocs(duplicateQuery);
      return !snapshot.empty;
    } catch (error) {
      console.error('Error checking duplicate:', error);
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check authentication first
    if (!user) {
      toast.error('You must be logged in to create a request');
      navigate('/login');
      return;
    }

    if (!profile) {
      toast.error('Please complete your profile first');
      navigate('/profile-setup');
      return;
    }

    // Detailed validation with specific messages
    if (!formData.patientName.trim()) {
      toast.error('Patient name is required');
      return;
    }
    if (!formData.contactPhone.trim()) {
      toast.error('Contact phone is required');
      return;
    }
    if (!formData.bloodGroup) {
      toast.error('Blood group is required');
      return;
    }
    if (!formData.hospitalName.trim() && !formData.hospitalAddress.trim()) {
      toast.error('Hospital name or address is required');
      return;
    }
    if (!formData.area) {
      toast.error('Area is required');
      return;
    }
    if (formData.bagsNeeded < 1) {
      toast.error('At least 1 bag is needed');
      return;
    }

    // Amber Alert specific validation
    if (formData.isAmberAlert && !formData.bloodGroup) {
      toast.error('Blood group is required for Amber Alert');
      return;
    }

    // Booking validation
    if (requestType === 'booking') {
      if (!formData.scheduledDate || !formData.scheduledTime) {
        toast.error('Please select date and time for booking');
        return;
      }
      const scheduledDateTime = new Date(`${formData.scheduledDate}T${formData.scheduledTime}`);
      if (scheduledDateTime <= new Date()) {
        toast.error('Scheduled time must be in the future');
        return;
      }
    }

    // Check for duplicate requests to same donor
    if (targetDonorId) {
      setCheckingDuplicate(true);
      const hasDuplicate = await checkDuplicateRequest(targetDonorId);
      setCheckingDuplicate(false);
      
      if (hasDuplicate) {
        toast.error('You already have a pending request to this donor. Please wait for their response or cancel the existing request.');
        return;
      }
    }

    setLoading(true);
    try {
      // Build scheduled date if booking
      let scheduledAt = null;
      if (requestType === 'booking' && formData.scheduledDate && formData.scheduledTime) {
        scheduledAt = new Date(`${formData.scheduledDate}T${formData.scheduledTime}`);
      }

      // Build request data with only plain JSON fields (Firestore compatible)
      const requestData: Record<string, any> = {
        // Required fields matching expected structure
        requesterId: user.uid,
        requesterName: profile.fullName || '',
        requesterPhone: profile.phoneNumber || '',
        patientName: formData.patientName.trim(),
        contactPhone: formData.contactPhone.trim(),
        bloodGroup: formData.bloodGroup,
        bagsNeeded: formData.bagsNeeded,
        hospitalName: formData.hospitalName.trim(),
        area: formData.area,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isEmergency: requestType === 'immediate' ? formData.isEmergency : false,
        isAmberAlert: requestType === 'immediate' ? formData.isAmberAlert : false,
        requestType: requestType,
      };

      // Add scheduled date for booking requests
      if (scheduledAt) {
        requestData.scheduledAt = scheduledAt;
      }

      // Add hospital location with coordinates if available
      if (hospitalLocation && hospitalLocation.lat && hospitalLocation.lng) {
        requestData.hospitalLocation = {
          lat: hospitalLocation.lat,
          lng: hospitalLocation.lng,
          address: hospitalLocation.address || formData.hospitalAddress.trim(),
        };
      } else if (formData.hospitalAddress.trim()) {
        // Fallback to text-only address if no coordinates
        requestData.hospitalLocation = {
          address: formData.hospitalAddress.trim(),
        };
      }

      if (formData.notes.trim()) {
        requestData.notes = formData.notes.trim();
      }

      if (targetDonorId) {
        requestData.targetDonorId = targetDonorId;
      }

      // Add to requests collection
      const requestRef = await addDoc(collection(db, 'requests'), requestData);

      // If emergency or amber alert, notify matching donors via push notifications
      if (formData.isEmergency || formData.isAmberAlert) {
        await notifyMatchingDonors(
          requestRef.id,
          formData.bloodGroup,
          formData.patientName,
          formData.hospitalName,
          profile.fullName || 'Someone',
          formData.area,
          formData.isAmberAlert
        );
      }

      if (requestType === 'booking') {
        toast.success(`Booking request sent! Scheduled for ${format(scheduledAt!, 'PPP p')}`);
      } else if (formData.isAmberAlert) {
        toast.success('🚨 Amber Alert sent to ALL donors of ' + formData.bloodGroup + ' blood type!');
      } else if (formData.isEmergency) {
        toast.success('Emergency request sent to matching donors in ' + formData.area + '!');
      } else {
        toast.success('Request sent to ' + (targetDonor?.fullName || 'donor') + '!');
      }
      
      navigate('/requests');
    } catch (error: any) {
      console.error('Error creating request:', error);
      
      // Provide specific error messages
      if (error.code === 'permission-denied') {
        toast.error('Permission denied. Please make sure you are logged in.');
      } else if (error.code === 'unavailable') {
        toast.error('Network error. Please check your internet connection.');
      } else {
        toast.error('Failed to create request: ' + (error.message || 'Please try again.'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="container max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="font-bold text-lg">{t('createRequest.title')}</h1>
          </div>
        </div>
      </header>

      <main className="container max-w-2xl mx-auto px-4 py-6">
        <Card className="animate-fade-in">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <BloodDropIcon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle>
                  {targetDonor ? `${t('createRequest.requestFrom')} ${targetDonor.fullName}` : t('createRequest.formTitle')}
                </CardTitle>
                <CardDescription>
                  {targetDonor 
                    ? t('createRequest.fillDetails')
                    : t('createRequest.formDescription')
                  }
                </CardDescription>
              </div>
            </div>
            
            {targetDonor && (
              <div className="mt-4 p-3 rounded-lg bg-secondary/50 flex items-center gap-3">
                <BloodGroupBadge bloodGroup={targetDonor.bloodGroup} size="sm" />
                <div>
                  <p className="font-medium text-sm">{targetDonor.fullName}</p>
                  <p className="text-xs text-muted-foreground">{targetDonor.area}</p>
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Request Type Toggle (only for direct donor requests) */}
              {targetDonorId && (
                <div className="space-y-2">
                  <Label>{t('createRequest.requestType')}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={requestType === 'immediate' ? 'default' : 'outline'}
                      className="w-full"
                      onClick={() => setRequestType('immediate')}
                    >
                      <AlertCircle className="w-4 h-4 mr-2" />
                      {t('createRequest.immediate')}
                    </Button>
                    <Button
                      type="button"
                      variant={requestType === 'booking' ? 'default' : 'outline'}
                      className="w-full"
                      onClick={() => setRequestType('booking')}
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      {t('createRequest.bookForLater')}
                    </Button>
                  </div>
                  {requestType === 'booking' && (
                    <p className="text-xs text-muted-foreground">
                      {t('createRequest.bookingInfo')}
                    </p>
                  )}
                </div>
              )}

              {/* Scheduled Date/Time for Booking */}
              {requestType === 'booking' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="scheduledDate">
                      <Calendar className="w-4 h-4 inline mr-1" />
                      {t('createRequest.date')} *
                    </Label>
                    <Input
                      id="scheduledDate"
                      type="date"
                      value={formData.scheduledDate}
                      onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                      min={format(new Date(), 'yyyy-MM-dd')}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="scheduledTime">
                      <Clock className="w-4 h-4 inline mr-1" />
                      {t('createRequest.time')} *
                    </Label>
                    <Input
                      id="scheduledTime"
                      type="time"
                      value={formData.scheduledTime}
                      onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
                      required
                    />
                  </div>
                </div>
              )}

              {/* Request for self toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <div>
                  <Label className="text-base">{t('createRequest.requestForSelf')}</Label>
                  <p className="text-sm text-muted-foreground">{t('createRequest.autoFill')}</p>
                </div>
                <Switch
                  checked={isForSelf}
                  onCheckedChange={setIsForSelf}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="patientName">{t('createRequest.patientName')} *</Label>
                <Input
                  id="patientName"
                  value={formData.patientName}
                  onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
                  placeholder="Patient name দিন"
                  disabled={isForSelf}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactPhone">{t('createRequest.contactPhone')} *</Label>
                <Input
                  id="contactPhone"
                  type="tel"
                  value={formData.contactPhone}
                  onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                  placeholder="01XXXXXXXXX"
                  disabled={isForSelf}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('createRequest.bloodGroup')} *</Label>
                  <Select
                    value={formData.bloodGroup}
                    onValueChange={(v) => setFormData({ ...formData, bloodGroup: v as BloodGroup })}
                    disabled={!!targetDonor}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('createRequest.selectBloodGroup')} />
                    </SelectTrigger>
                    <SelectContent>
                      {BLOOD_GROUPS.map((bg) => (
                        <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Fixed Bags Needed - Using +/- buttons instead of number input */}
                <div className="space-y-2">
                  <Label>{t('createRequest.bagsNeeded')} *</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={decrementBags}
                      disabled={formData.bagsNeeded <= 1}
                      className="h-10 w-10"
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                    <div className="flex-1 h-10 flex items-center justify-center bg-secondary rounded-lg font-semibold text-lg">
                      {formData.bagsNeeded}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={incrementBags}
                      disabled={formData.bagsNeeded >= 10}
                      className="h-10 w-10"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hospitalName">{t('requests.hospital')} *</Label>
                <LocationSearch
                  value={formData.hospitalName}
                  onChange={(name) => setFormData({ ...formData, hospitalName: name })}
                  onLocationSelect={(location) => {
                    if (location.lat && location.lng) {
                      setFormData({ 
                        ...formData, 
                        hospitalName: location.name || formData.hospitalName,
                        hospitalAddress: location.address,
                      });
                      setHospitalLocation({
                        lat: location.lat,
                        lng: location.lng,
                        address: location.address,
                      });
                    }
                  }}
                  placeholder={t('createRequest.searchHospital')}
                />
                <p className="text-xs text-muted-foreground">
                  {t('createRequest.searchLocation')}
                </p>
              </div>

              {/* Manual Hospital Address - always visible */}
              <div className="space-y-2">
                <Label htmlFor="hospitalAddress">
                  {t('createRequest.hospitalAddress')}
                  {!formData.hospitalName && ' *'}
                </Label>
                <Input
                  id="hospitalAddress"
                  value={formData.hospitalAddress}
                  onChange={(e) => setFormData({ ...formData, hospitalAddress: e.target.value })}
                  placeholder={t('createRequest.manualAddressPlaceholder')}
                />
                <p className="text-xs text-muted-foreground">
                  {t('createRequest.manualAddressHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label>{t('createRequest.area')} *</Label>
                <Select
                  value={formData.area}
                  onValueChange={(v) => setFormData({ ...formData, area: v as Area })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('createRequest.selectArea')} />
                  </SelectTrigger>
                  <SelectContent>
                    {AREAS.map((area) => (
                      <SelectItem key={area} value={area}>{area}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">{t('createRequest.notes')}</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder={t('createRequest.notesPlaceholder')}
                  rows={3}
                />
              </div>

              {!targetDonor && requestType === 'immediate' && (
                <>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-primary" />
                      <div>
                        <Label className="text-base font-medium">{t('createRequest.emergencyRequest')}</Label>
                        <p className="text-sm text-muted-foreground">{t('createRequest.emergencyInfo')}</p>
                      </div>
                    </div>
                    <Switch
                      checked={formData.isEmergency}
                      onCheckedChange={(checked) => setFormData({ ...formData, isEmergency: checked, isAmberAlert: false })}
                    />
                  </div>

                  {formData.isEmergency && (
                    <div className="flex items-center justify-between p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                      <div className="flex items-center gap-2">
                        <Siren className="w-5 h-5 text-destructive" />
                        <div>
                          <Label className="text-base font-medium text-destructive">{t('createRequest.amberAlert')}</Label>
                          <p className="text-sm text-muted-foreground">
                            {t('createRequest.amberAlertInfo')} ({formData.bloodGroup || 'matching'})
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={formData.isAmberAlert}
                        onCheckedChange={(checked) => setFormData({ ...formData, isAmberAlert: checked })}
                      />
                    </div>
                  )}
                </>
              )}

              <Button 
                type="submit" 
                className="w-full" 
                size="lg" 
                variant={formData.isAmberAlert ? 'destructive' : formData.isEmergency ? 'emergency' : 'default'}
                disabled={loading || checkingDuplicate}
              >
                {loading || checkingDuplicate ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    {checkingDuplicate ? 'Checking...' : t('createRequest.submitting')}
                  </span>
                ) : requestType === 'booking' ? (
                  <>
                    <Calendar className="w-4 h-4 mr-2" />
                    {t('createRequest.bookForLater')}
                  </>
                ) : formData.isAmberAlert ? (
                  <>
                    <Siren className="w-4 h-4 mr-2" />
                    {t('createRequest.amberAlert')} পাঠান
                  </>
                ) : formData.isEmergency ? (
                  <>
                    <AlertCircle className="w-4 h-4 mr-2" />
                    Emergency Alert পাঠান
                  </>
                ) : (
                  t('createRequest.submitRequest')
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default CreateRequest;