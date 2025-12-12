import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Copy, Navigation } from "lucide-react";
import { toast } from "sonner";
import { formatAddress, getNavigationUrl } from "@/utils/addressFormatter";

interface NavigationConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationType: "Pickup" | "Dropoff";
  address: string;
  lat?: number;
  lng?: number;
}

export function NavigationConfirmDialog({
  open,
  onOpenChange,
  locationType,
  address,
  lat,
  lng,
}: NavigationConfirmDialogProps) {
  const [isCopying, setIsCopying] = useState(false);
  
  const formattedAddress = formatAddress(address);
  
  const handleOpenNavigation = () => {
    const isDestination = locationType === "Dropoff";
    const url = getNavigationUrl({ address, lat, lng, isDestination });
    
    // Try to open in new tab/window
    const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
    
    // If blocked by popup blocker, copy address and show toast
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      handleCopyAddress(true);
    } else {
      onOpenChange(false);
    }
  };
  
  const handleCopyAddress = async (isFailover = false) => {
    setIsCopying(true);
    try {
      await navigator.clipboard.writeText(formattedAddress);
      if (isFailover) {
        toast.info("Couldn't open maps automatically. Address copied—paste it into your maps app.");
      } else {
        toast.success("Address copied to clipboard");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error("Failed to copy address");
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5" />
            Open Navigation?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <div>
              <span className="font-medium text-foreground">{locationType} Location</span>
            </div>
            <p className="text-sm break-words">{formattedAddress}</p>
            <p className="text-xs text-muted-foreground">
              This will open your default maps app.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full sm:w-auto"
            onClick={() => handleCopyAddress(false)}
            disabled={isCopying}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy Address
          </Button>
          <div className="flex gap-2 w-full sm:w-auto">
            <AlertDialogCancel className="flex-1 sm:flex-initial">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="flex-1 sm:flex-initial"
              onClick={handleOpenNavigation}
            >
              Open
            </AlertDialogAction>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
