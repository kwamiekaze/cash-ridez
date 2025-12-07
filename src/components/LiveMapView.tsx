import { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2, Navigation, RefreshCw, Route, Crosshair } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { LocationConsentDialog } from "./LocationConsentDialog";
import { format } from "date-fns";

// Leaflet imports (lazy loaded)
let L: any = null;

interface Driver {
  user_id: string;
  state: string;
  approx_geo: unknown;
  current_zip: string | null;
  updated_at: string;
  profile?: {
    display_name: string | null;
    full_name: string | null;
    photo_url: string | null;
    subscription_active: boolean | null;
    car_make: string | null;
    car_model: string | null;
    car_year: string | null;
  };
}

const parseApproxGeo = (geo: unknown): { lat: number; lng: number } | null => {
  if (!geo || typeof geo !== 'object') return null;
  const g = geo as Record<string, unknown>;
  if (typeof g.lat === 'number' && typeof g.lng === 'number') {
    return { lat: g.lat, lng: g.lng };
  }
  return null;
};

interface TripRequest {
  id: string;
  pickup_lat: number;
  pickup_lng: number;
  pickup_zip: string;
  pickup_address: string;
  dropoff_address: string;
  dropoff_zip: string;
  pickup_time: string;
  price_offer: number | null;
  estimated_competitor_fare_mid: number | null;
  rider_id: string;
  rider?: {
    display_name: string | null;
    full_name: string | null;
    photo_url: string | null;
    rider_rating_avg: number | null;
  };
}

interface UserProfile {
  id: string;
  active_role: string | null;
  current_lat: number | null;
  current_lng: number | null;
}

interface LiveMapViewProps {
  className?: string;
}

// Jitter for privacy
const getJitteredCoords = (lat: number, lng: number, id: string, jitterMiles = 0.35) => {
  const today = new Date().toDateString();
  const seed = `${id}-${today}`;
  
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash;
  }
  
  const random1 = ((hash % 1000) / 1000) * 2 - 1;
  const random2 = (((hash >> 10) % 1000) / 1000) * 2 - 1;
  
  const latOffset = (random1 * jitterMiles) / 69;
  const lngOffset = (random2 * jitterMiles) / 54;
  
  return {
    lat: lat + latOffset,
    lng: lng + lngOffset
  };
};

export function LiveMapView({ className }: LiveMapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trips, setTrips] = useState<TripRequest[]>([]);
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showTrips, setShowTrips] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Check if user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
    };
    checkAdmin();
  }, [user]);

  // Fetch user profile
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("id, active_role, current_lat, current_lng")
        .eq("id", user.id)
        .single();
      if (data) {
        setUserProfile(data);
        if (data.current_lat && data.current_lng) {
          setUserLocation({ lat: data.current_lat, lng: data.current_lng });
        }
      }
    };
    fetchProfile();
  }, [user]);

  // Check if we should prompt for location
  useEffect(() => {
    if (user) {
      const consent = localStorage.getItem("location_consent");
      if (!consent) {
        const timer = setTimeout(() => setShowLocationDialog(true), 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [user]);

  const isDriver = userProfile?.active_role === 'driver';
  const isRider = userProfile?.active_role === 'rider';

  // Fetch map data based on role
  const fetchMapData = useCallback(async () => {
    try {
      // Drivers: can see trip requests (RLS handles visibility)
      // Riders: can see only their own trip request
      // Admins: can see everything
      
      if (isDriver || isAdmin) {
        // Fetch open trip requests for drivers
        const { data: tripData, error: tripError } = await supabase
          .from("ride_requests")
          .select(`
            id,
            pickup_lat,
            pickup_lng,
            pickup_zip,
            pickup_address,
            dropoff_address,
            dropoff_zip,
            pickup_time,
            price_offer,
            estimated_competitor_fare_mid,
            rider_id
          `)
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(50);

        if (tripError) throw tripError;

        if (tripData && tripData.length > 0) {
          const riderIds = tripData.map(t => t.rider_id);
          const { data: riderProfiles } = await supabase
            .from("profiles")
            .select("id, display_name, full_name, photo_url, rider_rating_avg")
            .in("id", riderIds);

          const enrichedTrips = tripData.map(trip => ({
            ...trip,
            rider: riderProfiles?.find(p => p.id === trip.rider_id),
          }));
          setTrips(enrichedTrips);
        } else {
          setTrips([]);
        }
      } else if (isRider && user) {
        // Riders see only their own trip
        const { data: tripData, error: tripError } = await supabase
          .from("ride_requests")
          .select(`
            id,
            pickup_lat,
            pickup_lng,
            pickup_zip,
            pickup_address,
            dropoff_address,
            dropoff_zip,
            pickup_time,
            price_offer,
            estimated_competitor_fare_mid,
            rider_id
          `)
          .eq("rider_id", user.id)
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(1);

        if (tripError) throw tripError;

        if (tripData && tripData.length > 0) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, display_name, full_name, photo_url, rider_rating_avg")
            .eq("id", user.id)
            .single();

          const enrichedTrips = tripData.map(trip => ({
            ...trip,
            rider: profile || undefined,
          }));
          setTrips(enrichedTrips);
        } else {
          setTrips([]);
        }
      }

      // Fetch own driver status if driver
      if (isDriver && user) {
        const { data: driverData } = await supabase
          .from("driver_status")
          .select(`user_id, state, approx_geo, current_zip, updated_at`)
          .eq("user_id", user.id)
          .single();

        if (driverData) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, display_name, full_name, photo_url, subscription_active, car_make, car_model, car_year")
            .eq("id", user.id)
            .single();

          setDrivers([{ ...driverData, profile: profile || undefined }]);
          
          const geo = parseApproxGeo(driverData.approx_geo);
          if (geo) {
            setUserLocation(geo);
          }
        } else {
          setDrivers([]);
        }
      } else {
        setDrivers([]);
      }
    } catch (err: any) {
      console.error("Error fetching map data:", err);
      setError("Failed to load map data");
    }
  }, [user, isDriver, isRider, isAdmin]);

  // Initialize map
  useEffect(() => {
    const initMap = async () => {
      try {
        if (!L) {
          const leaflet = await import('leaflet');
          L = leaflet.default;
          
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);

          delete (L.Icon.Default.prototype as any)._getIconUrl;
          L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
          });
        }

        if (!mapRef.current || mapInstanceRef.current) return;

        const centerLat = 33.7490;
        const centerLng = -84.3880;

        const map = L.map(mapRef.current, {
          center: [centerLat, centerLng],
          zoom: 10,
          zoomControl: true,
          scrollWheelZoom: true,
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OSM</a> · <a href="https://carto.com/attributions" target="_blank">CARTO</a>',
          maxZoom: 19,
        }).addTo(map);

        mapInstanceRef.current = map;
        
        await fetchMapData();
        setLoading(false);
      } catch (err) {
        console.error('Error initializing map:', err);
        setError('Failed to load map');
        setLoading(false);
      }
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Fetch data when role is determined
  useEffect(() => {
    if (userProfile && mapInstanceRef.current) {
      fetchMapData();
    }
  }, [userProfile, fetchMapData]);

  // Update markers
  useEffect(() => {
    if (!mapInstanceRef.current || !L) return;

    // Clear existing markers
    mapInstanceRef.current.eachLayer((layer: any) => {
      if (layer instanceof L.Marker) {
        mapInstanceRef.current.removeLayer(layer);
      }
    });

    userMarkerRef.current = null;

    // Custom icons
    const driverIcon = L.icon({
      iconUrl: '/assets/map/driver-car-icon.png',
      iconSize: [48, 48],
      iconAnchor: [24, 48],
      popupAnchor: [0, -48],
    });

    const tripIcon = L.icon({
      iconUrl: '/assets/map/rider-circle-icon.png',
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -40],
    });

    // Add driver markers (only for the current driver's own pin)
    if (isDriver) {
      drivers.forEach((driver) => {
        if (driver.user_id !== user?.id) return; // Only show own marker
        
        const geo = parseApproxGeo(driver.approx_geo);
        if (!geo) return;

        const jittered = getJitteredCoords(geo.lat, geo.lng, driver.user_id);
        const name = driver.profile?.full_name || driver.profile?.display_name || "You";
        const isPremium = driver.profile?.subscription_active;
        const carInfo = [driver.profile?.car_year, driver.profile?.car_make, driver.profile?.car_model]
          .filter(Boolean).join(" ");

        const marker = L.marker([jittered.lat, jittered.lng], { icon: driverIcon })
          .addTo(mapInstanceRef.current)
          .bindPopup(`
            <div class="p-3 min-w-[200px]">
              <div class="flex items-center gap-2 mb-2">
                <span class="font-semibold">${name}</span>
                ${isPremium ? '<span class="text-yellow-500">👑</span>' : ''}
              </div>
              <p class="text-xs text-gray-600 mb-1"><strong>Role:</strong> Driver (You)</p>
              ${carInfo ? `<p class="text-xs text-gray-600 mb-1"><strong>Vehicle:</strong> ${carInfo}</p>` : ''}
              <p class="text-xs text-gray-400 italic">📍 Your approximate location</p>
            </div>
          `);

        userMarkerRef.current = marker;
      });
    }

    // Add trip markers
    if (showTrips) {
      trips.forEach((trip) => {
        if (!trip.pickup_lat || !trip.pickup_lng) return;

        const jittered = getJitteredCoords(trip.pickup_lat, trip.pickup_lng, trip.id);
        const riderName = trip.rider?.full_name || trip.rider?.display_name || "Rider";
        const pickupCity = trip.pickup_address.split(',').slice(-3, -2)[0]?.trim() || trip.pickup_zip;
        const dropoffCity = trip.dropoff_address.split(',').slice(-3, -2)[0]?.trim() || trip.dropoff_zip;
        const pickupTime = format(new Date(trip.pickup_time), "MMM d, h:mm a");
        const savings = trip.estimated_competitor_fare_mid && trip.price_offer 
          ? Math.round(trip.estimated_competitor_fare_mid - trip.price_offer)
          : null;

        const isOwnTrip = trip.rider_id === user?.id;
        const tripLabel = isOwnTrip ? "Your Trip Request" : `${riderName}'s Trip Request`;

        const marker = L.marker([jittered.lat, jittered.lng], { icon: tripIcon })
          .addTo(mapInstanceRef.current)
          .bindPopup(`
            <div class="p-3 min-w-[220px]">
              <div class="font-semibold mb-2">${tripLabel}</div>
              <p class="text-xs mb-1"><strong>From:</strong> ${pickupCity}</p>
              <p class="text-xs mb-1"><strong>To:</strong> ${dropoffCity}</p>
              <p class="text-xs mb-1"><strong>When:</strong> ${pickupTime}</p>
              ${trip.price_offer ? `<p class="text-xs mb-1"><strong>Offer:</strong> $${trip.price_offer}</p>` : ''}
              ${savings && savings > 0 ? `<p class="text-xs text-emerald-600 mb-2">💰 Save $${savings} vs rideshare</p>` : ''}
              <a href="/trip/${trip.id}" class="text-xs text-blue-500 hover:underline">View Trip Details →</a>
            </div>
          `);

        if (isOwnTrip && isRider) {
          userMarkerRef.current = marker;
        }
      });
    }
  }, [drivers, trips, showTrips, user, isDriver, isRider]);

  // Refresh location
  const handleRefreshLocation = async () => {
    if (!user) return;
    setRefreshing(true);

    const consent = localStorage.getItem("location_consent");
    if (consent !== "granted") {
      setShowLocationDialog(true);
      setRefreshing(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const approxLat = Math.round(latitude * 100) / 100;
        const approxLng = Math.round(longitude * 100) / 100;

        try {
          await supabase
            .from("profiles")
            .update({
              current_lat: latitude,
              current_lng: longitude,
              location_updated_at: new Date().toISOString(),
            })
            .eq("id", user.id);

          if (isDriver) {
            await supabase
              .from("driver_status")
              .upsert({
                user_id: user.id,
                approx_geo: { lat: approxLat, lng: approxLng },
                updated_at: new Date().toISOString(),
              }, { onConflict: 'user_id' });
          }

          setUserLocation({ lat: approxLat, lng: approxLng });
          await fetchMapData();
          
          toast({
            title: "Location updated",
            description: "Your map pin has been refreshed.",
          });
        } catch (error) {
          console.error("Error updating location:", error);
          toast({
            title: "Error",
            description: "Failed to update location.",
            variant: "destructive",
          });
        } finally {
          setRefreshing(false);
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        toast({
          title: "Location unavailable",
          description: "Could not get your current location.",
          variant: "destructive",
        });
        setRefreshing(false);
      }
    );
  };

  // Center on user
  const handleCenterOnMe = () => {
    if (!mapInstanceRef.current) return;

    // For drivers, use their driver status location
    if (isDriver && drivers.length > 0) {
      const ownDriver = drivers.find(d => d.user_id === user?.id);
      if (ownDriver) {
        const geo = parseApproxGeo(ownDriver.approx_geo);
        if (geo) {
          const jittered = getJitteredCoords(geo.lat, geo.lng, ownDriver.user_id);
          mapInstanceRef.current.setView([jittered.lat, jittered.lng], 13, { animate: true });
          if (userMarkerRef.current) {
            userMarkerRef.current.openPopup();
          }
          return;
        }
      }
    }

    // For riders, center on their trip
    if (isRider && trips.length > 0) {
      const ownTrip = trips.find(t => t.rider_id === user?.id);
      if (ownTrip && ownTrip.pickup_lat && ownTrip.pickup_lng) {
        const jittered = getJitteredCoords(ownTrip.pickup_lat, ownTrip.pickup_lng, ownTrip.id);
        mapInstanceRef.current.setView([jittered.lat, jittered.lng], 13, { animate: true });
        if (userMarkerRef.current) {
          userMarkerRef.current.openPopup();
        }
        return;
      }
    }

    // Fallback to stored user location
    if (userLocation) {
      mapInstanceRef.current.setView([userLocation.lat, userLocation.lng], 13, { animate: true });
      return;
    }

    toast({
      title: "Location not found",
      description: "Update your pin to see yourself on the map.",
    });
  };

  // Refresh map data
  const handleRefreshData = async () => {
    setRefreshing(true);
    await fetchMapData();
    setRefreshing(false);
    toast({
      title: "Map refreshed",
      description: `Showing ${trips.length} trip request${trips.length !== 1 ? 's' : ''}.`,
    });
  };

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-[400px] text-muted-foreground">
          {error}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={className}>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapPin className="h-5 w-5 text-primary" />
                Live Community Map
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {isDriver ? "View trip requests near you" : "See your active trip on the map"}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshLocation}
                disabled={refreshing}
              >
                <Navigation className="h-4 w-4 mr-1" />
                Update My Pin
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefreshData}
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
          
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
            <button
              onClick={() => setShowTrips(!showTrips)}
              className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-colors ${
                showTrips ? 'border-primary bg-primary/10' : 'border-border opacity-50'
              }`}
            >
              <img src="/assets/map/rider-circle-icon.png" alt="Trip" className="w-5 h-5" />
              <Route className="h-4 w-4" />
              <span>Trip Requests ({trips.length})</span>
            </button>
          </div>
        </CardHeader>
        <CardContent className="relative pt-0">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          <div 
            ref={mapRef} 
            className="h-[420px] w-full rounded-lg border border-border"
            role="application"
            aria-label="Live community map showing trip requests"
          />
          
          {/* Show Me on Map button */}
          <Button
            variant="secondary"
            size="icon"
            className="absolute bottom-6 right-6 z-[1000] h-10 w-10 rounded-full shadow-lg"
            onClick={handleCenterOnMe}
            title="Show Me on the Map"
          >
            <Crosshair className="h-5 w-5" />
          </Button>
        </CardContent>
      </Card>

      <LocationConsentDialog
        open={showLocationDialog}
        onOpenChange={setShowLocationDialog}
        userId={user?.id || ""}
        onSuccess={() => {
          fetchMapData();
        }}
      />
    </>
  );
}
