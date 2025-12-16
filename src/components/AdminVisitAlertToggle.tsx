import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function AdminVisitAlertToggle() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [notifyOnVisit, setNotifyOnVisit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

      // Fetch admin notification settings
      const { data: settings } = await supabase
        .from("admin_notification_settings")
        .select("notify_on_new_visit")
        .eq("admin_id", user.id)
        .maybeSingle();

      if (settings) {
        setNotifyOnVisit(settings.notify_on_new_visit);
      }

      setLoading(false);
    };

    checkAdminAndFetchSettings();
  }, [user]);

  const handleToggle = async (checked: boolean) => {
    if (!user) return;

    setSaving(true);
    try {
      // Upsert the setting
      const { error } = await supabase
        .from("admin_notification_settings")
        .upsert(
          {
            admin_id: user.id,
            notify_on_new_visit: checked,
          },
          { onConflict: "admin_id" }
        );

      if (error) throw error;

      setNotifyOnVisit(checked);
      toast({
        title: checked ? "Alerts enabled" : "Alerts disabled",
        description: checked 
          ? "You'll receive notifications for new website visits" 
          : "You won't receive visit notifications",
      });
    } catch (error: any) {
      console.error("Error saving admin alert settings:", error);
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
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
      
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Label htmlFor="visit-alerts" className="font-medium">
            Notify me on new website visits
          </Label>
          <p className="text-sm text-muted-foreground">
            Get an in-app alert when a new visit occurs.
          </p>
        </div>
        <Switch
          id="visit-alerts"
          checked={notifyOnVisit}
          onCheckedChange={handleToggle}
          disabled={saving}
        />
      </div>
    </Card>
  );
}
