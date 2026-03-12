import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Hospital, BloodStock, BLOOD_GROUPS, AREAS, Area, BloodGroup } from '@/types';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, Droplet, AlertCircle, Users, Building2, Clock, Edit, LogOut, History, Plus, Minus, Search, PlusCircle, Inbox } from 'lucide-react';
import { format } from 'date-fns';
import { logMultipleBloodStockChanges, useBloodStockHistory } from '@/hooks/useBloodStockHistory';
import { useHospitalBloodStock } from '@/hooks/useHospitalBloodStock';

const HospitalDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, logout } = useAuth();
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const hospitalId = profile?.hospitalId || null;
  
  const {
    bloodStock: liveBloodStock,
    loading: stockLoading,
    error: stockError,
    updateAllBloodStock,
    clearError,
  } = useHospitalBloodStock(hospitalId);
  
  const [localBloodStock, setLocalBloodStock] = useState<BloodStock>({
    'A+': 0, 'A-': 0, 'B+': 0, 'B-': 0,
    'O+': 0, 'O-': 0, 'AB+': 0, 'AB-': 0,
  });
  const previousStockRef = useRef<BloodStock>({
    'A+': 0, 'A-': 0, 'B+': 0, 'B-': 0,
    'O+': 0, 'O-': 0, 'AB+': 0, 'AB-': 0,
  });
  
  const [hasEmergencyAvailability, setHasEmergencyAvailability] = useState(false);
  const [hasKnownDonors, setHasKnownDonors] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: '',
    contactPhone: '',
    contactEmail: '',
    address: '',
    area: 'Dhaka' as Area,
  });
  
  useEffect(() => {
    if (!stockLoading && liveBloodStock) {
      setLocalBloodStock(liveBloodStock);
      previousStockRef.current = { ...liveBloodStock };
    }
  }, [liveBloodStock, stockLoading]);

  useEffect(() => {
    if (!user || !hospitalId) {
      navigate('/hospital-login');
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'hospitals', hospitalId),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const hospitalRecord: Hospital = {
            ...data,
            id: snapshot.id,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
            lastStockUpdate: data.lastStockUpdate?.toDate() || null,
          } as Hospital;
          setHospital(hospitalRecord);
          setHasEmergencyAvailability(hospitalRecord.hasEmergencyAvailability || false);
          setHasKnownDonors(hospitalRecord.hasKnownDonors || false);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching hospital:', error);
        toast.error('Failed to load hospital data');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, hospitalId, navigate]);

  const handleUpdateStock = async () => {
    if (!hospital || !hospitalId) return;

    for (const group of BLOOD_GROUPS) {
      if (localBloodStock[group] < 0) {
        toast.error(`Bag count for ${group} cannot be negative`);
        return;
      }
    }

    setSaving(true);
    try {
      // SYNC FIX: Update Root Document with both inventory (Mobile) and bloodStock (Web)
      await updateDoc(doc(db, 'hospitals', hospital.id), {
        bloodStock: localBloodStock, // Web compatibility
        inventory: localBloodStock,  // Mobile compatibility
        hasEmergencyAvailability,
        hasKnownDonors,
        lastStockUpdate: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      await logMultipleBloodStockChanges(
        hospital.id,
        hospital.name,
        previousStockRef.current,
        localBloodStock,
        hospitalId,
        profile?.hospitalName || hospital.name,
        'hospital'
      );
      
      previousStockRef.current = { ...localBloodStock };
      toast.success('Blood stock updated successfully!');
    } catch (error) {
      console.error('Error updating stock:', error);
      toast.error('Failed to update stock');
    } finally {
      setSaving(false);
    }
  };
  
  const { history: stockHistory, loading: historyLoading } = useBloodStockHistory(hospital?.id || null);

  const handleStockChange = (group: keyof BloodStock, value: string) => {
    const numValue = parseInt(value) || 0;
    setLocalBloodStock((prev) => ({
      ...prev,
      [group]: Math.max(0, numValue),
    }));
  };

  const totalBags = Object.values(localBloodStock).reduce((sum, val) => sum + val, 0);

  const handleOpenProfileDialog = () => {
    if (hospital) {
      setProfileForm({
        name: hospital.name,
        contactPhone: hospital.contactPhone,
        contactEmail: hospital.contactEmail || '',
        address: hospital.address,
        area: hospital.area,
      });
      setShowProfileDialog(true);
    }
  };

  const handleSaveProfile = async () => {
    if (!hospital || !profileForm.name || !profileForm.contactPhone) {
      toast.error('Name and phone number are required');
      return;
    }

    setSavingProfile(true);
    try {
      await updateDoc(doc(db, 'hospitals', hospital.id), {
        name: profileForm.name,
        contactPhone: profileForm.contactPhone,
        contactEmail: profileForm.contactEmail || null,
        address: profileForm.address,
        area: profileForm.area,
        updatedAt: serverTimestamp(),
      });
      toast.success('Profile updated successfully!');
      setShowProfileDialog(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/hospital-login');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Failed to logout');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!hospital) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Hospital data not found
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b">
        <div className="container max-w-2xl mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">{hospital.name}</h1>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">{hospital.type.replace('_', ' ')}</Badge>
              {hospital.isVerified && (
                <Badge variant="outline" className="text-xs text-success border-success">Verified</Badge>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleOpenProfileDialog} title="Edit Profile">
            <Edit className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout">
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <main className="container max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Quick Actions - Search Donors & Create Request */}
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Search className="w-5 h-5 text-primary" />
              Find Donors
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Search for blood donors or create emergency requests just like regular users.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button 
                variant="default" 
                className="flex-1"
                onClick={() => navigate('/')}
              >
                <Search className="w-4 h-4 mr-2" />
                Search Donors
              </Button>
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => navigate('/create-request')}
              >
                <PlusCircle className="w-4 h-4 mr-2" />
                Create Request
              </Button>
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => navigate('/requests')}
              >
                <Inbox className="w-4 h-4 mr-2" />
                My Requests
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Manage Blood Stock Section Header */}
        <div className="flex items-center gap-2 pt-2">
          <Building2 className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Manage Your Blood Stock</h2>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Droplet className="w-8 h-8 text-destructive" />
              <div>
                <p className="text-2xl font-bold">{totalBags}</p>
                <p className="text-sm text-muted-foreground">Total Blood Bags</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="w-8 h-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Last Updated</p>
                <p className="text-xs text-muted-foreground">
                  {hospital.lastStockUpdate ? format(hospital.lastStockUpdate, 'PPp') : 'Never'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Droplet className="w-5 h-5 text-destructive" />
              Blood Stock
              {stockLoading && (
                <span className="text-sm font-normal text-muted-foreground">(Loading...)</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {stockError && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {stockError}
                <Button variant="ghost" size="sm" onClick={clearError} className="ml-auto">
                  Dismiss
                </Button>
              </div>
            )}
            <div className="grid grid-cols-4 gap-3">
              {BLOOD_GROUPS.map((group) => (
                <div key={group} className="space-y-1">
                  <Label className="text-center block text-sm font-medium">{group}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={localBloodStock[group]}
                    onChange={(e) => handleStockChange(group, e.target.value)}
                    className="text-center"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Availability Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-destructive" />
                <div>
                  <p className="font-medium">Emergency Availability</p>
                  <p className="text-sm text-muted-foreground">Available for emergency cases 24/7</p>
                </div>
              </div>
              <Switch
                checked={hasEmergencyAvailability}
                onCheckedChange={setHasEmergencyAvailability}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium">Known Donors Available</p>
                  <p className="text-sm text-muted-foreground">Have donors on standby for urgent needs</p>
                </div>
              </div>
              <Switch
                checked={hasKnownDonors}
                onCheckedChange={setHasKnownDonors}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Hospital Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Address:</span>
              <span className="text-right">{hospital.address}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Area:</span>
              <span>{hospital.area}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone:</span>
              <span>{hospital.contactPhone}</span>
            </div>
            {hospital.contactEmail && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email:</span>
                <span>{hospital.contactEmail}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button className="flex-1" size="lg" onClick={handleUpdateStock} disabled={saving}>
            {saving ? (
              <>Saving...</>
            ) : (
              <>
                <Save className="w-5 h-5 mr-2" />
                Save Changes
              </>
            )}
          </Button>
          <Button variant="outline" size="lg" onClick={() => setShowHistoryDialog(true)}>
            <History className="w-5 h-5" />
          </Button>
        </div>
      </main>

      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Blood Stock History
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {historyLoading ? (
              <div className="text-center text-muted-foreground py-8">Loading history...</div>
            ) : stockHistory.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">No history yet</div>
            ) : (
              stockHistory.map((entry) => (
                <div key={entry.id} className="border rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <Badge variant={entry.action === 'added' ? 'default' : entry.action === 'removed' ? 'destructive' : 'secondary'}>
                      {entry.action === 'added' ? <Plus className="w-3 h-3 mr-1" /> : entry.action === 'removed' ? <Minus className="w-3 h-3 mr-1" /> : null}
                      {entry.action.charAt(0).toUpperCase() + entry.action.slice(1)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{format(entry.createdAt, 'PPp')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-destructive border-destructive">{entry.bloodGroup}</Badge>
                    <span className="text-sm">
                      {entry.previousQuantity} → {entry.newQuantity} bags
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    By: {entry.performedByName} ({entry.performedByRole})
                  </p>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHistoryDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Edit Profile
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Hospital / Blood Bank Name *</Label>
              <Input
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                placeholder="Enter name"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone Number *</Label>
              <Input
                value={profileForm.contactPhone}
                onChange={(e) => setProfileForm({ ...profileForm, contactPhone: e.target.value })}
                placeholder="+880..."
              />
            </div>
            <div className="space-y-2">
              <Label>Email (optional)</Label>
              <Input
                type="email"
                value={profileForm.contactEmail}
                onChange={(e) => setProfileForm({ ...profileForm, contactEmail: e.target.value })}
                placeholder="contact@hospital.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={profileForm.address}
                onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                placeholder="Full address"
              />
            </div>
            <div className="space-y-2">
              <Label>Area</Label>
              <Select value={profileForm.area} onValueChange={(v) => setProfileForm({ ...profileForm, area: v as Area })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AREAS.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProfileDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveProfile} disabled={savingProfile}>
              {savingProfile ? 'Saving...' : 'Save Profile'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HospitalDashboard;
