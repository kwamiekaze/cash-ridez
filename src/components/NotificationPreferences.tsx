import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bell, MessageSquare, Car, DollarSign, Activity } from 'lucide-react';
import { toast } from 'sonner';

interface NotificationPrefs {
  all_notifications: boolean;
  new_trips: boolean;
  new_offers: boolean;
  messages: boolean;
  ride_updates: boolean;
  notify_new_driver: boolean;
}

export function NotificationPreferences() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    all_notifications: false,
    new_trips: false,
    new_offers: false,
    messages: true,
    ride_updates: true,
    notify_new_driver: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadPreferences();
    }
  }, [user]);

  const loadPreferences = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('notification_preferences, notify_new_driver')
        .eq('id', user?.id)
        .single();

      if (error) throw error;

      if (data) {
        // Safely parse the notification preferences with type checking
        const parsedPrefs = data.notification_preferences as Record<string, any>;
        setPrefs({
          all_notifications: parsedPrefs?.all_notifications ?? false,
          new_trips: parsedPrefs?.new_trips ?? false,
          new_offers: parsedPrefs?.new_offers ?? false,
          messages: parsedPrefs?.messages ?? true,
          ride_updates: parsedPrefs?.ride_updates ?? true,
          notify_new_driver: data.notify_new_driver ?? false, // Read from direct column
        });
      }
    } catch (error) {
      console.error('Error loading notification preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const updatePreference = async (key: keyof NotificationPrefs, value: boolean) => {
    try {
      const newPrefs = { ...prefs, [key]: value };
      
      // If enabling "all notifications", enable all individual preferences
      if (key === 'all_notifications' && value) {
        newPrefs.new_trips = true;
      newPrefs.new_offers = true;
      newPrefs.messages = true;
      newPrefs.ride_updates = true;
      newPrefs.notify_new_driver = true;
    }
      
      // If disabling any individual pref, disable "all notifications"
      if (key !== 'all_notifications' && !value) {
        newPrefs.all_notifications = false;
      }
      
    // If enabling all individual prefs, enable "all notifications"
    if (key !== 'all_notifications' && value) {
      const allEnabled = newPrefs.new_trips && newPrefs.new_offers && newPrefs.messages && newPrefs.ride_updates && newPrefs.notify_new_driver;
      if (allEnabled) {
        newPrefs.all_notifications = true;
      }
    }

      setPrefs(newPrefs);

      // Update both the JSONB column and direct notify_new_driver column
      const updates: any = {
        notification_preferences: newPrefs
      };
      
      // Also update the direct column for notify_new_driver for edge function access
      if (key === 'notify_new_driver' || key === 'all_notifications') {
        updates.notify_new_driver = newPrefs.notify_new_driver;
      }

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user?.id);

      if (error) throw error;

      toast.success('Notification preferences updated');
    } catch (error: any) {
      console.error('Error updating preferences:', error);
      toast.error('Failed to update preferences');
      // Revert on error
      loadPreferences();
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">Loading preferences...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Preferences
        </CardTitle>
        <CardDescription>
          Choose what notifications you want to receive to stay updated on activity
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable All Notifications */}
        <div className="flex items-center justify-between p-4 rounded-lg border border-primary/20 bg-primary/5">
          <div className="flex-1">
            <Label htmlFor="all_notifications" className="font-semibold text-base cursor-pointer">
              Enable All Notifications
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              Get notified about all new activity including new trips, offers, and updates
            </p>
          </div>
          <Switch
            id="all_notifications"
            checked={prefs.all_notifications}
            onCheckedChange={(checked) => updatePreference('all_notifications', checked)}
          />
        </div>

        <div className="space-y-4">
          {/* New Trips */}
          <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex items-start gap-3 flex-1">
              <Car className="h-5 w-5 mt-0.5 text-primary" />
              <div>
                <Label htmlFor="new_trips" className="font-medium cursor-pointer">
                  New Trip Requests
                </Label>
                <p className="text-sm text-muted-foreground">
                  Get alerts when new trips are posted in your area
                </p>
              </div>
            </div>
            <Switch
              id="new_trips"
              checked={prefs.new_trips}
              onCheckedChange={(checked) => updatePreference('new_trips', checked)}
            />
          </div>

          {/* New Offers */}
          <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex items-start gap-3 flex-1">
              <DollarSign className="h-5 w-5 mt-0.5 text-primary" />
              <div>
                <Label htmlFor="new_offers" className="font-medium cursor-pointer">
                  New Offers
                </Label>
                <p className="text-sm text-muted-foreground">
                  Notify when drivers make offers on your trips
                </p>
              </div>
            </div>
            <Switch
              id="new_offers"
              checked={prefs.new_offers}
              onCheckedChange={(checked) => updatePreference('new_offers', checked)}
            />
          </div>

          {/* Messages */}
          <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex items-start gap-3 flex-1">
              <MessageSquare className="h-5 w-5 mt-0.5 text-primary" />
              <div>
                <Label htmlFor="messages" className="font-medium cursor-pointer">
                  Messages
                </Label>
                <p className="text-sm text-muted-foreground">
                  Get notified of new chat messages
                </p>
              </div>
            </div>
            <Switch
              id="messages"
              checked={prefs.messages}
              onCheckedChange={(checked) => updatePreference('messages', checked)}
            />
          </div>

          {/* Ride Updates */}
          <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex items-start gap-3 flex-1">
              <Activity className="h-5 w-5 mt-0.5 text-primary" />
              <div>
                <Label htmlFor="ride_updates" className="font-medium cursor-pointer">
                  Ride Updates
                </Label>
                <p className="text-sm text-muted-foreground">
                  Trip status changes, completions, and cancellations
                </p>
              </div>
            </div>
            <Switch
              id="ride_updates"
              checked={prefs.ride_updates}
              onCheckedChange={(checked) => updatePreference('ride_updates', checked)}
            />
          </div>

          {/* New Driver Notifications */}
          <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex items-start gap-3 flex-1">
              <Car className="h-5 w-5 mt-0.5 text-primary" />
              <div>
                <Label htmlFor="notify_new_driver" className="font-medium cursor-pointer">
                  New Driver Alerts
                </Label>
                <p className="text-sm text-muted-foreground">
                  Get notified when a driver becomes available in your area
                </p>
              </div>
            </div>
            <Switch
              id="notify_new_driver"
              checked={prefs.notify_new_driver}
              onCheckedChange={(checked) => updatePreference('notify_new_driver', checked)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}