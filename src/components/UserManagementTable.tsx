import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X, MessageSquare } from "lucide-react";

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
}

interface UserManagementTableProps {
  users: User[];
  onUpdate: () => void;
}

export function UserManagementTable({ users, onUpdate }: UserManagementTableProps) {
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

  const handleViewMessages = async (userId: string) => {
    // This will open a dialog to view messages
    toast.info("Message viewing feature coming soon");
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Rider Rating</TableHead>
            <TableHead>Driver Rating</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.email}</TableCell>
              <TableCell>{user.display_name}</TableCell>
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
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={user.is_verified ? "destructive" : "default"}
                    onClick={() => handleVerificationToggle(user.id, user.is_verified)}
                    disabled={loading === user.id}
                  >
                    {user.is_verified ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleViewMessages(user.id)}
                  >
                    <MessageSquare className="h-4 w-4" />
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
