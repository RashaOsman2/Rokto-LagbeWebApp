import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BloodGroupBadge } from '@/components/BloodGroupBadge';
import { StatusBadge } from '@/components/StatusBadge';
import { NotificationSettings } from '@/components/NotificationSettings';
import { LanguageSettings } from '@/components/LanguageSettings';
import { ProfilePictureUpload } from '@/components/ProfilePictureUpload';
import { BLOOD_GROUPS, AREAS, BloodGroup, Area } from '@/types';
import { ArrowLeft, Calendar, MapPin, Shield, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { format, addMonths, addDays, differenceInDays } from 'date-fns';

type LastDonationOption = 'never' | '3months' | 'recent';

const Profile: React.FC = () => {
  const { user, profile, updateProfile, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showDonorDialog, setShowDonorDialog] = useState(false);
  const [lastDonationOption, setLastDonationOption] = useState<LastDonationOption>('never');
  const [daysAgoDonated, setDaysAgoDonated] = useState<string>('');

  const [formData, setFormData] = useState({
    fullName: profile?.fullName || '',
    phoneNumber: profile?.phoneNumber || '',
    bloodGroup: profile?.bloodGroup || '' as BloodGroup | '',
    area: profile?.area || '' as Area | '',
  });

  // Calculate cooldown based on last donation
  const calculateDonorStatus = (): { donorStatus: 'available' | 'cooldown'; lastDonationDate: Date | null; cooldownDaysRemaining?: number } => {
    if (lastDonationOption === 'never' || lastDonationOption === '3months') {
      return { donorStatus: 'available', lastDonationDate: null };
    }
    
    // Recent donation
    const days = parseInt(daysAgoDonated) || 0;
    if (days >= 90) {
      return { donorStatus: 'available', lastDonationDate: null };
    }
    
    const lastDonationDate = addDays(new Date(), -days);
    const cooldownEndDate = addDays(lastDonationDate, 90);
    const cooldownDaysRemaining = differenceInDays(cooldownEndDate, new Date());
    
    return { 
      donorStatus: 'cooldown', 
      lastDonationDate,
      cooldownDaysRemaining: Math.max(0, cooldownDaysRemaining)
    };
  };

  const handleSave = async () => {
    if (!formData.fullName || !formData.phoneNumber || !formData.bloodGroup || !formData.area) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await updateProfile({
        fullName: formData.fullName,
        phoneNumber: formData.phoneNumber,
        bloodGroup: formData.bloodGroup as BloodGroup,
        area: formData.area as Area,
      });
      toast.success('Profile updated successfully!');
      setEditing(false);
    } catch (error) {
      toast.error('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDonor = (isDonor: boolean) => {
    if (isDonor) {
      // Show dialog to ask about last donation
      setShowDonorDialog(true);
    } else {
      // Disable donor mode directly
      disableDonorMode();
    }
  };

  const disableDonorMode = async () => {
    setLoading(true);
    try {
      await updateProfile({
        isDonor: false,
        donorStatus: 'unavailable',
      });
      toast.success('Donor mode disabled');
    } catch (error) {
      toast.error('Failed to update donor status');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDonorRegistration = async () => {
    // Validate recent donation days if selected
    if (lastDonationOption === 'recent') {
      const days = parseInt(daysAgoDonated);
      if (isNaN(days) || days < 0 || days > 89) {
        toast.error('Please enter valid days (0-89) since last donation');
        return;
      }
    }

    setLoading(true);
    try {
      const donorData = calculateDonorStatus();
      
      await updateProfile({
        isDonor: true,
        donorStatus: donorData.donorStatus,
        lastDonationDate: donorData.lastDonationDate || null,
      });
      
      if (donorData.donorStatus === 'cooldown' && donorData.cooldownDaysRemaining) {
        toast.success(`Registered as donor! You're in cooldown for ${donorData.cooldownDaysRemaining} days.`);
      } else {
        toast.success('You are now registered as a donor!');
      }
      
      setShowDonorDialog(false);
      // Reset form
      setLastDonationOption('never');
      setDaysAgoDonated('');
    } catch (error) {
      toast.error('Failed to register as donor');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAvailability = async (available: boolean) => {
    if (profile?.donorStatus === 'cooldown') {
      toast.error('You are in cooldown period and cannot change availability');
      return;
    }

    setLoading(true);
    try {
      await updateProfile({
        donorStatus: available ? 'available' : 'unavailable',
      });
      toast.success(available ? 'You are now available for donations' : 'You are now unavailable');
    } catch (error) {
      toast.error('Failed to update availability');
    } finally {
      setLoading(false);
    }
  };

  // Location toggle removed from profile - live sharing only happens after accepting requests

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      toast.error('Failed to logout');
    }
  };

  const cooldownEndDate = profile?.lastDonationDate 
    ? addMonths(profile.lastDonationDate, 3)
    : null;
  
  const cooldownDaysRemaining = cooldownEndDate 
    ? Math.max(0, differenceInDays(cooldownEndDate, new Date()))
    : 0;

  if (!profile) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="container max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="font-bold text-lg">{t('profile.title')}</h1>
          </div>
        </div>
      </header>

      <main className="container max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Profile Picture Upload */}
        <Card>
          <CardContent className="pt-6">
            <ProfilePictureUpload
              currentPhotoURL={profile.photoURL}
              userName={profile.fullName}
            />
          </CardContent>
        </Card>

        {/* Profile Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <BloodGroupBadge bloodGroup={profile.bloodGroup} size="lg" />
                <div>
                  <CardTitle>{profile.fullName}</CardTitle>
                  <CardDescription>{profile.email || profile.phoneNumber}</CardDescription>
                </div>
              </div>
              {profile.isDonor && <StatusBadge status={profile.donorStatus} />}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {editing ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">{t('profile.fullName')}</Label>
                  <Input
                    id="fullName"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phoneNumber">{t('profile.phoneNumber')}</Label>
                  <Input
                    id="phoneNumber"
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('profile.bloodGroup')}</Label>
                  <Select
                    value={formData.bloodGroup}
                    onValueChange={(v) => setFormData({ ...formData, bloodGroup: v as BloodGroup })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BLOOD_GROUPS.map((bg) => (
                        <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t('profile.area')}</Label>
                  <Select
                    value={formData.area}
                    onValueChange={(v) => setFormData({ ...formData, area: v as Area })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AREAS.map((area) => (
                        <SelectItem key={area} value={area}>{area}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => setEditing(false)} className="flex-1">
                    {t('common.cancel')}
                  </Button>
                  <Button onClick={handleSave} disabled={loading} className="flex-1">
                    {loading ? t('common.loading') : t('common.save')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <InfoRow label={t('profile.phoneNumber')} value={profile.phoneNumber} />
                <InfoRow label={t('profile.bloodGroup')} value={profile.bloodGroup} />
                <InfoRow label={t('profile.area')} value={profile.area} />
                <Button variant="outline" onClick={() => setEditing(true)} className="w-full">
                  {t('profile.editProfile')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Donor Registration Dialog */}
        <Dialog open={showDonorDialog} onOpenChange={setShowDonorDialog}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('donor.registerAsDonor')}</DialogTitle>
              <DialogDescription>
                {t('donor.lastDonation')}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-3 py-4">
              <Label className="text-base font-medium">{t('donor.lastDonation')}</Label>
              
              <div className="space-y-2">
                <div 
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${lastDonationOption === 'never' ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/50 hover:bg-secondary'}`}
                  onClick={() => setLastDonationOption('never')}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${lastDonationOption === 'never' ? 'border-primary' : 'border-muted-foreground'}`}>
                    {lastDonationOption === 'never' && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <div>
                    <p className="font-medium">{t('donor.neverDonated')}</p>
                    <p className="text-sm text-muted-foreground">{t('donor.firstDonation')}</p>
                  </div>
                </div>

                <div 
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${lastDonationOption === '3months' ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/50 hover:bg-secondary'}`}
                  onClick={() => setLastDonationOption('3months')}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${lastDonationOption === '3months' ? 'border-primary' : 'border-muted-foreground'}`}>
                    {lastDonationOption === '3months' && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <div>
                    <p className="font-medium">{t('donor.moreThan3Months')}</p>
                    <p className="text-sm text-muted-foreground">{t('donor.readyToDonate')}</p>
                  </div>
                </div>

                <div 
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${lastDonationOption === 'recent' ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/50 hover:bg-secondary'}`}
                  onClick={() => setLastDonationOption('recent')}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${lastDonationOption === 'recent' ? 'border-primary' : 'border-muted-foreground'}`}>
                    {lastDonationOption === 'recent' && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <div>
                    <p className="font-medium">{t('donor.lessThan3Months')}</p>
                    <p className="text-sm text-muted-foreground">{t('donor.willBeInCooldown')}</p>
                  </div>
                </div>

                {lastDonationOption === 'recent' && (
                  <div className="mt-3 p-3 rounded-lg bg-warning/10 border border-warning/20">
                    <Label htmlFor="daysAgo" className="text-sm font-medium">{t('donor.daysAgo')}</Label>
                    <Input
                      id="daysAgo"
                      type="number"
                      min={0}
                      max={89}
                      value={daysAgoDonated}
                      onChange={(e) => setDaysAgoDonated(e.target.value)}
                      placeholder="e.g., 10"
                      className="mt-2"
                    />
                    {daysAgoDonated && parseInt(daysAgoDonated) < 90 && (
                      <p className="text-sm text-warning mt-2">
                        ⏳ {t('donor.inCooldown')} {90 - parseInt(daysAgoDonated)} {t('donor.cooldownDays')}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {(lastDonationOption === 'never' || lastDonationOption === '3months') && (
                <p className="text-sm text-success font-medium">
                  ✓ {t('donor.immediatelyAvailable')}
                </p>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setShowDonorDialog(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleConfirmDonorRegistration} disabled={loading}>
                {loading ? t('common.loading') : t('donor.registerAsDonor')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Donor Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              {t('donor.title')}
            </CardTitle>
            <CardDescription>{t('donor.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
              <div>
                <Label className="text-base font-medium">{t('donor.registerAsDonor')}</Label>
                <p className="text-sm text-muted-foreground">{t('donor.receiveRequests')}</p>
              </div>
              <Switch
                checked={profile.isDonor}
                onCheckedChange={handleToggleDonor}
                disabled={loading}
              />
            </div>

            {profile.isDonor && (
              <>
                <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
                  <div>
                    <Label className="text-base font-medium">{t('donor.availableToDonate')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {profile.donorStatus === 'cooldown' 
                        ? t('donor.inCooldown')
                        : t('donor.toggleAvailability')
                      }
                    </p>
                  </div>
                  <Switch
                    checked={profile.donorStatus === 'available'}
                    onCheckedChange={handleToggleAvailability}
                    disabled={loading || profile.donorStatus === 'cooldown'}
                  />
                </div>

                {/* Donor location info - live sharing only after accepting request */}
                <div className="p-4 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-full bg-primary/10">
                      <MapPin className="w-4 h-4 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{t('location.sharing')}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('location.sharingActive')}
                      </p>
                      {profile.liveSharing && profile.liveSharingForRequestId && (
                        <div className="mt-2 p-2 rounded bg-success/10 border border-success/20">
                          <p className="text-xs text-success font-medium flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                            {t('location.sharingActive')}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {profile.donorStatus === 'cooldown' && cooldownEndDate && (
                  <div className="p-4 rounded-lg bg-warning/10 border border-warning/20">
                    <div className="flex items-center gap-2 text-warning font-medium">
                      <Calendar className="w-4 h-4" />
                      {t('donor.cooldownInfo')} ({cooldownDaysRemaining} {t('donor.cooldownDays')})
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('donor.cooldownEnds')}: {format(cooldownEndDate, 'MMM d, yyyy')}
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Language Settings */}
        <LanguageSettings />

        {/* Notification Settings */}
        <NotificationSettings />

        {/* Logout with confirmation */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="w-full">
              <LogOut className="w-4 h-4 mr-2" />
              {t('auth.logout')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
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
      </main>
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between py-2 border-b border-border last:border-0">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium">{value}</span>
  </div>
);

export default Profile;