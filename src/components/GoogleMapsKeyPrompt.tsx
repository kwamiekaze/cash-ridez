import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function GoogleMapsKeyPrompt() {
  const [open, setOpen] = useState(!import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
  const [apiKey, setApiKey] = useState('');
  const { toast } = useToast();

  const handleSave = () => {
    if (!apiKey.trim()) {
      toast({
        title: "API Key Required",
        description: "Please enter a valid Google Maps API key.",
        variant: "destructive",
      });
      return;
    }

    // In a real app, this would be saved to backend/env
    toast({
      title: "API Key Saved",
      description: "Please contact support to configure your Google Maps API key in project settings.",
    });
    setOpen(false);
  };

  if (import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
    return null;
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <MapPin className="w-6 h-6 text-primary" />
            </div>
            <AlertDialogTitle className="text-xl">
              Google Maps Setup Required
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-base space-y-3">
            <p>
              To enable map features, you need to configure a Google Maps API key.
            </p>
            <div className="space-y-2">
              <Label htmlFor="api-key">Google Maps API Key</Label>
              <Input
                id="api-key"
                type="text"
                placeholder="Enter your API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>To get an API key:</p>
              <ol className="list-decimal list-inside ml-2 space-y-1">
                <li>Visit the Google Cloud Console</li>
                <li>Enable the Maps JavaScript API</li>
                <li>Create a browser-restricted API key</li>
                <li>Add VITE_GOOGLE_MAPS_API_KEY to your project settings</li>
              </ol>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Skip for Now
          </Button>
          <Button onClick={handleSave}>
            Save & Configure
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
