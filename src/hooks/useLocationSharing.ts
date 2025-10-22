import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getCurrentLocation } from '@/utils/geolocation';

interface LocationUpdate {
  user_id: string;
  lat: number;
  lng: number;
  updated_at: string;
}

export function useLocationSharing(activeRideId: string | null) {
  const { user } = useAuth();
  const [participantLocation, setParticipantLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  // Share current user's location for active ride
  const shareLocation = useCallback(async () => {
    if (!user || !activeRideId) return;

    try {
      const location = await getCurrentLocation();
      
      const { error } = await supabase
        .from('ride_locations')
        .upsert({
          ride_request_id: activeRideId,
          user_id: user.id,
          lat: location.lat,
          lng: location.lng,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'ride_request_id,user_id'
        });

      if (error) throw error;
      setIsSharing(true);
    } catch (error) {
      console.error('Error sharing location:', error);
      setIsSharing(false);
    }
  }, [user, activeRideId]);

  // Subscribe to other participant's location updates
  useEffect(() => {
    if (!user || !activeRideId) return;

    // Fetch initial location
    const fetchParticipantLocation = async () => {
      const { data, error } = await supabase
        .from('ride_locations')
        .select('*')
        .eq('ride_request_id', activeRideId)
        .neq('user_id', user.id)
        .single();

      if (data && !error) {
        setParticipantLocation({ lat: Number(data.lat), lng: Number(data.lng) });
      }
    };

    fetchParticipantLocation();

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`ride-location-${activeRideId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ride_locations',
          filter: `ride_request_id=eq.${activeRideId}`,
        },
        (payload: any) => {
          const location = payload.new as LocationUpdate;
          if (location && location.user_id !== user.id) {
            setParticipantLocation({ lat: Number(location.lat), lng: Number(location.lng) });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, activeRideId]);

  // Auto-share location every 30 seconds when active ride exists
  useEffect(() => {
    if (!activeRideId || !isSharing) return;

    shareLocation();
    const interval = setInterval(shareLocation, 30000);

    return () => clearInterval(interval);
  }, [activeRideId, isSharing, shareLocation]);

  return {
    participantLocation,
    shareLocation,
    isSharing,
    setIsSharing,
  };
}
