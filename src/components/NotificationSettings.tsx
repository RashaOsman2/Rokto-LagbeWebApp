import React, { useState } from 'react';
import { Bell, BellOff, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useFCM } from '@/hooks/useFCM';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export const NotificationSettings: React.FC = () => {
  const { user } = useAuth();
  const { token, isLoading, isSupported, initializeFCM } = useFCM(user?.uid || null);
  const [isEnabling, setIsEnabling] = useState(false);

  const handleEnableNotifications = async () => {
    setIsEnabling(true);
    try {
      const newToken = await initializeFCM();
      if (newToken) {
        toast.success('Push notifications enabled!', {
          description: "You'll receive alerts even when the app is closed.",
        });
      } else {
        toast.error('Could not enable notifications', {
          description: 'Please check your browser settings and try again.',
        });
      }
    } catch (error) {
      toast.error('Failed to enable notifications');
    } finally {
      setIsEnabling(false);
    }
  };

  if (!isSupported) {
    return (
      <Card className="border-muted">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BellOff className="w-4 h-4 text-muted-foreground" />
            Push Notifications
          </CardTitle>
          <CardDescription>
            Push notifications are not supported in this browser. 
            Try using Chrome, Firefox, or Edge for the best experience.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-muted">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          Push Notifications
        </CardTitle>
        <CardDescription>
          Receive alerts when donors accept requests, even when the app is closed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {token ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle className="w-4 h-4" />
              Push notifications enabled
            </div>
            <Switch checked={true} disabled />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="push-notifications" className="text-sm">
                Enable background alerts
              </Label>
              <Switch
                id="push-notifications"
                checked={false}
                onCheckedChange={handleEnableNotifications}
                disabled={isLoading || isEnabling}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleEnableNotifications}
              disabled={isLoading || isEnabling}
            >
              {isLoading || isEnabling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enabling...
                </>
              ) : (
                <>
                  <Bell className="w-4 h-4 mr-2" />
                  Enable Push Notifications
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              You'll be asked to allow notifications in your browser.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default NotificationSettings;
