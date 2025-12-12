import { formatAddress, openNavigation } from "@/utils/addressFormatter";
import { ExternalLink } from "lucide-react";

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
 * Renders a formatted, clickable address that opens in the user's maps app
 */
export function AddressLink({ 
  address, 
  lat, 
  lng, 
  isDestination = false,
  className = "",
  showIcon = false
}: AddressLinkProps) {
  const formattedAddress = formatAddress(address);
  
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openNavigation({ address, lat, lng, isDestination });
  };
  
  return (
    <button
      type="button"
      onClick={handleClick}
      className={`text-left text-primary hover:underline cursor-pointer inline-flex items-start gap-1 ${className}`}
    >
      <span className="break-words">{formattedAddress}</span>
      {showIcon && <ExternalLink className="h-3 w-3 flex-shrink-0 mt-0.5" />}
    </button>
  );
}
