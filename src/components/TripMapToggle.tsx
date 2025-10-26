import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Map, List } from "lucide-react";

interface TripMapToggleProps {
  showMap: boolean;
  onToggle: (show: boolean) => void;
  className?: string;
}

export const TripMapToggle = ({ showMap, onToggle, className }: TripMapToggleProps) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Button
        variant={showMap ? "default" : "outline"}
        size="sm"
        onClick={() => onToggle(true)}
        aria-label="Show map view"
        aria-pressed={showMap}
      >
        <Map className="h-4 w-4 mr-2" />
        Map
      </Button>
      <Button
        variant={!showMap ? "default" : "outline"}
        size="sm"
        onClick={() => onToggle(false)}
        aria-label="Show list view"
        aria-pressed={!showMap}
      >
        <List className="h-4 w-4 mr-2" />
        List
      </Button>
    </div>
  );
};
