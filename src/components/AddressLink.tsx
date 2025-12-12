import { useState } from "react";
import { formatAddress } from "@/utils/addressFormatter";
import { ExternalLink } from "lucide-react";
import { NavigationConfirmDialog } from "@/components/NavigationConfirmDialog";

interface AddressLinkProps {
  address: string;
  lat?: number;
  lng?: number;
  isDestination?: boolean;
  className?: string;
  showIcon?: boolean;
}

/**
 * AddressLink Component
 * Renders a formatted, clickable address that shows a confirmation dialog
 * before opening in the user's maps app
 */
export function AddressLink({ 
  address, 
  lat, 
  lng, 
  isDestination = false,
  className = "",
  showIcon = false
}: AddressLinkProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const formattedAddress = formatAddress(address);
  
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDialogOpen(true);
  };
  
  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`text-left text-primary hover:underline cursor-pointer inline-flex items-start gap-1 ${className}`}
      >
        <span className="break-words">{formattedAddress}</span>
        {showIcon && <ExternalLink className="h-3 w-3 flex-shrink-0 mt-0.5" />}
      </button>
      
      <NavigationConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        locationType={isDestination ? "Dropoff" : "Pickup"}
        address={address}
        lat={lat}
        lng={lng}
      />
    </>
  );
}
