import { useEffect, useMemo, useState } from "react";
import { GoogleMap, Marker, InfoWindow, useJsApiLoader } from "@react-google-maps/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, DollarSign, Navigation } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RatingDisplay } from "@/components/RatingDisplay";
import StatusBadge from "@/components/StatusBadge";

interface TripMapViewProps {
  trips: any[];
  onTripSelect: (trip: any) => void;
  userLocation?: { lat: number; lng: number } | null;
  onRequestLocation?: () => void;
}

const isValidLatLng = (lat: any, lng: any) => {
  const la = Number(lat);
  const ln = Number(lng);
  return Number.isFinite(la) && Number.isFinite(ln) && la >= -90 && la <= 90 && ln >= -180 && ln <= 180;
};

const containerClass = "relative w-full h-[600px] rounded-lg overflow-hidden border-2 border-border";

export default function GoogleTripMapView({ trips, onTripSelect, userLocation, onRequestLocation }: TripMapViewProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const [center, setCenter] = useState<{ lat: number; lng: number }>({ lat: 37.7749, lng: -122.4194 });
  const [activeTripId, setActiveTripId] = useState<string | number | null>(null);

  const { isLoaded, loadError } = useJsApiLoader({ id: "google-map-script", googleMapsApiKey: apiKey || "" });

  const firstValidTripLatLng = useMemo(() => {
    const valid = trips.find(t => isValidLatLng(t.pickup_lat, t.pickup_lng));
    if (!valid) return null;
    return { lat: Number(valid.pickup_lat), lng: Number(valid.pickup_lng) };
  }, [trips]);

  useEffect(() => {
    if (userLocation && isValidLatLng(userLocation.lat, userLocation.lng)) {
      setCenter({ lat: Number(userLocation.lat), lng: Number(userLocation.lng) });
    } else if (firstValidTripLatLng) {
      setCenter(firstValidTripLatLng);
    }
  }, [userLocation, firstValidTripLatLng]);

  if (!apiKey) {
    return (
      <Card className="p-6 text-center">
        <p className="mb-2 font-medium">Google Maps API key required</p>
        <p className="text-sm text-muted-foreground mb-4">Add VITE_GOOGLE_MAPS_API_KEY to enable the map.</p>
        <p className="text-xs text-muted-foreground">Contact support to set a restricted browser key.</p>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card className="p-6 text-center">
        <p className="mb-2 font-medium">Map failed to load</p>
        <p className="text-sm text-muted-foreground">Please refresh the page and try again.</p>
      </Card>
    );
  }

  if (!isLoaded) {
    return <div className={containerClass} />;
  }

  return (
    <div className={containerClass}>
      {/* Enable location control */}
      {!userLocation && onRequestLocation && (
        <div className="absolute z-10 top-3 right-3">
          <Button variant="outline" size="sm" onClick={onRequestLocation}>Enable location</Button>
        </div>
      )}

      <GoogleMap
        center={center}
        zoom={12}
        options={{
          disableDefaultUI: false,
          streetViewControl: false,
          mapTypeControl: false,
          clickableIcons: true,
          fullscreenControl: true,
        }}
        mapContainerStyle={{ width: "100%", height: "100%" }}
      >
        {/* User Location Marker */}
        {userLocation && isValidLatLng(userLocation.lat, userLocation.lng) && (
          <Marker
            position={{ lat: Number(userLocation.lat), lng: Number(userLocation.lng) }}
            onClick={() => setActiveTripId(null)}
          >
            <InfoWindow>
              <div className="text-center font-semibold">
                <Navigation className="w-4 h-4 inline mr-1" />
                Your Location
              </div>
            </InfoWindow>
          </Marker>
        )}

        {/* Trip Markers */}
        {trips
          .filter((trip) => isValidLatLng(trip.pickup_lat, trip.pickup_lng))
          .map((trip) => {
            const lat = Number(trip.pickup_lat);
            const lng = Number(trip.pickup_lng);
            return (
              <Marker
                key={trip.id}
                position={{ lat, lng }}
                onClick={() => setActiveTripId(trip.id)}
              >
                {activeTripId === trip.id && (
                  <InfoWindow onCloseClick={() => setActiveTripId(null)} options={{ maxWidth: 280 }}>
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
                                {(trip.rider.full_name || trip.rider.display_name || "U")[0].toUpperCase()}
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
                          <p className="text-xs text-muted-foreground">Distance from you: {trip.distance} mi</p>
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
                  </InfoWindow>
                )}
              </Marker>
            );
          })}
      </GoogleMap>
    </div>
  );
}
