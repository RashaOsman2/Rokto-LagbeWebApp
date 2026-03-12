import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BloodGroupBadge } from '@/components/BloodGroupBadge';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Phone, MapPin, User, Calendar } from 'lucide-react';
import { UserProfile } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { ProfilePictureDialog } from '@/components/ProfilePictureDialog';

interface ProfileViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName?: string;
}

export const ProfileViewDialog = ({
  open,
  onOpenChange,
  userId,
  userName,
}: ProfileViewDialogProps) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [pictureDialogOpen, setPictureDialogOpen] = useState(false);

  useEffect(() => {
    if (open && userId) {
      fetchProfile();
    }
  }, [open, userId]);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const docRef = doc(db, 'users', userId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        setProfile({
          ...data,
          uid: docSnap.id,
          lastDonationDate: data.lastDonationDate?.toDate() || null,
          createdAt: data.createdAt?.toDate() || new Date(),
        } as UserProfile);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Profile</DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : profile ? (
            <div className="space-y-4">
              {/* Avatar and Name */}
              <div className="flex items-center gap-4">
                <Avatar 
                  className="w-16 h-16 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                  onClick={() => profile.photoURL && setPictureDialogOpen(true)}
                >
                  <AvatarImage src={profile.photoURL || undefined} alt={profile.fullName} />
                  <AvatarFallback className="bg-primary/10 text-primary text-lg">
                    {profile.fullName ? getInitials(profile.fullName) : <User className="w-6 h-6" />}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{profile.fullName}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <BloodGroupBadge bloodGroup={profile.bloodGroup} size="sm" />
                    {profile.isDonor && <StatusBadge status={profile.donorStatus} />}
                  </div>
                  {profile.photoURL && (
                    <p className="text-xs text-muted-foreground mt-1">Tap photo to enlarge</p>
                  )}
                </div>
              </div>

            {/* Info Grid */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span>{profile.area || 'Location not set'}</span>
              </div>
              
              {profile.phoneNumber && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span>{profile.phoneNumber}</span>
                </div>
              )}

              {profile.createdAt && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4 flex-shrink-0" />
                  <span>Joined {formatDistanceToNow(profile.createdAt, { addSuffix: true })}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            {profile.phoneNumber && (
              <div className="pt-2">
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <a href={`tel:${profile.phoneNumber}`}>
                    <Phone className="w-4 h-4 mr-2" />
                    Call {profile.fullName?.split(' ')[0]}
                  </a>
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <User className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>Could not load profile</p>
          </div>
        )}
      </DialogContent>
    </Dialog>

    <ProfilePictureDialog
      open={pictureDialogOpen}
      onOpenChange={setPictureDialogOpen}
      imageUrl={profile?.photoURL}
      name={profile?.fullName}
    />
  </>
  );
};
