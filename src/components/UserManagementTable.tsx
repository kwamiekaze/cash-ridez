import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X, Eye, ExternalLink, Pause, Play } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface User {
  id: string;
  email: string;
  display_name: string;
  is_verified: boolean;
  is_rider: boolean;
  is_driver: boolean;
  verification_status: string;
  rider_rating_avg: number;
  driver_rating_avg: number;
  photo_url: string;
  id_image_url: string;
  paused: boolean;
}

interface UserManagementTableProps {
  users: User[];
  onUpdate: () => void;
  onViewUser: (userId: string) => void;
}

export function UserManagementTable({ users, onUpdate, onViewUser }: UserManagementTableProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleVerificationToggle = async (userId: string, currentStatus: boolean) => {
    setLoading(userId);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_verified: !currentStatus,
          verification_status: !currentStatus ? "approved" : "pending",
        })
        .eq("id", userId);

      if (error) throw error;

      toast.success(`User ${!currentStatus ? "verified" : "unverified"} successfully`);
      onUpdate();
    } catch (error: any) {
      toast.error("Failed to update verification status");
      console.error(error);
    } finally {
      setLoading(null);
    }
  };

  const handlePauseToggle = async (userId: string, currentStatus: boolean) => {
    setLoading(userId);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          paused: !currentStatus,
        })
        .eq("id", userId);

      if (error) throw error;

      toast.success(`Account ${!currentStatus ? "paused" : "unpaused"} successfully`);
      onUpdate();
    } catch (error: any) {
      toast.error("Failed to update account status");
      console.error(error);
    } finally {
      setLoading(null);
    }
  };

  const handleViewIdImage = async (idImagePath: string) => {
    try {
      // idImagePath is now the file path directly (not a URL)
      const { data, error } = await supabase.storage
        .from('id-verifications')
        .createSignedUrl(idImagePath, 3600); // 1 hour expiry
      
      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (error) {
      console.error('Error opening ID image:', error);
      toast.error('Failed to open ID image');
    }
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Account Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Rating</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onViewUser(user.id)}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.photo_url} />
                    <AvatarFallback>{(user.display_name || user.email || "U")[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span>{user.display_name}</span>
                </div>
              </TableCell>
              <TableCell className="font-medium">{user.email}</TableCell>
              <TableCell>
                <Badge variant="outline">User</Badge>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  {user.is_verified ? (
                    <Badge className="bg-green-500">Verified</Badge>
                  ) : (
                    <Badge variant="destructive">Unverified</Badge>
                  )}
                  {user.paused && <Badge variant="secondary">Paused</Badge>}
                </div>
              </TableCell>
              <TableCell>
                {user.rider_rating_avg > 0 || user.driver_rating_avg > 0
                  ? `${Math.max(user.rider_rating_avg, user.driver_rating_avg).toFixed(1)}`
                  : "N/A"}
              </TableCell>
              <TableCell>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    variant={user.is_verified ? "destructive" : "default"}
                    onClick={() => handleVerificationToggle(user.id, user.is_verified)}
                    disabled={loading === user.id}
                    title={user.is_verified ? "Unverify" : "Verify"}
                  >
                    {user.is_verified ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="sm"
                    variant={user.paused ? "default" : "outline"}
                    onClick={() => handlePauseToggle(user.id, user.paused)}
                    disabled={loading === user.id}
                    title={user.paused ? "Unpause" : "Pause"}
                  >
                    {user.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </Button>
                  {user.id_image_url && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleViewIdImage(user.id_image_url)}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onViewUser(user.id)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
