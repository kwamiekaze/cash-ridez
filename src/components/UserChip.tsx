import { memo, useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RatingDisplay } from "@/components/RatingDisplay";
import { CancellationBadge } from "@/components/CancellationBadge";
import { MemberBadge } from "@/components/MemberBadge";
import { AdminBadge } from "@/components/AdminBadge";
import { UserProfileModal } from "@/components/UserProfileModal";
import { VehicleInfo } from "@/components/VehicleInfo";
import { supabase } from "@/integrations/supabase/client";
import { Crown } from "lucide-react";

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

// Cache for user data to avoid repeated fetches
const userDataCache = new Map<string, { timestamp: number; data: any }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const UserChip = memo(function UserChip({
  userId,
  displayName,
  fullName,
  photoUrl,
  role,
  ratingAvg: providedRatingAvg,
  ratingCount: providedRatingCount,
  showCancellationBadge = true,
  size = "md",
  className = "",
}: UserChipProps) {
  const [ratingAvg, setRatingAvg] = useState(providedRatingAvg);
  const [ratingCount, setRatingCount] = useState(providedRatingCount);
  const [isMember, setIsMember] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [vehicleInfo, setVehicleInfo] = useState<{ year?: string; make?: string; model?: string }>({});
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    // Check cache first
    const cached = userDataCache.get(userId);
    const now = Date.now();
    
    if (cached && now - cached.timestamp < CACHE_DURATION) {
      // Use cached data
      const { isMember: cachedMember, isAdmin: cachedAdmin, stats } = cached.data;
      setIsMember(cachedMember || false);
      setIsAdmin(cachedAdmin || false);
      if (stats && role) {
        setRatingAvg(role === "rider" ? stats.rider_rating_avg : stats.driver_rating_avg);
        setRatingCount(role === "rider" ? stats.rider_rating_count : stats.driver_rating_count);
      }
      return;
    }

    // Combine all fetches into one
    const fetchUserData = async () => {
      try {
        // Single combined query
        const [profileRes, roleRes, statsRes] = await Promise.all([
          supabase.from('profiles').select('is_member, car_year, car_make, car_model').eq('id', userId).single(),
          supabase.from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle(),
          role && (providedRatingAvg === undefined || providedRatingCount === undefined)
            ? supabase.from('user_public_stats').select('*').eq('user_id', userId).maybeSingle()
            : Promise.resolve({ data: null })
        ]);

        const isMember = profileRes.data?.is_member || false;
        const isAdmin = !!roleRes.data;
        const stats = statsRes.data;
        
        // Set vehicle info if driver
        if (role === "driver" && profileRes.data) {
          setVehicleInfo({
            year: profileRes.data.car_year || undefined,
            make: profileRes.data.car_make || undefined,
            model: profileRes.data.car_model || undefined,
          });
        }

        // Cache the results
        userDataCache.set(userId, {
          timestamp: now,
          data: { isMember, isAdmin, stats, vehicleInfo: profileRes.data }
        });

        setIsMember(isMember);
        setIsAdmin(isAdmin);

        if (stats && role) {
          setRatingAvg(role === "rider" ? stats.rider_rating_avg : stats.driver_rating_avg);
          setRatingCount(role === "rider" ? stats.rider_rating_count : stats.driver_rating_count);
        } else {
          setRatingAvg(providedRatingAvg);
          setRatingCount(providedRatingCount);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    fetchUserData();
  }, [userId, role, providedRatingAvg, providedRatingCount]);
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

  // Helper to detect if a string is an email
  const isEmail = (str?: string) => {
    if (!str) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
  };

  // For privacy: never show emails, use full name or user ID instead
  const safeName = fullName || (isEmail(displayName) ? undefined : displayName);
  const name = safeName || `User ${userId.slice(0, 8)}`;
  const initials = name[0].toUpperCase();

  return (
    <>
      <div 
        className={`flex items-center gap-3 cursor-pointer hover:bg-muted/50 rounded-lg p-2 transition-colors ${className}`}
        onClick={() => setModalOpen(true)}
      >
        <Avatar className={avatarSizes[size]}>
          <AvatarImage src={photoUrl} alt={name} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-medium ${textSizes[size]} truncate`}>{name}</p>
            {isAdmin && <Crown className="h-4 w-4 text-primary fill-primary" />}
            <AdminBadge isAdmin={isAdmin} />
            <MemberBadge isMember={isMember} />
            {showCancellationBadge && (
              <CancellationBadge userId={userId} role={role} size="sm" />
            )}
          </div>
          {role === "driver" && <VehicleInfo {...vehicleInfo} />}
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
      
      <UserProfileModal 
        userId={userId}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </>
  );
});
