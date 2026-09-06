import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Star, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";
import { AddressLink } from "@/components/AddressLink";

interface UserRatingsDisplayProps {
  userId: string;
  ratingType: "rider" | "driver";
}

interface Rating {
  id: string;
  rating: number;
  created_at: string;
  rater_name: string;
  rater_photo: string;
  pickup_address: string;
  dropoff_address: string;
  pickup_lat?: number;
  pickup_lng?: number;
  dropoff_lat?: number;
  dropoff_lng?: number;
}

export function UserRatingsDisplay({ userId, ratingType }: UserRatingsDisplayProps) {
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRatings();
  }, [userId, ratingType]);

  const fetchRatings = async () => {
    try {
      setLoading(true);
      const ratingField = ratingType === "rider" ? "rider_rating" : "driver_rating";
      const userField = ratingType === "rider" ? "rider_id" : "assigned_driver_id";
      const raterField = ratingType === "rider" ? "assigned_driver_id" : "rider_id";

      const { data, error } = await supabase
        .from("ride_requests")
        .select(`
          id,
          ${ratingField},
          created_at,
          pickup_address,
          dropoff_address,
          pickup_lat,
          pickup_lng,
          dropoff_lat,
          dropoff_lng,
          ${raterField}
        `)
        .eq(userField, userId)
        .not(ratingField, "is", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // The dynamic column names above make the inferred row type a union, so
      // narrow to a permissive record shape at the query boundary.
      const rows: Array<Record<string, any>> = Array.isArray(data)
        ? (data as unknown as Array<Record<string, any>>)
        : [];

      // Fetch rater profiles
      const ratingsWithProfiles = await Promise.all(
        rows.map(async (row) => {
          const raterId = typeof row[raterField] === "string" ? (row[raterField] as string) : null;
          const ratingValue = Number(row[ratingField]);

          const { data: profileData } = raterId
            ? await supabase
                .from("profiles")
                .select("display_name, full_name, photo_url")
                .eq("id", raterId)
                .single()
            : { data: null };

          return {
            id: String(row.id),
            rating: Number.isFinite(ratingValue) ? ratingValue : 0,
            created_at: row.created_at as string,
            rater_name:
              profileData?.full_name || (raterId ? `User ${raterId.slice(0, 8)}` : "User"),
            rater_photo: profileData?.photo_url || "",
            pickup_address: row.pickup_address as string,
            dropoff_address: row.dropoff_address as string,
            pickup_lat: row.pickup_lat as number | undefined,
            pickup_lng: row.pickup_lng as number | undefined,
            dropoff_lat: row.dropoff_lat as number | undefined,
            dropoff_lng: row.dropoff_lng as number | undefined,
          } satisfies Rating;
        })
      );


      setRatings(ratingsWithProfiles);
    } catch (error) {
      console.error("Error fetching ratings:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground text-center">Loading ratings...</p>
      </Card>
    );
  }

  if (ratings.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground text-center">
          No {ratingType} ratings yet
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">
        {ratingType === "rider" ? "Rider" : "Driver"} Ratings ({ratings.length})
      </h3>
      <div className="space-y-3">
        {ratings.map((rating) => (
          <Card key={rating.id} className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row items-start gap-3">
              <Avatar className="h-10 w-10 flex-shrink-0">
                <AvatarImage src={rating.rater_photo} />
                <AvatarFallback>
                  <User className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 w-full">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                  <p className="text-sm font-medium truncate">{rating.rater_name}</p>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`h-4 w-4 ${
                          i < rating.rating
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-muted-foreground"
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  {format(new Date(rating.created_at), "MMM d, yyyy")}
                </p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="truncate">From: <AddressLink address={rating.pickup_address} lat={rating.pickup_lat} lng={rating.pickup_lng} className="text-muted-foreground text-xs" /></div>
                  <div className="truncate">To: <AddressLink address={rating.dropoff_address} lat={rating.dropoff_lat} lng={rating.dropoff_lng} isDestination className="text-muted-foreground text-xs" /></div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
