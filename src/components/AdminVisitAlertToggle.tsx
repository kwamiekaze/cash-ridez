import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, MessageSquare, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AdminNotificationSettings {
  notify_on_new_visit: boolean;
  sms_inbound_enabled: boolean;
  campaign_complete_enabled: boolean;
}

export function AdminVisitAlertToggle() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [settings, setSettings] = useState<AdminNotificationSettings>({
    notify_on_new_visit: false,
    sms_inbound_enabled: true,
    campaign_complete_enabled: true,
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
        .select("notify_on_new_visit, sms_inbound_enabled, campaign_complete_enabled")
        .eq("admin_id", user.id)
        .maybeSingle();

      if (existingSettings) {
        setSettings({
          notify_on_new_visit: existingSettings.notify_on_new_visit ?? false,
          sms_inbound_enabled: existingSettings.sms_inbound_enabled ?? true,
          campaign_complete_enabled: existingSettings.campaign_complete_enabled ?? true,
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
              Campaign Complete
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
      </div>
    </Card>
  );
}
