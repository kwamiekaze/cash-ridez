import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface RatingDisplayProps {
  rating: number;
  count?: number;
  size?: "sm" | "md" | "lg";
  showCount?: boolean;
  className?: string;
}

export function RatingDisplay({ rating, count = 0, size = "md", showCount = true, className }: RatingDisplayProps) {
  const sizeClasses = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  const textSizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  if (count === 0) {
    return (
      <span className={cn("text-muted-foreground", textSizeClasses[size], className)}>
        New user
      </span>
    );
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Star className={cn(sizeClasses[size], "fill-yellow-400 text-yellow-400")} />
      <span className={cn("font-medium", textSizeClasses[size])}>
        {rating.toFixed(1)}
      </span>
      {showCount && (
        <span className={cn("text-muted-foreground", textSizeClasses[size])}>
          ({count})
        </span>
      )}
    </div>
  );
}
