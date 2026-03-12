import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BloodGroupBadge } from '@/components/BloodGroupBadge';
import { UserProfile } from '@/types';
import { MapPin, Navigation, Phone, Droplet, X, List } from 'lucide-react';

interface DonorMapProps {
  donors: Array<UserProfile & { location?: { lat: number; lng: number } }>;
  userLocation?: { lat: number; lng: number } | null;
  onRequestDonor: (donor: UserProfile) => void;
  className?: string;
}

// Calculate distance between two points using Haversine formula
const calculateDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const DonorMap: React.FC<DonorMapProps> = ({
  donors,
  userLocation,
  onRequestDonor,
  className = '',
}) => {
  const [selectedDonor, setSelectedDonor] = useState<(UserProfile & { location?: { lat: number; lng: number } }) | null>(null);
  
  // Filter donors with valid locations
  const donorsWithLocation = donors.filter(d => d.location?.lat && d.location?.lng);

  const getDistance = (donor: UserProfile & { location?: { lat: number; lng: number } }) => {
    if (!userLocation || !donor.location) return null;
    const dist = calculateDistance(
      userLocation.lat,
      userLocation.lng,
      donor.location.lat,
      donor.location.lng
    );
    return dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`;
  };

  const openInGoogleMaps = (donor: UserProfile & { location?: { lat: number; lng: number } }) => {
    if (donor.location) {
      // Open Google Maps with directions to donor's location
      window.open(
        `https://maps.google.com/maps?daddr=${donor.location.lat},${donor.location.lng}`,
        '_blank'
      );
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Donor list section */}
      <div className="rounded-lg border border-border bg-secondary/30 overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-background/80 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              <span className="font-medium">Nearby Donors</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {donorsWithLocation.length} with location
            </span>
          </div>
        </div>

        {/* Donor list */}
        <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
          {donorsWithLocation.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No donors with location sharing enabled</p>
              <p className="text-sm">Donors need to enable location sharing to appear here</p>
            </div>
          ) : (
            donorsWithLocation.map((donor) => (
              <Card 
                key={donor.uid} 
                className={`cursor-pointer transition-all hover:shadow-md ${
                  selectedDonor?.uid === donor.uid ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => setSelectedDonor(donor)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <BloodGroupBadge bloodGroup={donor.bloodGroup} size="sm" />
                      <div>
                        <p className="font-medium text-sm">{donor.fullName}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{donor.area}</span>
                          {getDistance(donor) && (
                            <>
                              <span>•</span>
                              <span className="text-primary font-medium">{getDistance(donor)} away</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        openInGoogleMaps(donor);
                      }}
                    >
                      <Navigation className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Selected donor popup */}
      {selectedDonor && (
        <div className="absolute inset-0 bg-background/95 backdrop-blur-sm rounded-lg p-4 flex flex-col z-10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Donor Details</h3>
            <Button variant="ghost" size="icon" onClick={() => setSelectedDonor(null)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-center space-y-4">
            <BloodGroupBadge bloodGroup={selectedDonor.bloodGroup} size="lg" />
            <div className="text-center">
              <h4 className="text-xl font-bold">{selectedDonor.fullName}</h4>
              <p className="text-muted-foreground">{selectedDonor.area}</p>
              {getDistance(selectedDonor) && (
                <p className="text-primary font-medium mt-1">{getDistance(selectedDonor)} away</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Button 
              className="w-full" 
              onClick={() => onRequestDonor(selectedDonor)}
            >
              <Droplet className="w-4 h-4 mr-2" />
              Request Blood
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" asChild>
                <a href={`tel:${selectedDonor.phoneNumber}`}>
                  <Phone className="w-4 h-4 mr-2" />
                  Call
                </a>
              </Button>
              <Button 
                variant="outline"
                onClick={() => openInGoogleMaps(selectedDonor)}
                disabled={!selectedDonor.location}
              >
                <Navigation className="w-4 h-4 mr-2" />
                Navigate
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};