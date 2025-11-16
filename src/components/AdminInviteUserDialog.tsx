import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface AdminInviteUserDialogProps {
  roomId: string;
  roomName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminInviteUserDialog({ roomId, roomName, open, onOpenChange }: AdminInviteUserDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [emailOrId, setEmailOrId] = useState("");

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailOrId.trim()) return;

    setLoading(true);
    try {
      // Check if it's a UUID or email
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(emailOrId);
      
      let userId: string | null = null;

      if (isUuid) {
        userId = emailOrId;
      } else {
        // Look up user by email
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", emailOrId.toLowerCase())
          .single();

        if (!profile) {
          toast({
            title: "User not found",
            description: "No user found with that email address",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        userId = profile.id;
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create invite
      const { error } = await supabase.from("chat_room_invites").insert({
        room_id: roomId,
        invited_user_id: userId,
        invited_by: user.id,
        status: "pending",
      });

      if (error) {
        if (error.code === '23505') { // Unique violation
          toast({
            title: "Already invited",
            description: "This user has already been invited to this room",
            variant: "destructive",
          });
        } else {
          throw error;
        }
      } else {
        toast({
          title: "Invite sent",
          description: `User has been invited to ${roomName}`,
        });
        setEmailOrId("");
        onOpenChange(false);
      }
    } catch (error: any) {
      console.error("Error inviting user:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to invite user",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite User to {roomName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <Label htmlFor="emailOrId">User Email or ID</Label>
            <Input
              id="emailOrId"
              type="text"
              placeholder="user@example.com or user-id"
              value={emailOrId}
              onChange={(e) => setEmailOrId(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !emailOrId.trim()}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Invite
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
