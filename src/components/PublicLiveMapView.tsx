import { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getMapPresenceRingStatus, getRingColor } from "@/lib/mapPresenceUtils";

// Leaflet imports (lazy loaded)
let L: any = null;

interface PublicMapUser {
  id: string;
  display_name: string | null;
  full_name: string | null;
  photo_url: string | null;
  current_lat: number | null;
  current_lng: number | null;
  location_updated_at?: string | null;
  subscription_active?: boolean | null;
  isAdmin?: boolean;
  isDriver?: boolean;
  isRider?: boolean;
}

// Helper to determine marker variant
const getMarkerVariant = (user: PublicMapUser): 'driver' | 'rider' | 'admin' => {
  if (user.isAdmin) return 'admin';
  if (user.isDriver) return 'driver';
  return 'rider';
};

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

// Create avatar-based divIcon with first-letter fallback and 7-day ring coloring
const createAvatarDivIcon = (
  L: any,
  avatarUrl: string | null | undefined,
  variant: 'driver' | 'rider' | 'admin',
  userName?: string | null,
  locationUpdatedAt?: string | null
): any => {
  const fallbackIcons: Record<string, string> = {
    driver: '/assets/map/driver-car-icon.png',
    rider: '/assets/map/rider-circle-icon.png',
    admin: '/assets/map/driver-car-icon.png',
  };

  const size = 48;
  const borderWidth = 2;
  
  // 7-day ring coloring: gold for active, grey for stale
  const ringStatus = getMapPresenceRingStatus(locationUpdatedAt);
  const borderColor = getRingColor(ringStatus);

  // If no avatar, show first-letter badge or fallback icon
  if (!avatarUrl) {
    const firstLetter = userName?.trim()?.charAt(0)?.toUpperCase() || '';
    
    if (firstLetter) {
      const html = `<div class="map-avatar-marker" style="position:relative;width:${size}px;height:${size}px;"><div style="width:${size}px;height:${size}px;border-radius:50%;border:${borderWidth}px solid ${borderColor};background:transparent;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);"><span style="font-size:22px;font-weight:bold;color:${borderColor};">${firstLetter}</span></div></div>`;
      
      return L.divIcon({
        html,
        className: 'map-avatar-icon',
        iconSize: [size, size],
        iconAnchor: [size / 2, size],
        popupAnchor: [0, -size],
      });
    }
    
    const html = `<div class="map-avatar-marker" style="position:relative;width:${size}px;height:${size}px;"><div style="width:${size}px;height:${size}px;border-radius:50%;border:${borderWidth}px solid ${borderColor};background:transparent;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);overflow:hidden;"><img src="${fallbackIcons[variant]}" style="width:${size - 8}px;height:${size - 8}px;object-fit:contain;" /></div></div>`;

    return L.divIcon({
      html,
      className: 'map-avatar-icon',
      iconSize: [size, size],
      iconAnchor: [size / 2, size],
      popupAnchor: [0, -size],
    });
  }

  const html = `<div class="map-avatar-marker" style="position:relative;width:${size}px;height:${size}px;"><img src="${avatarUrl}" style="width:${size}px;height:${size}px;border-radius:50%;border:${borderWidth}px solid ${borderColor};object-fit:cover;background-color:#374151;box-shadow:0 2px 8px rgba(0,0,0,0.4);" onerror="this.onerror=null;this.src='${fallbackIcons[variant]}';" /></div>`;

  return L.divIcon({
    html,
    className: 'map-avatar-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
};

interface PublicLiveMapViewProps {
  className?: string;
}

/**
 * PublicLiveMapView - Anonymous visitor view of the live map
 * Shows ALL users with location data permanently (unless they toggled invisible)
 * Ring color indicates recency: gold = active within 7 days, grey = older
 */
export function PublicLiveMapView({ className }: PublicLiveMapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Public view: show ALL users with location data
  const [allUsers, setAllUsers] = useState<PublicMapUser[]>([]);

  // Fetch public map data - get ALL users with location (no time filter)
  const fetchPublicMapData = useCallback(async () => {
    try {
      // Query the public view for ALL users with location data (no time filter)
      // The view already filters by is_map_visible and map_history_hidden_from_public
      const { data: allData, error: allError } = await supabase
        .from("public_map_presence" as any)
        .select("*")
        .not("current_lat", "is", null)
        .not("current_lng", "is", null);

      if (allError) {
        console.error("Error fetching users:", allError);
      }

      // Map view results to PublicMapUser
      const mapViewData = (row: any): PublicMapUser => ({
        id: row.user_id,
        display_name: row.display_name,
        full_name: row.full_name,
        photo_url: row.photo_url,
        current_lat: row.current_lat,
        current_lng: row.current_lng,
        location_updated_at: row.location_updated_at,
        subscription_active: row.subscription_active,
        isAdmin: row.is_admin === true,
        isDriver: row.is_driver === true,
        isRider: row.is_rider === true,
      });

      setAllUsers((allData || []).map(mapViewData));
    } catch (err) {
      console.error("Error fetching public map data:", err);
      setError("Failed to load map data");
    }
  }, []);

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

          const style = document.createElement('style');
          style.textContent = `
            .map-avatar-icon {
              background: transparent !important;
              border: none !important;
            }
            .map-avatar-marker img {
              transition: transform 0.2s ease;
            }
            .map-avatar-marker:hover img {
              transform: scale(1.1);
            }
          `;
          document.head.appendChild(style);

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

        const tileUrl = import.meta.env.VITE_MAP_TILE_URL || 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        
        L.tileLayer(tileUrl, {
          attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OSM</a> · <a href="https://carto.com/attributions" target="_blank">CARTO</a>',
          maxZoom: 19,
        }).addTo(map);

        mapInstanceRef.current = map;
        
        await fetchPublicMapData();
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

  // Fetch data on mount
  useEffect(() => {
    if (mapInstanceRef.current) {
      fetchPublicMapData();
    }
  }, [fetchPublicMapData]);

  // Update markers - show ALL users with ring coloring based on 7-day recency
  useEffect(() => {
    if (!mapInstanceRef.current || !L) return;

    // Clear existing markers
    mapInstanceRef.current.eachLayer((layer: any) => {
      if (layer instanceof L.Marker) {
        mapInstanceRef.current.removeLayer(layer);
      }
    });

    // Show ALL users - ring color indicates recency (gold = within 7 days, grey = older)
    allUsers.forEach((mapUser) => {
      if (!mapUser.current_lat || !mapUser.current_lng) return;

      const jittered = getJitteredCoords(mapUser.current_lat, mapUser.current_lng, mapUser.id);
      
      // Extract first name only for public visitors (privacy-focused)
      const fullName = mapUser.full_name || mapUser.display_name || "Member";
      const firstName = fullName.split(' ')[0];
      
      const variant = getMarkerVariant(mapUser);
      // Pass locationUpdatedAt for 7-day ring coloring
      const icon = createAvatarDivIcon(L, mapUser.photo_url, variant, fullName, mapUser.location_updated_at);

      // Public popup: first name only, no roles, no stats, no timestamps
      L.marker([jittered.lat, jittered.lng], { icon })
        .addTo(mapInstanceRef.current)
        .bindPopup(`
          <div class="p-3 min-w-[180px]">
            <div class="mb-2">
              <span class="font-semibold text-base">${firstName}</span>
            </div>
            <p class="text-xs text-gray-500 mb-1">Cash Ridez community member</p>
            <p class="text-xs text-gray-400 italic">📍 Approximate location</p>
          </div>
        `);
    });
  }, [allUsers]);

  // Center on Georgia
  const handleCenterOnGeorgia = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([33.7490, -84.3880], 10, { animate: true });
    }
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
    <Card className={className}>
      <CardContent className="p-0">
        {/* No filter buttons for public view - all users shown with ring coloring */}
        
        {/* Map wrapper */}
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          <div className="live-map-card mx-4 my-4">
            <div 
              ref={mapRef} 
              className="h-[400px] w-full"
              role="application"
              aria-label="Live community map showing active riders and drivers"
            />
            
            {/* Disclaimer overlay */}
            <div className="cr-map-disclaimer">
              Cash Ridez Connect map always uses approximate locations, not precise locations. Base map data © OpenStreetMap contributors.
            </div>
            
            {/* Center button */}
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-3 right-3 z-[9999] h-10 w-10 rounded-full shadow-lg"
              onClick={handleCenterOnGeorgia}
              title="Center on Georgia"
            >
              <Crosshair className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
