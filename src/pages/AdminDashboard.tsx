import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, addDoc, serverTimestamp, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Hospital, HospitalAccount, BloodStock, HospitalType, Area, AREAS, BLOOD_GROUPS, BloodGroup } from '@/types';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Plus, Building2, Users, Edit, Trash2, Eye, EyeOff, Key, ShieldCheck, ShieldX, RefreshCw, Droplet, History, LogOut } from 'lucide-react';
import { format } from 'date-fns';
import { logMultipleBloodStockChanges, useAllBloodStockHistory } from '@/hooks/useBloodStockHistory';

const HOSPITAL_TYPES: { value: HospitalType; label: string }[] = [
  { value: 'hospital', label: 'Hospital' },
  { value: 'blood_bank', label: 'Blood Bank' },
  { value: 'diagnostic_center', label: 'Diagnostic Center' },
];

const initialBloodStock: BloodStock = {
  'A+': 0, 'A-': 0, 'B+': 0, 'B-': 0,
  'O+': 0, 'O-': 0, 'AB+': 0, 'AB-': 0,
};

interface CreateHospitalForm {
  name: string;
  type: HospitalType;
  area: Area;
  address: string;
  contactPhone: string;
  contactEmail: string;
  loginEmail: string;
  loginPassword: string;
}

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const auth = getAuth();
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showStockDialog, setShowStockDialog] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
  const [selectedAccountDetails, setSelectedAccountDetails] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showStoredPassword, setShowStoredPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [savingStock, setSavingStock] = useState(false);
  const [editBloodStock, setEditBloodStock] = useState<BloodStock>(initialBloodStock);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const previousStockRef = useRef<BloodStock>(initialBloodStock);
  
  const { history: allStockHistory, loading: historyLoading } = useAllBloodStockHistory(100);
  
  const [form, setForm] = useState<CreateHospitalForm>({
    name: '',
    type: 'hospital',
    area: 'Dhaka',
    address: '',
    contactPhone: '',
    contactEmail: '',
    loginEmail: '',
    loginPassword: '',
  });

  useEffect(() => {
    if (!user || profile?.role !== 'admin') {
      navigate('/');
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, 'hospitals'),
      (snapshot) => {
        const hospitalList: Hospital[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          hospitalList.push({
            ...data,
            id: doc.id,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
            lastStockUpdate: data.lastStockUpdate?.toDate() || null,
          } as Hospital);
        });
        setHospitals(hospitalList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching hospitals:', error);
        toast.error('Failed to load hospitals');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, profile, navigate]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Logged out successfully');
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Failed to logout');
    }
  };

  const handleCreateHospital = async () => {
    if (!form.name || !form.address || !form.contactPhone || !form.loginEmail || !form.loginPassword) {
      toast.error('Please fill all required fields');
      return;
    }

    if (form.loginPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setCreating(true);

    try {
      // First create the hospital document
      const hospitalRef = await addDoc(collection(db, 'hospitals'), {
        name: form.name,
        type: form.type,
        area: form.area,
        address: form.address,
        contactPhone: form.contactPhone,
        contactEmail: form.contactEmail || null,
        // SYNC FIX: Mobile uses 'inventory' key
        bloodStock: initialBloodStock,
        inventory: initialBloodStock, 
        hasEmergencyAvailability: false,
        hasKnownDonors: false,
        isVerified: true,
        isActive: true,
        // SYNC FIX: Add Mobile setup flag
        isFirstLogin: true, 
        needsProfileSetup: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user!.uid,
      });

      // Create Firebase Auth user for hospital
      const secondaryAuth = getAuth();
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, form.loginEmail, form.loginPassword);
      const hospitalUid = userCredential.user.uid;

      // Create user profile in /users/{uid}
      await setDoc(doc(db, 'users', hospitalUid), {
        uid: hospitalUid,
        email: form.loginEmail,
        fullName: form.name,
        name: form.name, // Mobile compatibility
        phoneNumber: form.contactPhone,
        role: 'hospital',
        hospitalId: hospitalRef.id,
        hospitalName: form.name,
        isActive: true,
        // SYNC FIX: Flags for both platforms
        isFirstLogin: true,
        needsProfileSetup: true,
        createdAt: serverTimestamp(),
        createdBy: user!.uid,
      });

      // Update hospital with linked account UID
      await updateDoc(hospitalRef, {
        linkedAccountId: hospitalUid,
        linkedAccountEmail: form.loginEmail,
      });

      await secondaryAuth.signOut();

      toast.success('Hospital created successfully!');
      setShowCreateDialog(false);
      setForm({
        name: '', type: 'hospital', area: 'Dhaka', address: '',
        contactPhone: '', contactEmail: '', loginEmail: '', loginPassword: '',
      });
    } catch (error: any) {
      console.error('Error creating hospital:', error);
      toast.error(error.message || 'Failed to create hospital');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateStock = async () => {
    if (!selectedHospital || !user || !profile) return;

    for (const group of BLOOD_GROUPS) {
      if (editBloodStock[group] < 0) {
        toast.error(`Bag count for ${group} cannot be negative`);
        return;
      }
    }

    setSavingStock(true);
    try {
      // SYNC FIX: Update document Map fields directly, stop using subcollections
      await updateDoc(doc(db, 'hospitals', selectedHospital.id), {
        bloodStock: editBloodStock, // For Web
        inventory: editBloodStock,  // For Mobile
        lastStockUpdate: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      await logMultipleBloodStockChanges(
        selectedHospital.id,
        selectedHospital.name,
        previousStockRef.current,
        editBloodStock,
        user.uid,
        profile.fullName || 'Admin',
        'admin'
      );
      
      toast.success('Blood stock updated successfully!');
      setShowStockDialog(false);
      setSelectedHospital(null);
    } catch (error) {
      console.error('Error updating stock:', error);
      toast.error('Failed to update blood stock');
    } finally {
      setSavingStock(false);
    }
  };

  const handleToggleStatus = async (hospital: Hospital) => {
    try {
      await updateDoc(doc(db, 'hospitals', hospital.id), {
        isActive: !hospital.isActive,
        updatedAt: serverTimestamp(),
      });
      toast.success(`Hospital ${hospital.isActive ? 'disabled' : 'enabled'}`);
    } catch (error) {
      console.error('Error toggling status:', error);
      toast.error('Failed to update status');
    }
  };

  const handleToggleVerified = async (hospital: Hospital) => {
    try {
      await updateDoc(doc(db, 'hospitals', hospital.id), {
        isVerified: !hospital.isVerified,
        updatedAt: serverTimestamp(),
      });
      toast.success(`Hospital ${hospital.isVerified ? 'unverified' : 'verified'}`);
    } catch (error) {
      console.error('Error toggling verification:', error);
      toast.error('Failed to update verification');
    }
  };

  const handleChangePassword = async () => {
    if (!selectedHospital || !newPassword) return;

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    try {
      const accountDoc = await getDoc(doc(db, 'hospitalAccounts', selectedHospital.linkedAccountEmail || ''));
      if (accountDoc.exists()) {
        await updateDoc(doc(db, 'hospitalAccounts', selectedHospital.linkedAccountEmail || ''), {
          password: newPassword,
        });
        toast.success('Password updated successfully');
        setShowPasswordDialog(false);
        setNewPassword('');
        setSelectedHospital(null);
      }
    } catch (error) {
      console.error('Error changing password:', error);
      toast.error('Failed to change password');
    }
  };

  const handleDeleteHospital = async (hospital: Hospital) => {
    if (!confirm(`Are you sure you want to delete ${hospital.name}? This cannot be undone.`)) {
      return;
    }

    try {
      if (hospital.linkedAccountEmail) {
        await deleteDoc(doc(db, 'hospitalAccounts', hospital.linkedAccountEmail));
      }
      await deleteDoc(doc(db, 'hospitals', hospital.id));
      toast.success('Hospital deleted');
    } catch (error) {
      console.error('Error deleting hospital:', error);
      toast.error('Failed to delete hospital');
    }
  };

  const handleViewDetails = async (hospital: Hospital) => {
    setSelectedHospital(hospital);
    setShowDetailsDialog(true);
    setLoadingDetails(true);
    setShowStoredPassword(false);
    
    try {
      if (hospital.linkedAccountEmail) {
        const accountDoc = await getDoc(doc(db, 'hospitalAccounts', hospital.linkedAccountEmail));
        if (accountDoc.exists()) {
          setSelectedAccountDetails(accountDoc.data());
        } else {
          setSelectedAccountDetails(null);
        }
      } else {
        setSelectedAccountDetails(null);
      }
    } catch (error) {
      console.error('Error fetching account details:', error);
      setSelectedAccountDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleOpenStockDialog = (hospital: Hospital) => {
    setSelectedHospital(hospital);
    // SYNC FIX: Read from inventory if bloodStock is missing
    const currentStock = (hospital as any).inventory || hospital.bloodStock || initialBloodStock;
    setEditBloodStock(currentStock);
    previousStockRef.current = { ...currentStock };
    setShowStockDialog(true);
  };

  const handleStockChange = (group: keyof BloodStock, value: string) => {
    const numValue = parseInt(value) || 0;
    setEditBloodStock((prev) => ({
      ...prev,
      [group]: Math.max(0, numValue),
    }));
  };

  if (profile?.role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b">
        <div className="container max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">Manage hospitals & blood banks</p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowHistoryDialog(true)}>
              <History className="w-4 h-4 mr-2" />
              History
            </Button>
            
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setShowLogoutConfirm(true)}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>

            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Hospital
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Hospital Account</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Hospital Name *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Enter hospital name"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Type *</Label>
                      <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as HospitalType })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {HOSPITAL_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Area *</Label>
                      <Select value={form.area} onValueChange={(v) => setForm({ ...form, area: v as Area })}>
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
                  <div className="space-y-2">
                    <Label>Address *</Label>
                    <Input
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      placeholder="Full address"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Contact Phone *</Label>
                      <Input
                        value={form.contactPhone}
                        onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                        placeholder="+880..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Contact Email</Label>
                      <Input
                        type="email"
                        value={form.contactEmail}
                        onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                        placeholder="contact@hospital.com"
                      />
                    </div>
                  </div>
                  <div className="border-t pt-4 mt-4">
                    <h4 className="font-medium mb-3">Login Credentials</h4>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Login Email *</Label>
                        <Input
                          type="email"
                          value={form.loginEmail}
                          onChange={(e) => setForm({ ...form, loginEmail: e.target.value })}
                          placeholder="hospital-login@example.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Password *</Label>
                        <div className="relative">
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            value={form.loginPassword}
                            onChange={(e) => setForm({ ...form, loginPassword: e.target.value })}
                            placeholder="Min 6 characters"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
                  <Button onClick={handleCreateHospital} disabled={creating}>
                    {creating ? 'Creating...' : 'Create Hospital'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="container max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Building2 className="w-8 h-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{hospitals.length}</p>
                <p className="text-sm text-muted-foreground">Total Hospitals</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <ShieldCheck className="w-8 h-8 text-success" />
              <div>
                <p className="text-2xl font-bold">{hospitals.filter(h => h.isVerified && h.isActive).length}</p>
                <p className="text-sm text-muted-foreground">Active & Verified</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Hospitals & Blood Banks</h2>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : hospitals.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No hospitals added yet. Click "Add Hospital" to create one.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {hospitals.map((hospital) => (
                <Card key={hospital.id} className={!hospital.isActive ? 'opacity-60' : ''}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold truncate">{hospital.name}</h3>
                          <Badge variant={hospital.type === 'blood_bank' ? 'destructive' : 'secondary'}>
                            {HOSPITAL_TYPES.find(t => t.value === hospital.type)?.label}
                          </Badge>
                          {hospital.isVerified && (
                            <Badge variant="outline" className="text-success border-success">
                              <ShieldCheck className="w-3 h-3 mr-1" />
                              Verified
                            </Badge>
                          )}
                          {!hospital.isActive && (
                            <Badge variant="outline" className="text-destructive">Disabled</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{hospital.address}, {hospital.area}</p>
                        <p className="text-sm text-muted-foreground">{hospital.contactPhone}</p>
                        {hospital.bloodStock && (
                          <div className="flex items-center gap-2 mt-2 text-xs">
                            <span className="text-muted-foreground">Stock:</span>
                            {BLOOD_GROUPS.map((group) => {
                              // SYNC FIX: Check both Mobile and Web count fields
                              const count = (hospital as any).inventory?.[group] ?? hospital.bloodStock[group] ?? 0;
                              return (
                                <span 
                                  key={group} 
                                  className={`px-1.5 py-0.5 rounded ${count > 0 ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}
                                >
                                  {group}: {count}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {hospital.lastStockUpdate && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Last stock update: {format(hospital.lastStockUpdate, 'PPp')}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleOpenStockDialog(hospital)}
                          title="Edit Blood Stock"
                        >
                          <Droplet className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleViewDetails(hospital)}
                          title="View Login Details"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            setSelectedHospital(hospital);
                            setShowPasswordDialog(true);
                          }}
                          title="Change Password"
                        >
                          <Key className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleToggleVerified(hospital)}
                          title={hospital.isVerified ? 'Remove Verification' : 'Verify'}
                        >
                          {hospital.isVerified ? <ShieldX className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleToggleStatus(hospital)}
                          title={hospital.isActive ? 'Disable' : 'Enable'}
                        >
                          {hospital.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => handleDeleteHospital(hospital)}
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      <Dialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Logout</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-muted-foreground">Are you sure you want to log out from the Admin Dashboard?</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogoutConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleLogout}>Logout</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Change password for <strong>{selectedHospital?.name}</strong>
            </p>
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>Cancel</Button>
            <Button onClick={handleChangePassword}>Update Password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Login Account Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Hospital Name</p>
              <p className="font-medium">{selectedHospital?.name}</p>
            </div>
            
            {loadingDetails ? (
              <div className="text-center py-4 text-muted-foreground">Loading...</div>
            ) : selectedAccountDetails ? (
              <>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Login Email</p>
                  <p className="font-medium font-mono bg-muted px-2 py-1 rounded">
                    {selectedAccountDetails.email}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Password</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium font-mono bg-muted px-2 py-1 rounded flex-1">
                      {showStoredPassword ? selectedAccountDetails.password : '••••••••'}
                    </p>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowStoredPassword(!showStoredPassword)}
                    >
                      {showStoredPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Account Status</p>
                  <Badge variant={selectedAccountDetails.isActive ? 'default' : 'destructive'}>
                    {selectedAccountDetails.isActive ? 'Active' : 'Disabled'}
                  </Badge>
                </div>
                {selectedAccountDetails.lastLogin && (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Last Login</p>
                    <p className="text-sm">{format(selectedAccountDetails.lastLogin.toDate(), 'PPp')}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                No login account found for this hospital.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showStockDialog} onOpenChange={setShowStockDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Droplet className="w-5 h-5 text-destructive" />
              Edit Blood Stock
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Update blood stock for <strong>{selectedHospital?.name}</strong>
            </p>
            <div className="grid grid-cols-4 gap-3">
              {BLOOD_GROUPS.map((group) => (
                <div key={group} className="space-y-1">
                  <Label className="text-center block text-sm font-medium">{group}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={editBloodStock[group]}
                    onChange={(e) => handleStockChange(group, e.target.value)}
                    className="text-center"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Bags:</span>
              <span className="font-bold text-lg">
                {Object.values(editBloodStock).reduce((sum, val) => sum + val, 0)}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStockDialog(false)}>Cancel</Button>
            <Button onClick={handleUpdateStock} disabled={savingStock}>
              {savingStock ? 'Saving...' : 'Update Stock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Blood Stock History (All Hospitals)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {historyLoading ? (
              <div className="text-center text-muted-foreground py-8">Loading history...</div>
            ) : allStockHistory.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">No history yet</div>
            ) : (
              allStockHistory.map((entry) => (
                <div key={entry.id} className="border rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={entry.action === 'added' ? 'default' : entry.action === 'removed' ? 'destructive' : 'secondary'}>
                        {entry.action.charAt(0).toUpperCase() + entry.action.slice(1)}
                      </Badge>
                      <span className="font-medium text-sm">{entry.hospitalName}</span>
                    </div>
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
    </div>
  );
};

export default AdminDashboard;
