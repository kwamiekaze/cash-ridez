import { useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Navigation, MapPin } from 'lucide-react';
import { useLocationSharing } from '@/hooks/useLocationSharing';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

interface RideLocationSharingProps {
  rideId: string;
  participantName: string;
}

export function RideLocationSharing({ rideId, participantName }: RideLocationSharingProps) {
  const { participantLocation, shareLocation, isSharing, setIsSharing } = useLocationSharing(rideId);
  const { toast } = useToast();

  const handleEnableSharing = async () => {
    try {
      await shareLocation();
      toast({
        title: "Location Sharing Enabled",
        description: `${participantName} can now see your approximate location.`,
      });
    } catch (error) {
      toast({
        title: "Failed to Share Location",
        description: "Please enable location access in your browser.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="border-primary/20">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Navigation className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Location Sharing</h3>
          </div>
          {isSharing && (
            <Badge variant="outline" className="text-success border-success/50">
              Active
            </Badge>
          )}
        </div>

        {!isSharing ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Share your location with {participantName} for better coordination.
            </p>
            <Button onClick={handleEnableSharing} className="w-full gap-2">
              <Navigation className="w-4 h-4" />
              Share My Location
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Your location is being shared</p>
                <p className="text-muted-foreground text-xs">Updates every 30 seconds</p>
              </div>
            </div>

            {participantLocation && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">{participantName}'s location</p>
                  <p className="text-muted-foreground text-xs">
                    Lat: {participantLocation.lat.toFixed(4)}, Lng: {participantLocation.lng.toFixed(4)}
                  </p>
                </div>
              </div>
            )}

            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setIsSharing(false)}
              className="w-full"
            >
              Stop Sharing
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
