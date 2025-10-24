import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sortTripsByPriority, enrichTripsWithDrivers } from "@/utils/tripSorting";

export const useRiderTrips = (userId: string | undefined) => {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    if (!userId) return;

    const { data, error } = await supabase
      .from("ride_requests")
      .select("*")
      .eq("rider_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    
    if (error) {
      console.error("Error fetching requests:", error);
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      setRequests([]);
      setLoading(false);
      return;
    }

    // Fetch driver profiles for assigned trips
    const driverIds = data
      .map(r => r.assigned_driver_id)
      .filter((id): id is string => id !== null);

    if (driverIds.length > 0) {
      const { data: driverProfiles } = await supabase
        .from("profiles")
        .select("id, display_name, full_name, driver_rating_avg, driver_rating_count, photo_url, is_member")
        .in("id", driverIds);

      const enrichedData = enrichTripsWithDrivers(data, driverProfiles || []);
      setRequests(sortTripsByPriority(enrichedData));
    } else {
      setRequests(sortTripsByPriority(data));
    }

    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchRequests();

    // Debounced realtime subscription
    let refreshTimer: NodeJS.Timeout | null = null;
    const channel = supabase
      .channel(`rider_requests_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ride_requests",
          filter: `rider_id=eq.${userId}`
        },
        () => {
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => {
            fetchRequests();
            refreshTimer = null;
          }, 1000); // 1 second debounce
        }
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [userId, fetchRequests]);

  return { requests, loading, refetch: fetchRequests };
};
