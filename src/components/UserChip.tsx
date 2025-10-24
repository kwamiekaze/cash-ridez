import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RatingDisplay } from "@/components/RatingDisplay";
import { CancellationBadge } from "@/components/CancellationBadge";
import { MemberBadge } from "@/components/MemberBadge";
import { AdminBadge } from "@/components/AdminBadge";
import { supabase } from "@/integrations/supabase/client";

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

  useEffect(() => {
    // Fetch ratings from public table if not provided
    if ((providedRatingAvg === undefined || providedRatingCount === undefined) && role) {
      fetchPublicStats();
    } else {
      setRatingAvg(providedRatingAvg);
      setRatingCount(providedRatingCount);
    }
    
    // Fetch member status and admin role
    fetchMemberStatus();
    fetchAdminRole();
  }, [userId, role, providedRatingAvg, providedRatingCount]);

  const fetchMemberStatus = async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('is_member')
        .eq('id', userId)
        .single();
      
      if (data) {
        setIsMember(data.is_member || false);
      }
    } catch (error) {
      console.error('Error fetching member status:', error);
    }
  };

  const fetchAdminRole = async () => {
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();
      
      setIsAdmin(!!data);
    } catch (error) {
      console.error('Error fetching admin role:', error);
    }
  };

  const fetchPublicStats = async () => {
    try {
      const { data } = await supabase
        .from('user_public_stats')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (data && role) {
        if (role === "rider") {
          setRatingAvg(data.rider_rating_avg);
          setRatingCount(data.rider_rating_count);
        } else if (role === "driver") {
          setRatingAvg(data.driver_rating_avg);
          setRatingCount(data.driver_rating_count);
        }
      }
    } catch (error) {
      console.error('Error fetching public stats:', error);
    }
  };
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
    <div className={`flex items-center gap-3 ${className}`}>
      <Avatar className={avatarSizes[size]}>
        <AvatarImage src={photoUrl} alt={name} />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`font-medium ${textSizes[size]} truncate`}>{name}</p>
          <AdminBadge isAdmin={isAdmin} />
          <MemberBadge isMember={isMember} />
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
