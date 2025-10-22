import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Navigation } from 'lucide-react';
import { getCurrentLocation } from '@/utils/geolocation';
import { useToast } from '@/hooks/use-toast';

interface LocationPermissionDialogProps {
  onLocationEnabled: (location: { lat: number; lng: number }) => void;
}

export function LocationPermissionDialog({ onLocationEnabled }: LocationPermissionDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Check if we already have location permission
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        if (result.state === 'prompt') {
          // Show dialog after 3 seconds if permission hasn't been decided
          const timer = setTimeout(() => {
            setOpen(true);
          }, 3000);
          return () => clearTimeout(timer);
        }
      }).catch(() => {
        // If permissions API isn't supported, still show the dialog
        const timer = setTimeout(() => {
          setOpen(true);
        }, 3000);
        return () => clearTimeout(timer);
      });
    } else {
      // Fallback for browsers without permissions API
      const timer = setTimeout(() => {
        setOpen(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleEnable = async () => {
    try {
      const location = await getCurrentLocation();
      onLocationEnabled(location);
      setOpen(false);
      toast({
        title: "Location Enabled! 📍",
        description: "You can now see trips near you and share your location with connected riders/drivers.",
      });
    } catch (error: any) {
      setOpen(false);
      toast({
        title: "Location Access Denied",
        description: "Please enable location access in your browser settings to see nearby trips.",
        variant: "destructive",
      });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <Navigation className="w-6 h-6 text-primary" />
            </div>
            <AlertDialogTitle className="text-xl">
              Enable Location Access
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-base space-y-2">
            <p>
              Share your location to unlock these features:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Find trips near you</li>
              <li>See your distance from pickup locations</li>
              <li>Share your location with connected riders/drivers</li>
              <li>Get accurate ETAs</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-4">
              Your location is only shared with riders/drivers on active trips and never stored permanently.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Maybe Later</AlertDialogCancel>
          <AlertDialogAction onClick={handleEnable} className="bg-primary">
            Enable Location
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
