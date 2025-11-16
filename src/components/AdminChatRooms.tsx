import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";

interface ChatRoom {
  id: string;
  name: string;
  description: string | null;
  allowed_roles: string[];
  is_active: boolean;
  is_public: boolean;
  max_participants: number | null;
  created_at: string;
}

export function AdminChatRooms() {
  const { toast } = useToast();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    allowedRoles: { rider: true, driver: true, admin: true },
    isPublic: false,
    maxParticipants: null as number | null,
  });

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const { data, error } = await supabase
        .from("chat_rooms")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRooms(data || []);
    } catch (error: any) {
      console.error("Error fetching chat rooms:", error);
      toast({
        title: "Error",
        description: "Failed to fetch chat rooms",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    const selectedRoles = Object.entries(formData.allowedRoles)
      .filter(([_, checked]) => checked)
      .map(([role, _]) => role);

    if (selectedRoles.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one role",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase.from("chat_rooms").insert({
        name: formData.name,
        description: formData.description || null,
        allowed_roles: selectedRoles,
        is_public: formData.isPublic,
        max_participants: formData.maxParticipants,
        is_active: true,
      } as any);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Chat room created successfully",
      });

      setDialogOpen(false);
      setFormData({
        name: "",
        description: "",
        allowedRoles: { rider: true, driver: true, admin: true },
        isPublic: false,
        maxParticipants: null,
      });
      fetchRooms();
    } catch (error: any) {
      console.error("Error creating chat room:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create chat room",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (roomId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("chat_rooms")
        .update({ is_active: !currentStatus })
        .eq("id", roomId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Chat room ${!currentStatus ? "activated" : "deactivated"}`,
      });

      fetchRooms();
    } catch (error: any) {
      console.error("Error toggling chat room:", error);
      toast({
        title: "Error",
        description: "Failed to update chat room",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (roomId: string) => {
    if (!confirm("Are you sure you want to delete this chat room? This action cannot be undone.")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("chat_rooms")
        .delete()
        .eq("id", roomId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Chat room deleted successfully",
      });

      fetchRooms();
    } catch (error: any) {
      console.error("Error deleting chat room:", error);
      toast({
        title: "Error",
        description: "Failed to delete chat room",
        variant: "destructive",
      });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Chat Rooms</h2>
          <p className="text-sm text-muted-foreground">
            Create and manage chat rooms with custom permissions
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Room
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Loading chat rooms...
          </CardContent>
        </Card>
      ) : rooms.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No chat rooms yet. Create your first room!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {rooms.map((room) => (
            <Card key={room.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      {room.name}
                      {!room.is_active && (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                      {room.is_public && (
                        <Badge variant="outline">Public</Badge>
                      )}
                    </CardTitle>
                    {room.description && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {room.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-3">
                      <span className="text-xs text-muted-foreground">Allowed roles:</span>
                      {room.allowed_roles.map((role) => (
                        <Badge key={role} variant="secondary" className="capitalize">
                          {role}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={room.is_active ? "outline" : "default"}
                      onClick={() => handleToggleActive(room.id, room.is_active)}
                    >
                      {room.is_active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(room.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Chat Room</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Room Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter room name..."
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter room description..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Allowed Roles</Label>
              <div className="flex flex-col gap-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="role-rider"
                    checked={formData.allowedRoles.rider}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        allowedRoles: { ...formData.allowedRoles, rider: checked as boolean },
                      })
                    }
                  />
                  <label htmlFor="role-rider" className="text-sm cursor-pointer">
                    Riders
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="role-driver"
                    checked={formData.allowedRoles.driver}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        allowedRoles: { ...formData.allowedRoles, driver: checked as boolean },
                      })
                    }
                  />
                  <label htmlFor="role-driver" className="text-sm cursor-pointer">
                    Drivers
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="role-admin"
                    checked={formData.allowedRoles.admin}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        allowedRoles: { ...formData.allowedRoles, admin: checked as boolean },
                      })
                    }
                  />
                  <label htmlFor="role-admin" className="text-sm cursor-pointer">
                    Admins
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="public"
                checked={formData.isPublic}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isPublic: checked })
                }
              />
              <Label htmlFor="public" className="cursor-pointer">
                Public Room (anyone can join)
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxParticipants">Max Participants (Optional)</Label>
              <Input
                id="maxParticipants"
                type="number"
                value={formData.maxParticipants || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    maxParticipants: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
                placeholder="No limit"
                min={2}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Create Room</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
