import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MapPin, Loader2, User } from "lucide-react";
import { loadZipCentroids, ZipCentroids } from "@/lib/zipDistance";
import { MAP_CONFIG } from "@/lib/config";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Leaflet imports (lazy loaded)
let L: any = null;

export interface EnhancedTripMarker {
  id: string;
  zip: string;
  title: string;
  description: string;
  type: 'trip' | 'driver';
  // Driver-specific fields
  photoUrl?: string;
  fullName?: string;
  rating?: number;
  ratingCount?: number;
  cancelRate?: number;
  isVerified?: boolean;
  isMember?: boolean;
  status?: string;
  approxGeo?: { lat: number; lng: number } | null;
}

interface EnhancedTripMapProps {
  markers: EnhancedTripMarker[];
  centerZip?: string;
  className?: string;
}

// Stable jitter per ID + date (privacy-safe approximation)
const getJitteredCoords = (lat: number, lng: number, id: string) => {
  const today = new Date().toDateString();
  const seed = `${id}-${today}`;
  
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash;
  }
  
  const random1 = ((hash % 1000) / 1000) * 2 - 1;
  const random2 = (((hash >> 10) % 1000) / 1000) * 2 - 1;
  
  const jitterMiles = MAP_CONFIG.MAP_JITTER_MI;
  const latOffset = (random1 * jitterMiles) / 69;
  const lngOffset = (random2 * jitterMiles) / 54;
  
  return {
    lat: lat + latOffset,
    lng: lng + lngOffset
  };
};

export const EnhancedTripMap = ({ markers, centerZip, className }: EnhancedTripMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zipData, setZipData] = useState<ZipCentroids | null>(null);

  // Load Leaflet and initialize map
  useEffect(() => {
    const initMap = async () => {
      try {
        const centroids = await loadZipCentroids();
        setZipData(centroids);

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

        let centerLat = 33.7490;
        let centerLng = -84.3880;
        
        if (centerZip && centroids[centerZip]) {
          centerLat = centroids[centerZip].lat;
          centerLng = centroids[centerZip].lng;
        }

        const map = L.map(mapRef.current, {
          center: [centerLat, centerLng],
          zoom: 10,
          zoomControl: true,
          scrollWheelZoom: true,
        });

        // Use MapTiler if configured, otherwise OSM
        if (MAP_CONFIG.USE_PAID_MAP && MAP_CONFIG.MAPTILER_API_KEY) {
          L.tileLayer(`https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${MAP_CONFIG.MAPTILER_API_KEY}`, {
            attribution: '© MapTiler © OpenStreetMap contributors',
            maxZoom: 19,
          }).addTo(map);
        } else {
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19,
          }).addTo(map);
        }

        mapInstanceRef.current = map;
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
  }, [centerZip]);

  // Add markers when data changes
  useEffect(() => {
    if (!mapInstanceRef.current || !zipData || !L) return;

    // Clear existing markers
    mapInstanceRef.current.eachLayer((layer: any) => {
      if (layer instanceof L.Marker) {
        mapInstanceRef.current.removeLayer(layer);
      }
    });

    // Add new markers
    markers.forEach((marker) => {
      let coords;
      
      // Use approx_geo if available (for drivers), otherwise use ZIP centroid + jitter
      if (marker.type === 'driver' && marker.approxGeo) {
        coords = marker.approxGeo;
      } else {
        const centroid = zipData[marker.zip];
        if (!centroid) return;
        coords = getJitteredCoords(centroid.lat, centroid.lng, marker.id);
      }

      // Enhanced markers for drivers
      if (marker.type === 'driver') {
        const statusColors: Record<string, string> = {
          available: '#22c55e',
          on_trip: '#3b82f6',
          busy: '#eab308',
          unavailable: '#6b7280'
        };
        const statusColor = statusColors[marker.status || 'available'] || '#22c55e';
        
        const icon = L.divIcon({
          className: 'custom-driver-marker',
          html: `
            <div class="relative">
              <div class="w-12 h-12 rounded-full overflow-hidden border-4 shadow-lg" style="border-color: ${statusColor}">
                ${marker.photoUrl 
                  ? `<img src="${marker.photoUrl}" alt="${marker.fullName}" class="w-full h-full object-cover" />`
                  : `<div class="w-full h-full bg-primary flex items-center justify-center text-white font-bold text-lg">${marker.fullName?.charAt(0) || 'D'}</div>`
                }
              </div>
              <div class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full shadow-md" style="background-color: ${statusColor}"></div>
            </div>
          `,
          iconSize: [48, 48],
          iconAnchor: [24, 48],
        });

        const popupContent = `
          <div class="p-3 min-w-[200px]">
            <div class="flex items-center gap-2 mb-2">
              <h3 class="font-semibold text-base">${marker.fullName || 'Driver'}</h3>
              ${marker.isVerified ? '<span class="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">✓ Verified</span>' : ''}
              ${marker.isMember ? '<span class="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">⭐ Member</span>' : ''}
            </div>
            ${marker.rating && marker.rating > 0 
              ? `<p class="text-sm mb-1">⭐ ${marker.rating.toFixed(1)} (${marker.ratingCount || 0} ratings)</p>` 
              : '<p class="text-sm mb-1 text-gray-500">No ratings yet</p>'}
            ${marker.cancelRate !== undefined 
              ? `<p class="text-sm mb-1">Cancel Rate: <span class="${marker.cancelRate > 15 ? 'text-red-600' : marker.cancelRate >= 5 ? 'text-yellow-600' : 'text-green-600'}">${marker.cancelRate.toFixed(1)}%</span></p>` 
              : ''}
            <p class="text-xs text-gray-600 italic mt-2">📍 Approximate area near ${marker.zip}</p>
          </div>
        `;

        L.marker([coords.lat, coords.lng], { icon })
          .addTo(mapInstanceRef.current)
          .bindPopup(popupContent);
          
      } else {
        // Trip marker (existing style)
        const icon = L.divIcon({
          className: 'custom-map-marker',
          html: '<div class="w-8 h-8 bg-accent rounded-full flex items-center justify-center text-accent-foreground shadow-lg border-2 border-background"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>',
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });

        L.marker([coords.lat, coords.lng], { icon })
          .addTo(mapInstanceRef.current)
          .bindPopup(`
            <div class="p-2">
              <h3 class="font-semibold text-sm mb-1">${marker.title}</h3>
              <p class="text-xs text-muted-foreground mb-2">${marker.description}</p>
              <p class="text-xs italic text-muted-foreground">📍 Approximate area near ${marker.zip}</p>
            </div>
          `);
      }
    });
  }, [markers, zipData]);

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Live Map
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[400px] text-muted-foreground">
            {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Live Approximate Location Map
        </CardTitle>
        <CardDescription className="text-xs">
          Privacy-safe: Shows approximate areas only (~0.35 mi jitter). Exact addresses shared in trip details.
        </CardDescription>
      </CardHeader>
      <CardContent className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10 rounded-lg">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
        <div 
          ref={mapRef} 
          className="h-[500px] w-full rounded-lg border border-border"
          role="application"
          aria-label="Map showing approximate trip and driver locations"
        />
      </CardContent>
    </Card>
  );
};
