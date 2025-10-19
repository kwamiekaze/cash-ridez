import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin, Eye } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";

interface RideWithProfiles {
  id: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  pickup_time: string;
  price_offer: number;
  created_at: string;
  rider_profile: {
    display_name: string;
    full_name: string;
    photo_url: string;
  };
  driver_profile?: {
    display_name: string;
    full_name: string;
    photo_url: string;
  };
}

export function AdminRidesManagement() {
  const navigate = useNavigate();
  const [rides, setRides] = useState<RideWithProfiles[]>([]);
  const [filteredRides, setFilteredRides] = useState<RideWithProfiles[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRides();
  }, []);

  useEffect(() => {
    filterRides();
  }, [rides, searchQuery, statusFilter]);

  const fetchRides = async () => {
    try {
      const { data, error } = await supabase
        .from("ride_requests")
        .select(`
          id,
          status,
          pickup_address,
          dropoff_address,
          pickup_time,
          price_offer,
          created_at,
          rider_id,
          assigned_driver_id
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch profiles for riders and drivers
      const ridesWithProfiles = await Promise.all(
        (data || []).map(async (ride) => {
          const { data: riderProfile } = await supabase
            .from("profiles")
            .select("display_name, full_name, photo_url")
            .eq("id", ride.rider_id)
            .single();

          let driverProfile = null;
          if (ride.assigned_driver_id) {
            const { data: driver } = await supabase
              .from("profiles")
              .select("display_name, full_name, photo_url")
              .eq("id", ride.assigned_driver_id)
              .single();
            driverProfile = driver;
          }

          return {
            ...ride,
            rider_profile: riderProfile || { display_name: "Unknown", full_name: "", photo_url: "" },
            driver_profile: driverProfile,
          };
        })
      );

      setRides(ridesWithProfiles);
    } catch (error: any) {
      toast.error("Failed to fetch rides");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filterRides = () => {
    let filtered = [...rides];

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((ride) => ride.status === statusFilter);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (ride) =>
          ride.pickup_address.toLowerCase().includes(query) ||
          ride.dropoff_address.toLowerCase().includes(query) ||
          ride.rider_profile.display_name?.toLowerCase().includes(query) ||
          ride.rider_profile.full_name?.toLowerCase().includes(query) ||
          ride.driver_profile?.display_name?.toLowerCase().includes(query) ||
          ride.driver_profile?.full_name?.toLowerCase().includes(query)
      );
    }

    setFilteredRides(filtered);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      open: { variant: "default" as const, label: "Open" },
      assigned: { variant: "secondary" as const, label: "Assigned" },
      completed: { variant: "default" as const, label: "Completed" },
      cancelled: { variant: "destructive" as const, label: "Cancelled" },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || { variant: "default" as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by location, rider, or driver..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Showing {filteredRides.length} of {rides.length} rides
        </p>
      </Card>

      {loading ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Loading rides...</p>
        </Card>
      ) : filteredRides.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No rides found</p>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rider</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Pickup Time</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRides.map((ride) => (
                <TableRow key={ride.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={ride.rider_profile.photo_url} />
                        <AvatarFallback>
                          {(ride.rider_profile.full_name || ride.rider_profile.display_name || "U")[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">
                        {ride.rider_profile.full_name || ride.rider_profile.display_name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {ride.driver_profile ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={ride.driver_profile.photo_url} />
                          <AvatarFallback>
                            {(ride.driver_profile.full_name || ride.driver_profile.display_name || "D")[0]}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">
                          {ride.driver_profile.full_name || ride.driver_profile.display_name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-start gap-1 text-xs max-w-[200px]">
                      <MapPin className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                      <div className="truncate">{ride.pickup_address}</div>
                    </div>
                    <div className="flex items-start gap-1 text-xs max-w-[200px] mt-1">
                      <MapPin className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
                      <div className="truncate">{ride.dropoff_address}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(ride.pickup_time).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium">${ride.price_offer}</TableCell>
                  <TableCell>{getStatusBadge(ride.status)}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => navigate(`/trip/${ride.id}`)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
