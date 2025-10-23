import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Loader2 } from "lucide-react";
import { loadZipCentroids, ZipCentroids } from "@/lib/zipDistance";

// Leaflet imports (lazy loaded)
let L: any = null;

interface TripMarker {
  id: string;
  zip: string;
  title: string;
  description: string;
  type: 'trip' | 'driver';
}

interface TripMapProps {
  markers: TripMarker[];
  centerZip?: string;
  className?: string;
}

// Stable jitter per ID + date (privacy-safe approximation)
const getJitteredCoords = (lat: number, lng: number, id: string, jitterMiles = 0.35) => {
  const today = new Date().toDateString();
  const seed = `${id}-${today}`;
  
  // Simple hash function for consistent randomness
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash;
  }
  
  // Convert to pseudo-random between -1 and 1
  const random1 = ((hash % 1000) / 1000) * 2 - 1;
  const random2 = (((hash >> 10) % 1000) / 1000) * 2 - 1;
  
  // ~69 miles per degree latitude, ~54 miles per degree longitude at 35° latitude
  const latOffset = (random1 * jitterMiles) / 69;
  const lngOffset = (random2 * jitterMiles) / 54;
  
  return {
    lat: lat + latOffset,
    lng: lng + lngOffset
  };
};

export const TripMap = ({ markers, centerZip, className }: TripMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zipData, setZipData] = useState<ZipCentroids | null>(null);

  // Load Leaflet and initialize map
  useEffect(() => {
    const initMap = async () => {
      try {
        // Load ZIP centroids first
        const centroids = await loadZipCentroids();
        setZipData(centroids);

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

        // Determine center coordinates
        let centerLat = 33.7490;
        let centerLng = -84.3880;
        
        if (centerZip && centroids[centerZip]) {
          centerLat = centroids[centerZip].lat;
          centerLng = centroids[centerZip].lng;
        }

        // Create map
        const map = L.map(mapRef.current, {
          center: [centerLat, centerLng],
          zoom: 10,
          zoomControl: true,
          scrollWheelZoom: true,
        });

        // Add OpenStreetMap tiles (free)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

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

    // Add new markers with jittered positions
    markers.forEach((marker) => {
      const centroid = zipData[marker.zip];
      if (!centroid) return;

      const jittered = getJitteredCoords(centroid.lat, centroid.lng, marker.id);

      // Custom icons
      const icon = L.divIcon({
        className: 'custom-map-marker',
        html: marker.type === 'driver' 
          ? '<div class="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground shadow-lg border-2 border-background"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg></div>'
          : '<div class="w-8 h-8 bg-accent rounded-full flex items-center justify-center text-accent-foreground shadow-lg border-2 border-background"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });

      const leafletMarker = L.marker([jittered.lat, jittered.lng], { icon })
        .addTo(mapInstanceRef.current)
        .bindPopup(`
          <div class="p-2">
            <h3 class="font-semibold text-sm mb-1">${marker.title}</h3>
            <p class="text-xs text-muted-foreground mb-2">${marker.description}</p>
            <p class="text-xs italic text-muted-foreground">📍 Approximate area near ${marker.zip}</p>
          </div>
        `);

      // Keyboard accessible
      leafletMarker.on('keypress', (e: any) => {
        if (e.originalEvent.key === 'Enter' || e.originalEvent.key === ' ') {
          leafletMarker.openPopup();
        }
      });
    });
  }, [markers, zipData]);

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Map View
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
          Approximate Location Map
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Privacy-safe: Shows approximate areas only. Exact addresses shared in messages.
        </p>
      </CardHeader>
      <CardContent className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
        <div 
          ref={mapRef} 
          className="h-[400px] w-full rounded-lg border border-border"
          role="application"
          aria-label="Map showing approximate trip and driver locations"
        />
      </CardContent>
    </Card>
  );
};
