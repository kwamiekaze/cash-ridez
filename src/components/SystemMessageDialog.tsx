import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Megaphone } from "lucide-react";

interface SystemMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function SystemMessageDialog({ open, onOpenChange, onSuccess }: SystemMessageDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetRoles, setTargetRoles] = useState({
    rider: true,
    driver: true,
    admin: true,
  });
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !message.trim()) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    const selectedRoles = Object.entries(targetRoles)
      .filter(([_, checked]) => checked)
      .map(([role, _]) => role);

    if (selectedRoles.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one target role",
        variant: "destructive",
      });
      return;
    }

    setSending(true);

    try {
      // Insert system message
      const { data: messageData, error: messageError } = await supabase
        .from("system_messages")
        .insert({
          title: title.trim(),
          message: message.trim(),
          target_roles: selectedRoles,
          is_published: true,
          published_at: new Date().toISOString(),
          created_by: (await supabase.auth.getUser()).data.user?.id || '',
        } as any)
        .select()
        .single();

      if (messageError) throw messageError;

      // Get all users matching target roles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, active_role")
        .in("active_role", selectedRoles);

      if (profilesError) throw profilesError;

      // Create notifications for all matching users
      const notifications = profiles?.map((profile) => ({
        user_id: profile.id,
        type: "system_message",
        title: `📢 ${title}`,
        message: message.length > 100 ? message.substring(0, 100) + "..." : message,
        link: "/updates",
        read: false,
      })) || [];

      if (notifications.length > 0) {
        const { error: notifError } = await supabase
          .from("notifications")
          .insert(notifications);

        if (notifError) throw notifError;
      }

      toast({
        title: "Success",
        description: `System message sent to ${notifications.length} user(s)`,
      });

      // Reset form
      setTitle("");
      setMessage("");
      setTargetRoles({ rider: true, driver: true, admin: true });
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error sending system message:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to send system message",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            Send System Message
          </DialogTitle>
          <DialogDescription>
            Create a system-wide announcement that will be posted to the Updates page and sent as notifications to selected user roles.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter announcement title..."
              maxLength={100}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter your message..."
              rows={6}
              maxLength={1000}
              required
            />
            <p className="text-xs text-muted-foreground text-right">
              {message.length}/1000 characters
            </p>
          </div>

          <div className="space-y-2">
            <Label>Target Roles</Label>
            <div className="flex flex-col gap-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="rider"
                  checked={targetRoles.rider}
                  onCheckedChange={(checked) =>
                    setTargetRoles((prev) => ({ ...prev, rider: checked as boolean }))
                  }
                />
                <label htmlFor="rider" className="text-sm cursor-pointer">
                  Riders
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="driver"
                  checked={targetRoles.driver}
                  onCheckedChange={(checked) =>
                    setTargetRoles((prev) => ({ ...prev, driver: checked as boolean }))
                  }
                />
                <label htmlFor="driver" className="text-sm cursor-pointer">
                  Drivers
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="admin"
                  checked={targetRoles.admin}
                  onCheckedChange={(checked) =>
                    setTargetRoles((prev) => ({ ...prev, admin: checked as boolean }))
                  }
                />
                <label htmlFor="admin" className="text-sm cursor-pointer">
                  Admins
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={sending}>
              {sending ? "Sending..." : "Send Message"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
