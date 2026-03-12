import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BloodDropIcon } from '@/components/BloodDropIcon';
import { BLOOD_GROUPS, AREAS, BloodGroup, Area, COOLDOWN_PERIOD_MS } from '@/types';
import { toast } from 'sonner';
import { addDays, differenceInDays } from 'date-fns';

type LastDonationOption = 'never' | '3months' | 'recent';

const ProfileSetup: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    fullName: user?.displayName || '',
    phoneNumber: '',
    bloodGroup: '' as BloodGroup | '',
    area: '' as Area | '',
    isDonor: false,
  });

  const [lastDonationOption, setLastDonationOption] = useState<LastDonationOption>('never');
  const [daysAgoDonated, setDaysAgoDonated] = useState<string>('');

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.fullName || !formData.phoneNumber || !formData.bloodGroup || !formData.area) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Validate phone number (Bangladesh format)
    const phoneRegex = /^(\+880|880|0)?1[3-9]\d{8}$/;
    if (!phoneRegex.test(formData.phoneNumber.replace(/\s/g, ''))) {
      toast.error('Please enter a valid Bangladesh phone number');
      return;
    }

    // Validate recent donation days if selected
    if (formData.isDonor && lastDonationOption === 'recent') {
      const days = parseInt(daysAgoDonated);
      if (isNaN(days) || days < 0 || days > 89) {
        toast.error('Please enter valid days (0-89) since last donation');
        return;
      }
    }

    setLoading(true);
    try {
      const donorData = formData.isDonor ? calculateDonorStatus() : { donorStatus: 'unavailable' as const, lastDonationDate: null };

      await updateProfile({
        fullName: formData.fullName,
        phoneNumber: formData.phoneNumber,
        bloodGroup: formData.bloodGroup as BloodGroup,
        area: formData.area as Area,
        isDonor: formData.isDonor,
        donorStatus: formData.isDonor ? donorData.donorStatus : 'unavailable',
        lastDonationDate: donorData.lastDonationDate || null,
      });
      
      if (formData.isDonor && donorData.donorStatus === 'cooldown' && donorData.cooldownDaysRemaining) {
        toast.success(`Profile created! You're in cooldown for ${donorData.cooldownDaysRemaining} days.`);
      } else {
        toast.success('Profile created successfully!');
      }
      navigate('/');
    } catch (error: any) {
      console.error('Profile setup error:', error);
      const code = String(error?.code || '');
      if (code.includes('permission-denied')) {
        toast.error('Profile save blocked by Firestore rules (permission denied).');
      } else {
        toast.error('Failed to create profile. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md animate-fade-in">
          <CardHeader className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto mb-2">
              <BloodDropIcon className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Complete Your Profile</CardTitle>
            <CardDescription>
              Help us connect you with blood donors and requesters
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name *</Label>
                <Input
                  id="fullName"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="Enter your full name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number *</Label>
                <Input
                  id="phoneNumber"
                  type="tel"
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                  placeholder="01XXXXXXXXX"
                  required
                />
                <p className="text-xs text-muted-foreground">Bangladesh number format</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bloodGroup">Blood Group *</Label>
                <Select
                  value={formData.bloodGroup}
                  onValueChange={(value) => setFormData({ ...formData, bloodGroup: value as BloodGroup })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select your blood group" />
                  </SelectTrigger>
                  <SelectContent>
                    {BLOOD_GROUPS.map((bg) => (
                      <SelectItem key={bg} value={bg}>
                        {bg}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="area">Area *</Label>
                <Select
                  value={formData.area}
                  onValueChange={(value) => setFormData({ ...formData, area: value as Area })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select your area" />
                  </SelectTrigger>
                  <SelectContent>
                    {AREAS.map((area) => (
                      <SelectItem key={area} value={area}>
                        {area}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border">
                <div className="space-y-0.5">
                  <Label htmlFor="isDonor" className="text-base font-medium">
                    Register as a Blood Donor
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Make yourself available to donate blood
                  </p>
                </div>
                <Switch
                  id="isDonor"
                  checked={formData.isDonor}
                  onCheckedChange={(checked) => setFormData({ ...formData, isDonor: checked })}
                />
              </div>

              {/* Last Donation Selection - Only show if registering as donor */}
              {formData.isDonor && (
                <div className="space-y-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <Label className="text-base font-medium">When did you last donate blood?</Label>
                  
                  <div className="space-y-2">
                    <div 
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${lastDonationOption === 'never' ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/50 hover:bg-secondary'}`}
                      onClick={() => setLastDonationOption('never')}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 ${lastDonationOption === 'never' ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
                        {lastDonationOption === 'never' && <div className="w-full h-full rounded-full bg-primary" />}
                      </div>
                      <div>
                        <p className="font-medium">Never donated</p>
                        <p className="text-sm text-muted-foreground">This will be my first donation</p>
                      </div>
                    </div>

                    <div 
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${lastDonationOption === '3months' ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/50 hover:bg-secondary'}`}
                      onClick={() => setLastDonationOption('3months')}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 ${lastDonationOption === '3months' ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
                        {lastDonationOption === '3months' && <div className="w-full h-full rounded-full bg-primary" />}
                      </div>
                      <div>
                        <p className="font-medium">More than 3 months ago</p>
                        <p className="text-sm text-muted-foreground">Ready to donate again</p>
                      </div>
                    </div>

                    <div 
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${lastDonationOption === 'recent' ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/50 hover:bg-secondary'}`}
                      onClick={() => setLastDonationOption('recent')}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 ${lastDonationOption === 'recent' ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
                        {lastDonationOption === 'recent' && <div className="w-full h-full rounded-full bg-primary" />}
                      </div>
                      <div>
                        <p className="font-medium">Less than 3 months ago (recently)</p>
                        <p className="text-sm text-muted-foreground">You'll be in cooldown period</p>
                      </div>
                    </div>

                    {lastDonationOption === 'recent' && (
                      <div className="mt-3 p-3 rounded-lg bg-warning/10 border border-warning/20">
                        <Label htmlFor="daysAgo" className="text-sm font-medium">How many days ago?</Label>
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
                            ⏳ You'll be in cooldown for {90 - parseInt(daysAgoDonated)} more days
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {(lastDonationOption === 'never' || lastDonationOption === '3months') && (
                    <p className="text-sm text-success font-medium">
                      ✓ You'll be immediately available for donation
                    </p>
                  )}
                </div>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Creating Profile...
                  </span>
                ) : (
                  'Create Profile'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProfileSetup;