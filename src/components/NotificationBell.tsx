import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, MapPin, Navigation, Siren, AlertCircle, Clock, XCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { NotificationType } from '@/types/notifications';

export const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);

  const handleNotificationClick = async (notification: typeof notifications[0]) => {
    await markAsRead(notification.id);
    
    // Navigate based on notification type and data
    const { type, data } = notification;
    
    // Build URL with query params for highlighting
    let targetUrl = '/requests';
    const params = new URLSearchParams();
    
    if (data?.requestId) {
      params.set('highlight', data.requestId);
    }
    
    switch (type) {
      case 'new_request':
      case 'emergency_request':
        // For donors - incoming requests tab
        params.set('tab', 'incoming');
        break;
      case 'request_accepted':
      case 'request_declined':
      case 'request_completed':
      case 'location_sharing':
      case 'donor_arrived':
      case 'donor_arriving':
        // For requesters - outgoing/my requests tab  
        params.set('tab', 'outgoing');
        break;
      case 'location_request':
        // For donors when requester asks for location
        params.set('tab', 'outgoing');
        params.set('action', 'share_location');
        break;
      case 'booking_reminder':
        params.set('tab', 'scheduled');
        break;
      case 'request_reminder':
        params.set('tab', 'incoming');
        break;
      default:
        if (data?.url) {
          targetUrl = data.url;
        }
        break;
    }
    
    const queryString = params.toString();
    navigate(queryString ? `${targetUrl}?${queryString}` : targetUrl);
    setOpen(false);
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'request_accepted':
        return <CheckCircle className="w-4 h-4 text-success" />;
      case 'request_declined':
        return <XCircle className="w-4 h-4 text-destructive" />;
      case 'request_completed':
        return <CheckCircle className="w-4 h-4 text-success" />;
      case 'new_request':
        return <Bell className="w-4 h-4 text-primary" />;
      case 'emergency_request':
        return <Siren className="w-4 h-4 text-destructive" />;
      case 'donor_arrived':
      case 'donor_arriving':
        return <MapPin className="w-4 h-4 text-success" />;
      case 'location_sharing':
        return <Navigation className="w-4 h-4 text-primary" />;
      case 'location_request':
        return <MapPin className="w-4 h-4 text-warning" />;
      case 'request_reminder':
      case 'booking_reminder':
        return <Clock className="w-4 h-4 text-warning" />;
      case 'request_expired':
        return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
      default:
        return <Bell className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getNotificationEmoji = (type: NotificationType) => {
    switch (type) {
      case 'request_accepted':
        return '✅';
      case 'request_declined':
        return '❌';
      case 'request_completed':
        return '🎉';
      case 'new_request':
        return '🩸';
      case 'emergency_request':
        return '🚨';
      case 'donor_arrived':
      case 'donor_arriving':
        return '📍';
      case 'location_sharing':
        return '🗺️';
      case 'location_request':
        return '📡';
      case 'request_reminder':
      case 'booking_reminder':
        return '⏰';
      case 'request_expired':
        return '⌛';
      default:
        return '🔔';
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <h4 className="font-semibold">Notifications</h4>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 text-xs"
              onClick={markAllAsRead}
            >
              <CheckCheck className="w-3 h-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        
        <ScrollArea className="h-[300px]">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.slice(0, 20).map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "p-3 cursor-pointer hover:bg-secondary/50 transition-colors",
                    !notification.read && "bg-primary/5"
                  )}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn(
                          "text-sm",
                          !notification.read && "font-medium"
                        )}>
                          {notification.title}
                        </p>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1.5" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {notification.body}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        {formatDistanceToNow(notification.createdAt, { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        
        {notifications.length > 0 && (
          <div className="p-2 border-t">
            <Button 
              variant="ghost" 
              className="w-full h-8 text-xs"
              onClick={() => {
                navigate('/requests');
                setOpen(false);
              }}
            >
              View all requests
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
