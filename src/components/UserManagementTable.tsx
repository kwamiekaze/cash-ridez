import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X, Eye, ExternalLink } from "lucide-react";
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

  const handleViewIdImage = async (idImageUrl: string) => {
    try {
      // Extract the file path from the full URL
      const urlParts = idImageUrl.split('/object/public/id-verifications/');
      const filePath = urlParts[1] || idImageUrl.split('/id-verifications/')[1];
      
      if (filePath) {
        const { data, error } = await supabase.storage
          .from('id-verifications')
          .createSignedUrl(filePath, 60); // 60 seconds expiry
        
        if (error) throw error;
        if (data?.signedUrl) {
          window.open(data.signedUrl, '_blank');
        }
      } else {
        window.open(idImageUrl, '_blank');
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
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Rider Rating</TableHead>
            <TableHead>Driver Rating</TableHead>
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
                <div className="flex gap-1">
                  {user.is_rider && <Badge variant="secondary">Rider</Badge>}
                  {user.is_driver && <Badge variant="secondary">Driver</Badge>}
                </div>
              </TableCell>
              <TableCell>
                {user.is_verified ? (
                  <Badge className="bg-green-500">Verified</Badge>
                ) : (
                  <Badge variant="destructive">Unverified</Badge>
                )}
              </TableCell>
              <TableCell>
                {user.is_rider ? `${user.rider_rating_avg?.toFixed(1) || "N/A"}` : "-"}
              </TableCell>
              <TableCell>
                {user.is_driver ? `${user.driver_rating_avg?.toFixed(1) || "N/A"}` : "-"}
              </TableCell>
              <TableCell>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    variant={user.is_verified ? "destructive" : "default"}
                    onClick={() => handleVerificationToggle(user.id, user.is_verified)}
                    disabled={loading === user.id}
                  >
                    {user.is_verified ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
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
