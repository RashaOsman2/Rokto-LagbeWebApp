import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, onSnapshot } from 'firebase/firestore'; // Removed 'where'
import { db } from '@/lib/firebase';
import { Hospital, BloodGroup, Area, BLOOD_GROUPS, AREAS } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Building2, Droplet, MapPin, Phone, Clock, ShieldCheck, AlertCircle, Users, Search, Home } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const BloodGroupBadge: React.FC<{ group: BloodGroup; count: number }> = ({ group, count }) => (
  <div className={`flex flex-col items-center justify-center p-1.5 rounded-lg text-xs ${count > 0 ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
    <span className="font-bold">{group}</span>
    <span className="text-[10px]">{count}</span>
  </div>
);

const Hospitals: React.FC = () => {
  const navigate = useNavigate();
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterArea, setFilterArea] = useState<Area | 'all'>('all');
  const [filterBloodGroup, setFilterBloodGroup] = useState<BloodGroup | 'all'>('all');

  useEffect(() => {
    console.log("📡 Attempting to fetch from collection: 'hospitals'");
    
    // NUCLEAR QUERY: No filters at all. Fetch everything in the collection.
    const hospitalsQuery = query(collection(db, 'hospitals'));

    const unsubscribe = onSnapshot(
      hospitalsQuery,
      (snapshot) => {
        console.log(`✅ Received ${snapshot.size} documents from Firestore`);
        const hospitalList: Hospital[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          console.log("📄 Document Data:", doc.id, data); // LOG EACH DOC
          hospitalList.push({
            ...data,
            id: doc.id,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
            lastStockUpdate: data.lastStockUpdate?.toDate() || null,
          } as Hospital);
        });
        setHospitals(hospitalList);
        setLoading(false);
      },
      (error) => {
        console.error('❌ Firestore Error:', error.code, error.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const filteredHospitals = hospitals.filter((hospital) => {
    const matchesSearch = hospital.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      hospital.address?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesArea = filterArea === 'all' || hospital.area === filterArea;
    
    // Check both inventory (mobile) and bloodStock (web)
    const matchesBloodGroup = filterBloodGroup === 'all' || 
      ((hospital as any).inventory?.[filterBloodGroup] > 0 || hospital.bloodStock?.[filterBloodGroup] > 0);
      
    return matchesSearch && matchesArea && matchesBloodGroup;
  });

  const totalBloodBags = (hospital: Hospital) => {
    const stock = (hospital as any).inventory || hospital.bloodStock;
    if (!stock) return 0;
    return Object.values(stock).reduce((sum: any, val: any) => sum + (val || 0), 0);
  };

  // ... (Rest of UI is the same)
  return (
    <div className="min-h-screen bg-background pb-6">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b">
        <div className="container max-w-2xl mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}><ArrowLeft className="w-5 h-5" /></Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Hospitals & Blood Banks</h1>
            <p className="text-sm text-muted-foreground">DEBUG MODE: Showing All Data</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}><Home className="w-5 h-5" /></Button>
        </div>
      </header>
      <main className="container max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search hospitals..." className="pl-9" />
          </div>
          <div className="flex gap-2">
            <Select value={filterArea} onValueChange={(v) => setFilterArea(v as Area | 'all')}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="All Areas" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Areas</SelectItem>{AREAS.map((area) => (<SelectItem key={area} value={area}>{area}</SelectItem>))}</SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : filteredHospitals.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground"><p>No data found in 'hospitals' collection.</p></CardContent></Card>
        ) : (
          <div className="space-y-4">
            {filteredHospitals.map((hospital) => (
              <Card key={hospital.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{hospital.name || "Unnamed Hospital"}</h3>
                        {hospital.isVerified && <ShieldCheck className="w-4 h-4 text-success" />}
                      </div>
                      <Badge variant="secondary" className="text-xs mt-1">{hospital.type?.replace('_', ' ')}</Badge>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-primary">
                        <Droplet className="w-4 h-4" />
                        <span className="font-bold">{totalBloodBags(hospital)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-8 gap-1">
                    {BLOOD_GROUPS.map((group) => (
                      <BloodGroupBadge key={group} group={group} count={(hospital as any).inventory?.[group] ?? hospital.bloodStock?.[group] ?? 0} />
                    ))}
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <span className="text-muted-foreground">{hospital.address}, {hospital.area}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Hospitals;
