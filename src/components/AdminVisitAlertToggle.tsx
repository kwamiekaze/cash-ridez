import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, MessageSquare, CheckCircle2, Phone, PhoneMissed, Voicemail, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AdminNotificationSettings {
  notify_on_new_visit: boolean;
  sms_inbound_enabled: boolean;
  campaign_complete_enabled: boolean;
  notify_call_inbound: boolean;
  notify_call_missed: boolean;
  notify_call_voicemail: boolean;
  notify_call_campaign_complete: boolean;
}

export function AdminVisitAlertToggle() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [settings, setSettings] = useState<AdminNotificationSettings>({
    notify_on_new_visit: false,
    sms_inbound_enabled: true,
    campaign_complete_enabled: true,
    notify_call_inbound: false,
    notify_call_missed: false,
    notify_call_voicemail: false,
    notify_call_campaign_complete: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const checkAdminAndFetchSettings = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      // Check if user is admin
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!roleData) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setIsAdmin(true);

      // Fetch admin notification settings (or create default)
      const { data: existingSettings } = await supabase
        .from("admin_notification_settings")
        .select("*")
        .eq("admin_id", user.id)
        .maybeSingle();

      if (existingSettings) {
        setSettings({
          notify_on_new_visit: existingSettings.notify_on_new_visit ?? false,
          sms_inbound_enabled: existingSettings.sms_inbound_enabled ?? true,
          campaign_complete_enabled: existingSettings.campaign_complete_enabled ?? true,
          notify_call_inbound: (existingSettings as any).notify_call_inbound ?? false,
          notify_call_missed: (existingSettings as any).notify_call_missed ?? false,
          notify_call_voicemail: (existingSettings as any).notify_call_voicemail ?? false,
          notify_call_campaign_complete: (existingSettings as any).notify_call_campaign_complete ?? false,
        });
      } else {
        // Create default settings row
        await supabase
          .from("admin_notification_settings")
          .insert({
            admin_id: user.id,
            notify_on_new_visit: false,
            sms_inbound_enabled: true,
            campaign_complete_enabled: true,
          });
      }

      setLoading(false);
    };

    checkAdminAndFetchSettings();
  }, [user]);

  const handleToggle = async (field: keyof AdminNotificationSettings, checked: boolean) => {
    if (!user) return;

    setSaving(field);
    try {
      const updateData: any = { [field]: checked };
      
      const { error } = await supabase
        .from("admin_notification_settings")
        .upsert(
          {
            admin_id: user.id,
            ...updateData,
          },
          { onConflict: "admin_id" }
        );

      if (error) throw error;

      setSettings((prev) => ({ ...prev, [field]: checked }));
      
      const labels: Record<string, { on: string; off: string }> = {
        notify_on_new_visit: { on: "Visit alerts enabled", off: "Visit alerts disabled" },
        sms_inbound_enabled: { on: "SMS reply alerts enabled", off: "SMS reply alerts disabled" },
        campaign_complete_enabled: { on: "Campaign complete alerts enabled", off: "Campaign complete alerts disabled" },
        notify_call_inbound: { on: "Inbound call alerts enabled", off: "Inbound call alerts disabled" },
        notify_call_missed: { on: "Missed call alerts enabled", off: "Missed call alerts disabled" },
        notify_call_voicemail: { on: "Voicemail alerts enabled", off: "Voicemail alerts disabled" },
        notify_call_campaign_complete: { on: "Call campaign alerts enabled", off: "Call campaign alerts disabled" },
      };
      
      toast({
        title: checked ? labels[field].on : labels[field].off,
        description: checked 
          ? "You'll receive notifications for this event" 
          : "You won't receive these notifications",
      });
    } catch (error: any) {
      console.error("Error saving admin alert settings:", error);
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  // Don't render anything for non-admins
  if (loading || !isAdmin) {
    return null;
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Bell className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Admin Alerts</h2>
      </div>
      
      <div className="space-y-6">
        {/* Website Visit Alerts */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="visit-alerts" className="font-medium">
              Website Visits
            </Label>
            <p className="text-sm text-muted-foreground">
              Get an in-app alert when a new visit occurs.
            </p>
          </div>
          <Switch
            id="visit-alerts"
            checked={settings.notify_on_new_visit}
            onCheckedChange={(checked) => handleToggle("notify_on_new_visit", checked)}
            disabled={saving !== null}
          />
        </div>

        {/* SMS Reply Alerts */}
        <div className="flex items-center justify-between">
          <div className="space-y-1 flex items-center gap-2">
            <div>
              <Label htmlFor="sms-alerts" className="font-medium flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                SMS Replies
              </Label>
              <p className="text-sm text-muted-foreground">
                Get notified when someone replies to an SMS.
              </p>
            </div>
          </div>
          <Switch
            id="sms-alerts"
            checked={settings.sms_inbound_enabled}
            onCheckedChange={(checked) => handleToggle("sms_inbound_enabled", checked)}
            disabled={saving !== null}
          />
        </div>

        {/* Campaign Complete Alerts */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="campaign-alerts" className="font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              SMS Campaign Complete
            </Label>
            <p className="text-sm text-muted-foreground">
              Get notified when a bulk SMS campaign finishes.
            </p>
          </div>
          <Switch
            id="campaign-alerts"
            checked={settings.campaign_complete_enabled}
            onCheckedChange={(checked) => handleToggle("campaign_complete_enabled", checked)}
            disabled={saving !== null}
          />
        </div>

        {/* Separator */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Call Center Alerts
          </h3>
        </div>

        {/* Inbound Call Alerts */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="call-inbound-alerts" className="font-medium flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              Inbound Calls
            </Label>
            <p className="text-sm text-muted-foreground">
              Get notified when an inbound call comes in.
            </p>
          </div>
          <Switch
            id="call-inbound-alerts"
            checked={settings.notify_call_inbound}
            onCheckedChange={(checked) => handleToggle("notify_call_inbound", checked)}
            disabled={saving !== null}
          />
        </div>

        {/* Missed Call Alerts */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="call-missed-alerts" className="font-medium flex items-center gap-2">
              <PhoneMissed className="h-4 w-4 text-muted-foreground" />
              Missed Calls
            </Label>
            <p className="text-sm text-muted-foreground">
              Get notified when an inbound call is missed.
            </p>
          </div>
          <Switch
            id="call-missed-alerts"
            checked={settings.notify_call_missed}
            onCheckedChange={(checked) => handleToggle("notify_call_missed", checked)}
            disabled={saving !== null}
          />
        </div>

        {/* Voicemail Alerts */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="call-voicemail-alerts" className="font-medium flex items-center gap-2">
              <Voicemail className="h-4 w-4 text-muted-foreground" />
              Voicemails
            </Label>
            <p className="text-sm text-muted-foreground">
              Get notified when a voicemail is left.
            </p>
          </div>
          <Switch
            id="call-voicemail-alerts"
            checked={settings.notify_call_voicemail}
            onCheckedChange={(checked) => handleToggle("notify_call_voicemail", checked)}
            disabled={saving !== null}
          />
        </div>

        {/* Call Campaign Complete Alerts */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="call-campaign-alerts" className="font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Call Campaign Complete
            </Label>
            <p className="text-sm text-muted-foreground">
              Get notified when an auto-call campaign finishes.
            </p>
          </div>
          <Switch
            id="call-campaign-alerts"
            checked={settings.notify_call_campaign_complete}
            onCheckedChange={(checked) => handleToggle("notify_call_campaign_complete", checked)}
            disabled={saving !== null}
          />
        </div>
      </div>
    </Card>
  );
}
