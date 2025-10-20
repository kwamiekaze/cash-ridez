import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Star, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";

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
          ${raterField}
        `)
        .eq(userField, userId)
        .not(ratingField, "is", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch rater profiles
      const ratingsWithProfiles = await Promise.all(
        (data || []).map(async (rating) => {
          const raterId = rating[raterField];
          const { data: profileData } = await supabase
            .from("profiles")
            .select("display_name, full_name, photo_url")
            .eq("id", raterId)
            .single();

          return {
            id: rating.id,
            rating: rating[ratingField],
            created_at: rating.created_at,
            rater_name: profileData?.full_name || profileData?.display_name || "Anonymous",
            rater_photo: profileData?.photo_url || "",
            pickup_address: rating.pickup_address,
            dropoff_address: rating.dropoff_address,
          };
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
          <Card key={rating.id} className="p-4">
            <div className="flex items-start gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={rating.rater_photo} />
                <AvatarFallback>
                  <User className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-sm font-medium">{rating.rater_name}</p>
                  <div className="flex items-center gap-1">
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
                <div className="text-xs text-muted-foreground">
                  <p className="truncate">From: {rating.pickup_address}</p>
                  <p className="truncate">To: {rating.dropoff_address}</p>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
