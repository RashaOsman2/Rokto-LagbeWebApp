# Firestore Security Rules for BloodConnect

Copy and paste these rules into your Firebase Console:
**Firebase Console → Firestore Database → Rules**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Helper function to check if user owns the document
    function isOwner(userId) {
      return request.auth.uid == userId;
    }
    
    // Users collection - profile data
    match /users/{userId} {
      // Users can only read their own profile
      // Exception: Donors can be searched (limited fields)
      allow read: if isAuthenticated() && (
        isOwner(userId) || 
        // Allow reading donor profiles for search (only public donor info)
        resource.data.isDonor == true && resource.data.donorStatus == 'available'
      );
      
      // Users can only write to their own profile
      allow write: if isAuthenticated() && isOwner(userId);
    }
    
    // Blood requests collection
    match /requests/{requestId} {
      // Allow read if:
      // 1. User created the request (requester)
      // 2. User is the target donor (direct request)
      // 3. Request is emergency + user's blood group matches + user's area matches + user is available donor
      allow read: if isAuthenticated() && (
        resource.data.requesterId == request.auth.uid ||
        resource.data.targetDonorId == request.auth.uid ||
        resource.data.acceptedDonorId == request.auth.uid ||
        // Emergency requests visible to matching donors
        (resource.data.isEmergency == true && resource.data.status == 'pending')
      );
      
      // Allow create if authenticated
      allow create: if isAuthenticated() && 
        request.resource.data.requesterId == request.auth.uid;
      
      // Allow update if:
      // 1. Requester cancelling their own request
      // 2. Target donor accepting/declining
      // 3. Any matching donor accepting an emergency request
      allow update: if isAuthenticated() && (
        // Requester can update their own request
        resource.data.requesterId == request.auth.uid ||
        // Target donor can accept/decline
        resource.data.targetDonorId == request.auth.uid ||
        // Any donor can accept emergency requests
        (resource.data.isEmergency == true && resource.data.status == 'pending')
      );
      
      // Only requester can delete their request
      allow delete: if isAuthenticated() && 
        resource.data.requesterId == request.auth.uid;
    }
    
    // Notifications collection
    match /notifications/{notificationId} {
      // Users can only read their own notifications
      allow read: if isAuthenticated() && 
        resource.data.userId == request.auth.uid;
      
      // Anyone authenticated can create notifications (for other users)
      allow create: if isAuthenticated();
      
      // Users can update their own notifications (mark as read)
      allow update: if isAuthenticated() && 
        resource.data.userId == request.auth.uid;
      
      // Users can delete their own notifications
      allow delete: if isAuthenticated() && 
        resource.data.userId == request.auth.uid;
    }
  }
}
```

## Setup Instructions

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `bloodconnect-210f5`
3. Navigate to **Firestore Database** → **Rules**
4. Replace the default rules with the rules above
5. Click **Publish**

## Enable Authentication Providers

### Google Sign-In:
1. Go to **Authentication** → **Sign-in method**
2. Click **Google**
3. Toggle **Enable**
4. Set a **Project support email**
5. Click **Save**

### Phone Authentication:
1. Go to **Authentication** → **Sign-in method**
2. Click **Phone**
3. Toggle **Enable**
4. Click **Save**

### Add Authorized Domains:
1. Go to **Authentication** → **Settings** → **Authorized domains**
2. Add your Lovable preview domain (e.g., `*.lovableproject.com`)
3. Add your production domain when you deploy

## Important Notes

- Phone numbers will be formatted to Bangladesh format (+880)
- Donors in 'cooldown' or 'unavailable' status won't appear in search
- Request phone numbers are only visible after accepting a request
- 3-month cooldown is enforced after donation acceptance
