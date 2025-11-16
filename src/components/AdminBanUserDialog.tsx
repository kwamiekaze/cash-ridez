import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface AdminBanUserDialogProps {
  userId: string;
  userName: string;
  chatRooms: Array<{ id: string; name: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminBanUserDialog({ 
  userId, 
  userName, 
  chatRooms, 
  open, 
  onOpenChange 
}: AdminBanUserDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string>("");
  const [action, setAction] = useState<"ban" | "mute" | "unban">("ban");

  const handleAction = async () => {
    if (!selectedRoom && action !== "mute") return;

    setLoading(true);
    try {
      if (action === "mute") {
        // Mute from all chat rooms (chat_muted flag)
        const { error } = await supabase
          .from("profiles")
          .update({ chat_muted: true })
          .eq("id", userId);

        if (error) throw error;

        toast({
          title: "User Muted",
          description: `${userName} has been muted from all chat rooms`,
        });
      } else if (action === "ban") {
        // Ban from specific room
        const { data: profile } = await supabase
          .from("profiles")
          .select("chat_rooms_banned_from")
          .eq("id", userId)
          .single();

        const bannedRooms = profile?.chat_rooms_banned_from || [];
        if (!bannedRooms.includes(selectedRoom)) {
          const { error } = await supabase
            .from("profiles")
            .update({ 
              chat_rooms_banned_from: [...bannedRooms, selectedRoom] 
            })
            .eq("id", userId);

          if (error) throw error;

          toast({
            title: "User Banned",
            description: `${userName} has been banned from the selected chat room`,
          });
        } else {
          toast({
            title: "Already Banned",
            description: `${userName} is already banned from this room`,
            variant: "destructive",
          });
        }
      } else if (action === "unban") {
        // Unban from specific room
        const { data: profile } = await supabase
          .from("profiles")
          .select("chat_rooms_banned_from")
          .eq("id", userId)
          .single();

        const bannedRooms = profile?.chat_rooms_banned_from || [];
        const { error } = await supabase
          .from("profiles")
          .update({ 
            chat_rooms_banned_from: bannedRooms.filter((r: string) => r !== selectedRoom),
            chat_muted: false // Also unmute when unbanning
          })
          .eq("id", userId);

        if (error) throw error;

        toast({
          title: "User Unbanned",
          description: `${userName} has been unbanned from the selected chat room`,
        });
      }

      onOpenChange(false);
    } catch (error: any) {
      console.error("Error performing action:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to perform action",
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
          <DialogTitle>Moderate User: {userName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Action</Label>
            <Select value={action} onValueChange={(v) => setAction(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ban">Ban from Room</SelectItem>
                <SelectItem value="unban">Unban from Room</SelectItem>
                <SelectItem value="mute">Mute from All Rooms</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {action !== "mute" && (
            <div>
              <Label>Chat Room</Label>
              <Select value={selectedRoom} onValueChange={setSelectedRoom}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a room" />
                </SelectTrigger>
                <SelectContent>
                  {chatRooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      {room.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAction} 
              disabled={loading || (action !== "mute" && !selectedRoom)}
              variant={action === "unban" ? "default" : "destructive"}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {action === "ban" ? "Ban User" : action === "unban" ? "Unban User" : "Mute User"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
