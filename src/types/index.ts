export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'O+' | 'O-' | 'AB+' | 'AB-';

export type DonorStatus = 'available' | 'unavailable' | 'cooldown';

// User roles
export type UserRole = 'user' | 'donor' | 'hospital' | 'admin';

// Location share status
export type LocationShareStatus = 'pending' | 'accepted' | 'denied' | 'expired';

// Location share document - stored in locationShares collection
export interface LocationShare {
  id: string;
  requestId: string;
  donorId: string;
  requesterId: string;
  status: LocationShareStatus;
  donorLocation?: UserLocation | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date | null;
}

// Blood stock history entry
export type BloodStockAction = 'added' | 'removed' | 'updated';

export interface BloodStockHistoryEntry {
  id: string;
  hospitalId: string;
  hospitalName: string;
  bloodGroup: BloodGroup;
  previousQuantity: number;
  newQuantity: number;
  action: BloodStockAction;
  reason?: string;
  performedBy: string;
  performedByName: string;
  performedByRole: 'admin' | 'hospital';
  createdAt: Date;
}

// Hospital types
export type HospitalType = 'hospital' | 'blood_bank' | 'diagnostic_center';

export interface BloodStock {
  'A+': number;
  'A-': number;
  'B+': number;
  'B-': number;
  'O+': number;
  'O-': number;
  'AB+': number;
  'AB-': number;
}

export interface Hospital {
  id: string;
  name: string;
  type: HospitalType;
  area: Area;
  address: string;
  location?: {
    lat: number;
    lng: number;
  };
  contactPhone: string;
  contactEmail?: string;
  bloodStock: BloodStock;
  hasEmergencyAvailability: boolean;
  hasKnownDonors: boolean;
  isVerified: boolean;
  isActive: boolean;
  linkedAccountId?: string; // Firebase UID of hospital login account
  linkedAccountEmail?: string; // Email of hospital login account
  lastStockUpdate?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string; // Admin UID who created this
}

export interface HospitalAccount {
  uid: string;
  email: string;
  hospitalId: string; // Links to Hospital.id
  hospitalName: string;
  role: 'hospital';
  isActive: boolean;
  createdAt: Date;
  createdBy: string; // Admin UID
  lastLogin?: Date;
}

export type Area = 
  | 'Dhaka'
  | 'Chattogram'
  | 'Tangail'
  | 'Sylhet'
  | 'Rajshahi'
  | 'Khulna'
  | 'Barishal'
  | 'Rangpur'
  | 'Mymensingh'
  | 'Comilla'
  | 'Gazipur'
  | 'Narayanganj';

export interface UserLocation {
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface UserProfile {
  uid: string;
  fullName: string;
  phoneNumber: string;
  bloodGroup: BloodGroup;
  area: Area;
  isDonor: boolean;
  donorStatus: DonorStatus;
  lastDonationDate: Date | null;
  createdAt: Date;
  photoURL?: string;
  email?: string;
  location?: UserLocation;
  liveSharing?: boolean;
  /** Timestamp when live location should auto-expire (24 hours after enabling) */
  liveSharingExpiresAt?: Date | null;
  /** The request ID for which live location is being shared */
  liveSharingForRequestId?: string | null;
  role?: UserRole;
  isVerified?: boolean;
  isActive?: boolean;
  /** FCM tokens for push notifications (array to support multiple devices) */
  fcmTokens?: string[];
  /** Last time FCM token was updated */
  lastFCMUpdate?: Date;
  /** Whether user has accepted terms and conditions */
  acceptedTerms?: boolean;
  /** Version of terms accepted */
  acceptedTermsVersion?: string;
  /** Timestamp when terms were accepted */
  acceptedTermsAt?: Date;
  /** Hospital ID for hospital accounts */
  hospitalId?: string;
  /** Hospital name for hospital accounts */
  hospitalName?: string;
  /** Whether hospital user needs to complete profile setup */
  needsProfileSetup?: boolean;
  /** Address text (e.g., "near X hospital", "Block Y") */
  address?: string;
}

export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'completed' | 'cancelled' | 'expired';

export type RequestType = 'immediate' | 'booking';

export interface HospitalLocation {
  lat?: number;
  lng?: number;
  address: string;
}

export type LocationPermissionStatus = 'none' | 'pending' | 'accepted' | 'denied';

export interface BloodRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterPhone: string;
  patientName: string;
  contactPhone: string;
  bloodGroup: BloodGroup;
  bagsNeeded: number;
  hospitalName: string;
  hospitalLocation?: HospitalLocation;
  area: Area;
  notes?: string;
  isEmergency: boolean;
  isAmberAlert?: boolean;
  status: RequestStatus;
  targetDonorId?: string;
  acceptedDonorId?: string;
  acceptedDonorName?: string;
  acceptedDonorPhone?: string;
  /** Donor's live location (only shared after acceptance) */
  donorLiveLocation?: UserLocation | null;
  /** Location permission status: none, pending, accepted, denied */
  locationPermissionStatus?: LocationPermissionStatus;
  /** Timestamp when location permission was requested */
  locationPermissionRequestedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Request type: immediate or booking (scheduled) */
  requestType?: RequestType;
  /** Scheduled date/time for booking requests */
  scheduledAt?: Date | null;
  /** Last time a reminder was sent to donor */
  lastReminderSentAt?: Date | null;
}

// 24 hours in milliseconds for live location auto-expiry
export const LIVE_LOCATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

// Request auto-expire: 24 hours for immediate requests
export const REQUEST_EXPIRY_MS = 24 * 60 * 60 * 1000;

// Reminder cooldown: 1 hour between reminders
export const REMINDER_COOLDOWN_MS = 60 * 60 * 1000;

export const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

export const AREAS: Area[] = [
  'Dhaka',
  'Chattogram',
  'Tangail',
  'Sylhet',
  'Rajshahi',
  'Khulna',
  'Barishal',
  'Rangpur',
  'Mymensingh',
  'Comilla',
  'Gazipur',
  'Narayanganj'
];

// Cooldown period: 3 months in milliseconds
export const COOLDOWN_PERIOD_MS = 90 * 24 * 60 * 60 * 1000;

// Blood compatibility chart
export const BLOOD_COMPATIBILITY: Record<BloodGroup, BloodGroup[]> = {
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'A-': ['A-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'O+': ['O+', 'O-'],
  'O-': ['O-'],
  'AB+': ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'],
  'AB-': ['A-', 'B-', 'O-', 'AB-'],
};
