import { Car } from "lucide-react";

interface VehicleInfoProps {
  year?: string | null;
  make?: string | null;
  model?: string | null;
  className?: string;
}

export function VehicleInfo({ year, make, model, className = "" }: VehicleInfoProps) {
  if (!year && !make && !model) return null;

  const vehicleText = [year, make, model].filter(Boolean).join(" ");

  return (
    <div className={`flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}>
      <Car className="h-3 w-3" />
      <span>{vehicleText}</span>
    </div>
  );
}
