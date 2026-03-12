export type NotificationType = 
  | 'request_accepted'
  | 'request_declined'
  | 'request_completed'
  | 'request_reminder'
  | 'request_expired'
  | 'booking_reminder'
  | 'new_request'
  | 'donor_arrived'
  | 'donor_arriving'
  | 'location_sharing'
  | 'location_request'
  | 'location_accepted'
  | 'location_denied'
  | 'emergency_request'
  | 'general';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  read: boolean;
  createdAt: Date;
}
