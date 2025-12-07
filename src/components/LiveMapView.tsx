import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2, Car, Navigation, RefreshCw, Users, Route } from "lucide-react";
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
  approx_geo: unknown; // JSON type from Supabase
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

// Helper to parse approx_geo JSON
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

interface LiveMapViewProps {
  className?: string;
}

// Jitter for privacy (consistent per ID + date)
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
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trips, setTrips] = useState<TripRequest[]>([]);
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showDrivers, setShowDrivers] = useState(true);
  const [showTrips, setShowTrips] = useState(true);

  // Check if we should prompt for location
  useEffect(() => {
    if (user) {
      const consent = localStorage.getItem("location_consent");
      if (!consent) {
        // Delay the prompt slightly
        const timer = setTimeout(() => setShowLocationDialog(true), 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [user]);

  // Fetch drivers and trips
  const fetchMapData = async () => {
    try {
      // Fetch available drivers (active in last 30 minutes)
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      
      const { data: driverData, error: driverError } = await supabase
        .from("driver_status")
        .select(`
          user_id,
          state,
          approx_geo,
          current_zip,
          updated_at
        `)
        .eq("state", "available")
        .gte("updated_at", thirtyMinsAgo);

      if (driverError) throw driverError;

      // Fetch driver profiles
      if (driverData && driverData.length > 0) {
        const driverIds = driverData.map(d => d.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, full_name, photo_url, subscription_active, car_make, car_model, car_year")
          .in("id", driverIds);

        const enrichedDrivers = driverData.map(driver => ({
          ...driver,
          profile: profiles?.find(p => p.id === driver.user_id),
        }));
        setDrivers(enrichedDrivers);
      } else {
        setDrivers([]);
      }

      // Fetch open trip requests
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

      // Fetch rider profiles
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
    } catch (err: any) {
      console.error("Error fetching map data:", err);
      setError("Failed to load map data");
    }
  };

  // Initialize map
  useEffect(() => {
    const initMap = async () => {
      try {
        // Dynamically import Leaflet
        if (!L) {
          const leaflet = await import('leaflet');
          L = leaflet.default;
          
          // Import Leaflet CSS
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);

          // Fix Leaflet default icon paths
          delete (L.Icon.Default.prototype as any)._getIconUrl;
          L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
          });
        }

        if (!mapRef.current || mapInstanceRef.current) return;

        // Center on Atlanta, Georgia
        const centerLat = 33.7490;
        const centerLng = -84.3880;

        // Create map with dark theme styling
        const map = L.map(mapRef.current, {
          center: [centerLat, centerLng],
          zoom: 10,
          zoomControl: true,
          scrollWheelZoom: true,
        });

        // Add dark-themed tiles
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '© OpenStreetMap contributors, © CARTO',
          maxZoom: 19,
        }).addTo(map);

        mapInstanceRef.current = map;
        
        // Fetch initial data
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

  // Update markers when data changes
  useEffect(() => {
    if (!mapInstanceRef.current || !L) return;

    // Clear existing markers
    mapInstanceRef.current.eachLayer((layer: any) => {
      if (layer instanceof L.Marker) {
        mapInstanceRef.current.removeLayer(layer);
      }
    });

    // Add driver markers
    if (showDrivers) {
      drivers.forEach((driver) => {
        const geo = parseApproxGeo(driver.approx_geo);
        if (!geo) return;

        const jittered = getJitteredCoords(geo.lat, geo.lng, driver.user_id);
        const name = driver.profile?.full_name || driver.profile?.display_name || "Driver";
        const isPremium = driver.profile?.subscription_active;
        const carInfo = [driver.profile?.car_year, driver.profile?.car_make, driver.profile?.car_model]
          .filter(Boolean).join(" ");

        const icon = L.divIcon({
          className: 'custom-map-marker',
          html: `<div class="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-primary-foreground shadow-lg border-2 border-background ${isPremium ? 'ring-2 ring-yellow-400' : ''}">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
              <circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>
            </svg>
          </div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 40],
        });

        L.marker([jittered.lat, jittered.lng], { icon })
          .addTo(mapInstanceRef.current)
          .bindPopup(`
            <div class="p-3 min-w-[200px]">
              <div class="flex items-center gap-2 mb-2">
                <span class="font-semibold">${name}</span>
                ${isPremium ? '<span class="text-yellow-500">👑</span>' : ''}
              </div>
              <p class="text-xs text-gray-600 mb-1"><strong>Role:</strong> Driver</p>
              ${carInfo ? `<p class="text-xs text-gray-600 mb-1"><strong>Vehicle:</strong> ${carInfo}</p>` : ''}
              <p class="text-xs text-gray-400 italic">📍 Approximate area</p>
            </div>
          `);
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

        const icon = L.divIcon({
          className: 'custom-map-marker',
          html: `<div class="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-lg border-2 border-background animate-pulse">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 40],
        });

        L.marker([jittered.lat, jittered.lng], { icon })
          .addTo(mapInstanceRef.current)
          .bindPopup(`
            <div class="p-3 min-w-[220px]">
              <div class="font-semibold mb-2">${riderName}'s Trip Request</div>
              <p class="text-xs mb-1"><strong>From:</strong> ${pickupCity}</p>
              <p class="text-xs mb-1"><strong>To:</strong> ${dropoffCity}</p>
              <p class="text-xs mb-1"><strong>When:</strong> ${pickupTime}</p>
              ${trip.price_offer ? `<p class="text-xs mb-1"><strong>Offer:</strong> $${trip.price_offer}</p>` : ''}
              ${savings && savings > 0 ? `<p class="text-xs text-emerald-600 mb-2">💰 Save $${savings} vs rideshare</p>` : ''}
              <a href="/trip/${trip.id}" class="text-xs text-blue-500 hover:underline">View Trip Details →</a>
            </div>
          `);
      });
    }
  }, [drivers, trips, showDrivers, showTrips]);

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

          await supabase
            .from("driver_status")
            .upsert({
              user_id: user.id,
              approx_geo: { lat: approxLat, lng: approxLng },
              updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });

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

  // Refresh map data
  const handleRefreshData = async () => {
    setRefreshing(true);
    await fetchMapData();
    setRefreshing(false);
    toast({
      title: "Map refreshed",
      description: `Showing ${drivers.length} drivers and ${trips.length} trip requests.`,
    });
  };

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-[500px] text-muted-foreground">
          {error}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={className}>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Live Community Map
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                See active drivers and trip requests near you
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
          
          {/* Legend and Filters */}
          <div className="flex flex-wrap items-center gap-4 mt-4 text-sm">
            <button
              onClick={() => setShowDrivers(!showDrivers)}
              className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-colors ${
                showDrivers ? 'border-primary bg-primary/10' : 'border-border opacity-50'
              }`}
            >
              <div className="w-3 h-3 rounded-full bg-primary" />
              <Car className="h-4 w-4" />
              <span>Drivers ({drivers.length})</span>
            </button>
            <button
              onClick={() => setShowTrips(!showTrips)}
              className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-colors ${
                showTrips ? 'border-emerald-500 bg-emerald-500/10' : 'border-border opacity-50'
              }`}
            >
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
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
            className="h-[500px] w-full rounded-lg border border-border"
            role="application"
            aria-label="Live community map showing drivers and trip requests"
          />
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
