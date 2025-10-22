import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, DollarSign, Navigation } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { RatingDisplay } from '@/components/RatingDisplay';
import StatusBadge from '@/components/StatusBadge';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in React-Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom marker icons
const createCustomIcon = (color: string) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background-color: ${color};
        width: 32px;
        height: 32px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      ">
        <div style="
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          transform: rotate(45deg);
          color: white;
          font-size: 16px;
        ">📍</div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

const availableIcon = createCustomIcon('#22c55e');
const assignedIcon = createCustomIcon('#eab308');
const completedIcon = createCustomIcon('#ef4444');

const MapController = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => {
    const [lat, lng] = center;
    const isValid = Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    if (isValid) {
      map.setView(center, 12);
    }
  }, [center, map]);
  return null;
};

interface TripMapViewProps {
  trips: any[];
  onTripSelect: (trip: any) => void;
  userLocation?: { lat: number; lng: number } | null;
}

export default function TripMapView({ trips, onTripSelect, userLocation }: TripMapViewProps) {
  const [mapCenter, setMapCenter] = useState<[number, number]>([37.7749, -122.4194]); // Default to SF

  useEffect(() => {
    if (userLocation) {
      setMapCenter([userLocation.lat, userLocation.lng]);
    } else if (trips.length > 0) {
      const firstTrip = trips[0];
      const lat = Number(firstTrip.pickup_lat);
      const lng = Number(firstTrip.pickup_lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        setMapCenter([lat, lng]);
      }
    }
  }, [userLocation, trips]);

  const getMarkerIcon = (status: string) => {
    switch (status) {
      case 'open':
        return availableIcon;
      case 'assigned':
        return assignedIcon;
      case 'completed':
        return completedIcon;
      default:
        return availableIcon;
    }
  };

  return (
    <div className="w-full h-[600px] rounded-lg overflow-hidden border-2 border-border">
      <MapContainer
        key={`${mapCenter[0]}-${mapCenter[1]}`}
        center={mapCenter}
        zoom={12}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        <MapController center={mapCenter} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* User location marker */}
        {userLocation && (
          <Marker
            position={[userLocation.lat, userLocation.lng]}
            icon={L.divIcon({
              className: 'user-location-marker',
              html: `
                <div style="
                  background-color: #3b82f6;
                  width: 20px;
                  height: 20px;
                  border-radius: 50%;
                  border: 4px solid white;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                "></div>
              `,
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            })}
          >
            <Popup>
              <div className="text-center font-semibold">
                <Navigation className="w-4 h-4 inline mr-1" />
                Your Location
              </div>
            </Popup>
          </Marker>
        )}

        {/* Trip markers */}
        {trips.filter(trip => {
          const lat = Number(trip.pickup_lat);
          const lng = Number(trip.pickup_lng);
          return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
        }).map((trip) => (
          <Marker
            key={trip.id}
            position={[Number(trip.pickup_lat), Number(trip.pickup_lng)]}
            icon={getMarkerIcon(trip.status)}
            eventHandlers={{
              click: () => onTripSelect(trip),
            }}
          >
            <Popup maxWidth={300}>
              <Card className="border-0 shadow-none p-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={trip.status} />
                  </div>
                  
                  {trip.rider && (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={trip.rider.photo_url || ""} />
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {(trip.rider.full_name || trip.rider.display_name || 'U')[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{trip.rider.full_name || trip.rider.display_name}</p>
                        <RatingDisplay 
                          rating={trip.rider.rider_rating_avg || 0} 
                          count={trip.rider.rider_rating_count || 0}
                          size="sm"
                        />
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-1">
                    <div className="flex items-start gap-1 text-xs">
                      <MapPin className="w-3 h-3 text-success mt-0.5 flex-shrink-0" />
                      <p className="text-muted-foreground">{trip.pickup_address}</p>
                    </div>
                    <div className="flex items-start gap-1 text-xs">
                      <MapPin className="w-3 h-3 text-destructive mt-0.5 flex-shrink-0" />
                      <p className="text-muted-foreground">{trip.dropoff_address}</p>
                    </div>
                  </div>
                  
                  {trip.price_offer && (
                    <div className="flex items-center gap-1 pt-2 border-t">
                      <DollarSign className="w-4 h-4 text-primary" />
                      <span className="text-lg font-bold text-primary">${trip.price_offer}</span>
                    </div>
                  )}
                  
                  {trip.distance && (
                    <p className="text-xs text-muted-foreground">
                      Distance from you: {trip.distance} mi
                    </p>
                  )}
                  
                  <Button 
                    size="sm" 
                    className="w-full mt-2"
                    onClick={() => onTripSelect(trip)}
                  >
                    View Details
                  </Button>
                </div>
              </Card>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
