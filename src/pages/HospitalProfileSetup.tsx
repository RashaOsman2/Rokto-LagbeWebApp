import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Save, MapPin, Loader2 } from 'lucide-react';
import { useGeolocation } from '@/hooks/useGeolocation';

const HospitalProfileSetup: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const { getCurrentPosition } = useGeolocation();
  const [loading, setLoading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [form, setForm] = useState({
    hospitalName: '',
    phoneNumber: '',
    address: '',
    location: null as { lat: number; lng: number } | null,
  });

  useEffect(() => {
    if (!user) {
      navigate('/hospital-login');
      return;
    }

    // Pre-fill form with existing data
    if (profile) {
      setForm({
        hospitalName: profile.hospitalName || profile.fullName || '',
        phoneNumber: profile.phoneNumber || '',
        address: profile.address || '',
        location: profile.location || null,
      });
    }
  }, [user, profile, navigate]);

  // Check if user needs profile setup
  useEffect(() => {
    if (profile && !profile.needsProfileSetup) {
      navigate('/hospital-dashboard');
    }
  }, [profile, navigate]);

  const handleGetLocation = async () => {
    setGettingLocation(true);
    try {
      const position = await getCurrentPosition();
      setForm(prev => ({ ...prev, location: position }));
      toast.success('Location captured successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to get location');
    } finally {
      setGettingLocation(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.hospitalName || !form.phoneNumber || !form.address) {
      toast.error('Hospital name, phone number, and address are required');
      return;
    }

    if (!user) {
      toast.error('Not authenticated');
      return;
    }

    setLoading(true);
    try {
      // Update user profile
      await updateDoc(doc(db, 'users', user.uid), {
        fullName: form.hospitalName,
        hospitalName: form.hospitalName,
        phoneNumber: form.phoneNumber,
        address: form.address,
        location: form.location,
        needsProfileSetup: false,
        updatedAt: serverTimestamp(),
      });

      // Also update the hospital document if we have hospitalId
      if (profile?.hospitalId) {
        await updateDoc(doc(db, 'hospitals', profile.hospitalId), {
          contactPhone: form.phoneNumber,
          address: form.address,
          location: form.location,
          updatedAt: serverTimestamp(),
        });
      }

      await refreshProfile();
      toast.success('Profile setup complete!');
      navigate('/hospital-dashboard');
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast.error('Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Complete Your Profile</CardTitle>
          <CardDescription>
            Please provide the required information to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hospitalName">Hospital Name *</Label>
              <Input
                id="hospitalName"
                value={form.hospitalName}
                onChange={(e) => setForm({ ...form, hospitalName: e.target.value })}
                placeholder="Enter hospital name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Contact Phone *</Label>
              <Input
                id="phoneNumber"
                type="tel"
                value={form.phoneNumber}
                onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                placeholder="+880..."
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address *</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="e.g. Near Dhaka Medical College, Block C, Mirpur"
                required
              />
              <p className="text-xs text-muted-foreground">
                Enter your hospital address or a nearby landmark
              </p>
            </div>
            <div className="space-y-2">
              <Label>GPS Location (Optional)</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={handleGetLocation}
                  disabled={gettingLocation}
                >
                  {gettingLocation ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Getting location...
                    </>
                  ) : (
                    <>
                      <MapPin className="w-4 h-4 mr-2" />
                      {form.location ? 'Location Captured' : 'Get GPS Location'}
                    </>
                  )}
                </Button>
              </div>
              {form.location && (
                <p className="text-xs text-green-600">
                  GPS location captured for map navigation
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Complete Setup
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default HospitalProfileSetup;
