import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RatingDisplay } from "@/components/RatingDisplay";
import { CancellationBadge } from "@/components/CancellationBadge";

interface UserChipProps {
  userId: string;
  displayName?: string;
  fullName?: string;
  photoUrl?: string;
  role?: "rider" | "driver";
  ratingAvg?: number;
  ratingCount?: number;
  showCancellationBadge?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function UserChip({
  userId,
  displayName,
  fullName,
  photoUrl,
  role,
  ratingAvg,
  ratingCount,
  showCancellationBadge = true,
  size = "md",
  className = "",
}: UserChipProps) {
  const avatarSizes = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
  };

  const textSizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  const name = fullName || displayName || `User ${userId.slice(0, 8)}`;
  const initials = name[0].toUpperCase();

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Avatar className={avatarSizes[size]}>
        <AvatarImage src={photoUrl} alt={name} />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`font-medium ${textSizes[size]} truncate`}>{name}</p>
          {showCancellationBadge && (
            <CancellationBadge userId={userId} role={role} size="sm" />
          )}
        </div>
        {ratingCount && ratingCount > 0 && (
          <RatingDisplay
            rating={ratingAvg || 0}
            count={ratingCount}
            size={size === "lg" ? "md" : "sm"}
            className="mt-0.5"
          />
        )}
      </div>
    </div>
  );
}
