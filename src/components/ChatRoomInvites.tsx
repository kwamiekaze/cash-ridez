import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Invite {
  id: string;
  room_id: string;
  invited_by: string;
  status: string;
  created_at: string;
  room: {
    name: string;
    description: string | null;
  };
  inviter: {
    display_name: string;
  };
}

export function ChatRoomInvites() {
  const { user } = useAuth();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchInvites();
    }
  }, [user]);

  const fetchInvites = async () => {
    if (!user) return;

    const { data: invitesData, error } = await supabase
      .from("chat_room_invites")
      .select("*")
      .eq("invited_user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching invites:", error);
      setLoading(false);
      return;
    }

    // Fetch related data
    if (invitesData && invitesData.length > 0) {
      const roomIds = invitesData.map(inv => inv.room_id);
      const inviterIds = invitesData.map(inv => inv.invited_by);

      const { data: rooms } = await supabase
        .from("chat_rooms")
        .select("id, name, description")
        .in("id", roomIds);

      const { data: inviters } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", inviterIds);

      const enrichedInvites = invitesData.map(invite => ({
        ...invite,
        room: rooms?.find(r => r.id === invite.room_id) || { name: "Unknown Room", description: null },
        inviter: inviters?.find(p => p.id === invite.invited_by) || { display_name: "Unknown" }
      }));

      setInvites(enrichedInvites as Invite[]);
    }

    setLoading(false);
  };

  const handleResponse = async (inviteId: string, response: "accepted" | "rejected") => {
    setResponding(inviteId);
    
    const { error } = await supabase
      .from("chat_room_invites")
      .update({
        status: response,
        responded_at: new Date().toISOString()
      })
      .eq("id", inviteId);

    if (error) {
      toast.error("Failed to respond to invite");
    } else {
      toast.success(`Invite ${response}`);
      fetchInvites();
    }
    
    setResponding(null);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Chat Room Invites</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chat Room Invites</CardTitle>
      </CardHeader>
      <CardContent>
        {invites.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            You have no pending invites
          </p>
        ) : (
          <div className="space-y-4">
            {invites.map((invite) => (
              <Card key={invite.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="font-semibold">{invite.room.name}</h4>
                      {invite.room.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {invite.room.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        Invited by {invite.inviter.display_name} • {format(new Date(invite.created_at), "PPp")}
                      </p>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleResponse(invite.id, "accepted")}
                        disabled={responding === invite.id}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResponse(invite.id, "rejected")}
                        disabled={responding === invite.id}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Decline
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
