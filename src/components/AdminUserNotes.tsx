import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileText, Phone, Loader2, Save } from "lucide-react";
import { format } from "date-fns";

interface AdminUserNotesProps {
  userId: string;
}

interface AdminNotes {
  notes: string | null;
  phone_override: string | null;
  updated_at: string | null;
  updated_by: string | null;
  updater_name?: string | null;
}

export function AdminUserNotes({ userId }: AdminUserNotesProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");
  const [phoneOverride, setPhoneOverride] = useState("");
  const [lastUpdated, setLastUpdated] = useState<AdminNotes | null>(null);

  useEffect(() => {
    fetchNotes();
  }, [userId]);

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_user_notes')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setNotes(data.notes || "");
        setPhoneOverride(data.phone_override || "");
        
        // Fetch updater name if available
        let updaterName = null;
        if (data.updated_by) {
          const { data: updaterProfile } = await supabase
            .from('profiles')
            .select('full_name, display_name')
            .eq('id', data.updated_by)
            .single();
          updaterName = updaterProfile?.full_name || updaterProfile?.display_name;
        }
        
        setLastUpdated({
          ...data,
          updater_name: updaterName,
        });
      }
    } catch (error) {
      console.error('Error fetching admin notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('admin_user_notes')
        .upsert({
          user_id: userId,
          notes: notes || null,
          phone_override: phoneOverride || null,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast.success("Admin notes saved");
      fetchNotes(); // Refresh to get updated timestamp
    } catch (error: any) {
      console.error('Error saving admin notes:', error);
      toast.error("Failed to save notes");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-4 border-orange-500/20 bg-orange-500/5">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-4 w-4 text-orange-500" />
          <Label className="text-sm font-medium">Admin Notes (Private)</Label>
        </div>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 border-orange-500/20 bg-orange-500/5">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="h-4 w-4 text-orange-500" />
        <Label className="text-sm font-medium">Admin Notes (Private)</Label>
      </div>
      
      <div className="space-y-4">
        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="admin-notes" className="text-xs text-muted-foreground">
            Private Notes
          </Label>
          <Textarea
            id="admin-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add private notes about this user..."
            rows={3}
            className="text-sm"
          />
        </div>

        {/* Phone Override */}
        <div className="space-y-2">
          <Label htmlFor="phone-override" className="text-xs text-muted-foreground flex items-center gap-1">
            <Phone className="h-3 w-3" />
            Phone Override (Calling Fallback)
          </Label>
          <Input
            id="phone-override"
            value={phoneOverride}
            onChange={(e) => setPhoneOverride(e.target.value)}
            placeholder="+1234567890"
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Used for in-app calling if user has no phone number set. Not visible to other users.
          </p>
        </div>

        {/* Last Updated Info */}
        {lastUpdated?.updated_at && (
          <p className="text-xs text-muted-foreground">
            Last updated: {format(new Date(lastUpdated.updated_at), 'MMM d, yyyy h:mm a')}
            {lastUpdated.updater_name && ` by ${lastUpdated.updater_name}`}
          </p>
        )}

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={saving}
          size="sm"
          className="w-full"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Notes
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}