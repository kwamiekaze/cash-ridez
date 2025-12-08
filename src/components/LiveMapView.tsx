import { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Loader2, Navigation, RefreshCw, Crosshair, Users, Eye, EyeOff, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { LocationConsentDialog } from "./LocationConsentDialog";
import { AdminMapUserInfoPanel } from "./AdminMapUserInfoPanel";


// Leaflet imports (lazy loaded)
let L: any = null;

interface Driver {
  user_id: string;
  state: string;
  approx_geo: unknown;
  current_zip: string | null;
  updated_at: string;
  profile?: {
    display_name: string | null;
    full_name: string | null;
    photo_url: string | null;
    subscription_active: boolean | null;
    car_make: string | null;
    car_model: string | null;
    car_year: string | null;
    location_updated_at?: string | null;
    is_verified?: boolean | null;
    verification_status?: string | null;
    email?: string | null;
    phone_number?: string | null;
    current_lat?: number | null;
    current_lng?: number | null;
    active_role?: string | null;
  };
}

interface AdminLocation {
  user_id: string;
  lat: number;
  lng: number;
  display_name: string | null;
  full_name: string | null;
  photo_url: string | null;
  location_updated_at?: string | null;
  is_verified?: boolean | null;
  verification_status?: string | null;
  email?: string | null;
  phone_number?: string | null;
  subscription_active?: boolean | null;
  active_role?: string | null;
}

// All users on map for admin
interface AllMapUser {
  id: string;
  display_name: string | null;
  full_name: string | null;
  photo_url: string | null;
  current_lat: number | null;
  current_lng: number | null;
  location_updated_at?: string | null;
  is_verified?: boolean | null;
  verification_status?: string | null;
  email?: string | null;
  phone_number?: string | null;
  subscription_active?: boolean | null;
  active_role?: string | null;
  car_make?: string | null;
  car_model?: string | null;
  car_year?: string | null;
  is_map_visible?: boolean | null;
  isAdmin?: boolean;
  isDriver?: boolean;  // From profiles.is_driver
  isRider?: boolean;   // From profiles.is_rider
  map_history_hidden_from_public?: boolean | null;
}

// Helper to derive display role label based on actual roles
const getRoleLabel = (user: AllMapUser, isViewerAdmin: boolean = false): string => {
  // Admins always show as "Admin" to non-admin viewers
  if (user.isAdmin && !isViewerAdmin) {
    return 'Admin';
  }
  
  // For admins or when viewing own role, show full roles
  const roles: string[] = [];
  if (user.isAdmin) roles.push('Admin');
  if (user.isDriver) roles.push('Driver');
  if (user.isRider) roles.push('Rider');
  
  if (roles.length === 0) return 'User';
  return roles.join(' & ');
};

// Helper to determine marker variant based on roles
const getMarkerVariant = (user: AllMapUser): 'driver' | 'rider' | 'admin' => {
  if (user.isAdmin) return 'admin';
  if (user.isDriver) return 'driver';
  return 'rider';
};

const parseApproxGeo = (geo: unknown): { lat: number; lng: number } | null => {
  if (!geo || typeof geo !== 'object') return null;
  const g = geo as Record<string, unknown>;
  if (typeof g.lat === 'number' && typeof g.lng === 'number') {
    return { lat: g.lat, lng: g.lng };
  }
  return null;
};


interface UserProfile {
  id: string;
  active_role: string | null;
  current_lat: number | null;
  current_lng: number | null;
  display_name: string | null;
  full_name: string | null;
}

interface LiveMapViewProps {
  className?: string;
}

// Jitter for privacy
const getJitteredCoords = (lat: number, lng: number, id: string, jitterMiles = 0.35) => {
  const today = new Date().toDateString();
  const seed = `${id}-${today}`;
  
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash;
  }
  
  const random1 = ((hash % 1000) / 1000) * 2 - 1;
  const random2 = (((hash >> 10) % 1000) / 1000) * 2 - 1;
  
  const latOffset = (random1 * jitterMiles) / 69;
  const lngOffset = (random2 * jitterMiles) / 54;
  
  return {
    lat: lat + latOffset,
    lng: lng + lngOffset
  };
};

// Get online status based on location_updated_at
const getOnlineStatus = (locationUpdatedAt: string | null): { isOnline: boolean; isOffline: boolean; opacity: number; borderColor: string } => {
  if (!locationUpdatedAt) {
    return { isOnline: false, isOffline: true, opacity: 0.4, borderColor: '#6B7280' };
  }
  
  const now = new Date();
  const lastUpdate = new Date(locationUpdatedAt);
  const diffMinutes = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
  
  if (diffMinutes <= 10) {
    return { isOnline: true, isOffline: false, opacity: 1, borderColor: '#10B981' }; // Green, full opacity
  } else if (diffMinutes <= 60) {
    return { isOnline: false, isOffline: false, opacity: 0.7, borderColor: '#FACC15' }; // Yellow, slightly faded
  }
  return { isOnline: false, isOffline: true, opacity: 0.4, borderColor: '#6B7280' }; // Gray, faded
};

// Helper to create avatar-based divIcon with transparent background and status styling
const createAvatarDivIcon = (
  L: any,
  avatarUrl: string | null | undefined,
  variant: 'driver' | 'rider' | 'admin',
  locationUpdatedAt?: string | null,
  isAdminView: boolean = false
): any => {
  const fallbackIcons: Record<string, string> = {
    driver: '/assets/map/driver-car-icon.png',
    rider: '/assets/map/rider-circle-icon.png',
    admin: '/assets/map/driver-car-icon.png', // Admin uses same as driver, no crown
  };

  // Get status styling (only apply for admin view)
  const status = isAdminView ? getOnlineStatus(locationUpdatedAt || null) : { isOnline: false, isOffline: false, opacity: 1, borderColor: '#FACC15' };
  
  const size = 48;
  const borderWidth = 2;
  const borderColor = isAdminView ? status.borderColor : '#FACC15';
  const opacity = isAdminView ? status.opacity : 1;

  // Online indicator dot for admin view
  const onlineIndicator = isAdminView && status.isOnline 
    ? `<div style="position:absolute;top:0;right:0;width:12px;height:12px;background:#10B981;border-radius:50%;border:2px solid #1a1a2e;"></div>`
    : '';

  // If no avatar, use fallback icon with transparent styling
  if (!avatarUrl) {
    const html = `<div class="map-avatar-marker" style="position:relative;width:${size}px;height:${size}px;opacity:${opacity};"><div style="width:${size}px;height:${size}px;border-radius:50%;border:${borderWidth}px solid ${borderColor};background:transparent;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);overflow:hidden;"><img src="${fallbackIcons[variant]}" style="width:${size - 8}px;height:${size - 8}px;object-fit:contain;" /></div>${onlineIndicator}</div>`;

    return L.divIcon({
      html,
      className: 'map-avatar-icon',
      iconSize: [size, size],
      iconAnchor: [size / 2, size],
      popupAnchor: [0, -size],
    });
  }

  // Create divIcon with avatar
  const html = `<div class="map-avatar-marker" style="position:relative;width:${size}px;height:${size}px;opacity:${opacity};"><img src="${avatarUrl}" style="width:${size}px;height:${size}px;border-radius:50%;border:${borderWidth}px solid ${borderColor};object-fit:cover;background-color:#374151;box-shadow:0 2px 8px rgba(0,0,0,0.4);" onerror="this.onerror=null;this.src='${fallbackIcons[variant]}';" />${onlineIndicator}</div>`;

  return L.divIcon({
    html,
    className: 'map-avatar-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
};

export function LiveMapView({ className }: LiveMapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isMapVisible, setIsMapVisible] = useState(true); // User's own visibility toggle
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminOnPublicMap, setShowAdminOnPublicMap] = useState(false);
  const [adminLocations, setAdminLocations] = useState<AdminLocation[]>([]);
  const [allMapUsers, setAllMapUsers] = useState<AllMapUser[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<AllMapUser[]>([]); // For non-admin shared visibility
  const [allUsersForNonAdmin, setAllUsersForNonAdmin] = useState<AllMapUser[]>([]); // All users who have ever updated pin (for non-admin filter)
  const [selectedUser, setSelectedUser] = useState<AllMapUser | null>(null);
  const [showUserInfoPanel, setShowUserInfoPanel] = useState(false);
  const [userFilter, setUserFilter] = useState<'online' | 'all'>('online'); // Filter between online vs all users
  // Admin time range filter for "All Users" mode
  const [adminTimeRange, setAdminTimeRange] = useState<'all' | 'month' | 'week' | '72h' | '24h' | '5h' | '1h'>('24h');

  // Check if user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
    };
    checkAdmin();
  }, [user]);

  // Fetch admin visibility setting
  useEffect(() => {
    const fetchAdminVisibility = async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "map_settings")
        .maybeSingle();
      
      if (data?.value && typeof data.value === 'object') {
        const settings = data.value as Record<string, unknown>;
        setShowAdminOnPublicMap(settings.show_admin_on_public_map === true);
      }
    };
    fetchAdminVisibility();
  }, []);

  // Fetch user profile including visibility setting
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("id, active_role, current_lat, current_lng, display_name, full_name, is_map_visible")
        .eq("id", user.id)
        .single();
      if (data) {
        setUserProfile(data);
        setIsMapVisible(data.is_map_visible !== false); // Default to true if null
        if (data.current_lat && data.current_lng) {
          setUserLocation({ lat: data.current_lat, lng: data.current_lng });
        }
      }
    };
    fetchProfile();
  }, [user]);

  // Check if we should prompt for location
  useEffect(() => {
    if (user) {
      const consent = localStorage.getItem("location_consent");
      if (!consent) {
        const timer = setTimeout(() => setShowLocationDialog(true), 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [user]);

  const isDriver = userProfile?.active_role === 'driver';
  const isRider = userProfile?.active_role === 'rider';

  // Toggle admin visibility setting
  const handleToggleAdminVisibility = async (checked: boolean) => {
    if (!isAdmin) return;
    
    try {
      await supabase
        .from("app_settings")
        .update({ 
          value: { show_admin_on_public_map: checked },
          updated_at: new Date().toISOString()
        })
        .eq("key", "map_settings");
      
      setShowAdminOnPublicMap(checked);
      toast({
        title: checked ? "Admin visible on map" : "Admin hidden from map",
        description: checked 
          ? "Drivers and riders can now see your location."
          : "Only admins can see your location.",
      });
    } catch (error) {
      console.error("Error updating admin visibility:", error);
      toast({
        title: "Error",
        description: "Failed to update visibility setting.",
        variant: "destructive",
      });
    }
  };

  // Toggle user's own map visibility
  // When an admin toggles to invisible, also hide their history from public
  const handleToggleVisibility = async (checked: boolean) => {
    if (!user) return;
    
    try {
      const updateData: any = { is_map_visible: checked };
      
      // If admin is going invisible, also hide their history from public
      if (isAdmin && !checked) {
        updateData.map_history_hidden_from_public = true;
        updateData.map_history_cleared_at = new Date().toISOString();
        updateData.map_history_cleared_by = user.id;
      }
      
      await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", user.id);
      
      setIsMapVisible(checked);
      toast({
        title: checked ? "You're now visible" : "You're now invisible",
        description: checked 
          ? "Other users can see you on the map."
          : isAdmin 
            ? "You're hidden from other users and your history is now hidden from public view."
            : "You're hidden from other users",
      });
    } catch (error) {
      console.error("Error updating visibility:", error);
      toast({
        title: "Error",
        description: "Failed to update visibility setting.",
        variant: "destructive",
      });
    }
  };

  // Admin: Clear own map visibility history
  const handleClearOwnHistory = async () => {
    if (!user || !isAdmin) return;
    
    try {
      await supabase
        .from("profiles")
        .update({
          map_history_hidden_from_public: true,
          map_history_cleared_at: new Date().toISOString(),
          map_history_cleared_by: user.id,
        })
        .eq("id", user.id);
      
      toast({
        title: "History cleared",
        description: "Your map visibility history is now hidden from public users.",
      });
      
      await fetchMapData();
    } catch (error) {
      console.error("Error clearing own history:", error);
      toast({
        title: "Error",
        description: "Failed to clear history.",
        variant: "destructive",
      });
    }
  };

  // Fetch map data based on role
  const fetchMapData = useCallback(async () => {
    try {
      const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // For admin: fetch ALL users with location data (no time filter)
      if (isAdmin) {
        // Get all users with location data (admins see everyone, including invisible users)
        const { data: allProfiles } = await supabase
          .from("profiles")
          .select("id, display_name, full_name, photo_url, current_lat, current_lng, location_updated_at, is_verified, verification_status, email, phone_number, subscription_active, active_role, car_make, car_model, car_year, is_map_visible, is_driver, is_rider, map_history_hidden_from_public")
          .not("current_lat", "is", null)
          .not("current_lng", "is", null);

        // Get all admin user IDs
        const { data: adminRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");
        const adminIds = new Set(adminRoles?.map(r => r.user_id) || []);

        if (allProfiles) {
          const users: AllMapUser[] = allProfiles.map(p => ({
            id: p.id,
            display_name: p.display_name,
            full_name: p.full_name,
            photo_url: p.photo_url,
            current_lat: p.current_lat,
            current_lng: p.current_lng,
            location_updated_at: p.location_updated_at,
            is_verified: p.is_verified,
            verification_status: p.verification_status,
            email: p.email,
            phone_number: p.phone_number,
            subscription_active: p.subscription_active,
            active_role: p.active_role,
            car_make: p.car_make,
            car_model: p.car_model,
            car_year: p.car_year,
            is_map_visible: p.is_map_visible,
            isAdmin: adminIds.has(p.id),
            isDriver: (p as any).is_driver === true,  // Use actual is_driver field
            isRider: (p as any).is_rider === true,    // Use actual is_rider field
            map_history_hidden_from_public: (p as any).map_history_hidden_from_public,
          }));
          setAllMapUsers(users);
        }
      }

      // For NON-ADMIN users (drivers and riders): fetch online users (location updated within 60 minutes)
      // Also filter by is_map_visible = true for other users, but ALWAYS include the current user
      if (!isAdmin && user) {
        // First, get all online users with recent location AND visibility enabled AND not hidden history
        const { data: onlineProfiles } = await supabase
          .from("profiles")
          .select("id, display_name, full_name, photo_url, current_lat, current_lng, location_updated_at, is_verified, subscription_active, active_role, car_make, car_model, car_year, is_map_visible, is_driver, is_rider, map_history_hidden_from_public")
          .not("current_lat", "is", null)
          .not("current_lng", "is", null)
          .gte("location_updated_at", sixtyMinutesAgo)
          .eq("is_map_visible", true)
          .or("map_history_hidden_from_public.is.null,map_history_hidden_from_public.eq.false"); // Only fetch users without hidden history

        // Fetch ALL users with any location data (for "All Users" filter - within last 24 hours for normal users)
        // Also filter out users with hidden history
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: allVisibleProfiles } = await supabase
          .from("profiles")
          .select("id, display_name, full_name, photo_url, current_lat, current_lng, location_updated_at, is_verified, subscription_active, active_role, car_make, car_model, car_year, is_map_visible, is_driver, is_rider, map_history_hidden_from_public")
          .not("current_lat", "is", null)
          .not("current_lng", "is", null)
          .gte("location_updated_at", twentyFourHoursAgo)
          .eq("is_map_visible", true)
          .or("map_history_hidden_from_public.is.null,map_history_hidden_from_public.eq.false");

        // Also fetch the current user's profile separately to ensure they always see themselves
        const { data: ownProfile } = await supabase
          .from("profiles")
          .select("id, display_name, full_name, photo_url, current_lat, current_lng, location_updated_at, is_verified, subscription_active, active_role, car_make, car_model, car_year, is_map_visible, is_driver, is_rider, map_history_hidden_from_public")
          .eq("id", user.id)
          .single();

        // Get admin IDs to exclude from non-admin view (unless showAdminOnPublicMap is true)
        const { data: adminRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");
        const adminIds = new Set(adminRoles?.map(r => r.user_id) || []);

        // Helper to map profile to AllMapUser
        const mapProfileToUser = (p: any): AllMapUser => ({
          id: p.id,
          display_name: p.display_name,
          full_name: p.full_name,
          photo_url: p.photo_url,
          current_lat: p.current_lat,
          current_lng: p.current_lng,
          location_updated_at: p.location_updated_at,
          is_verified: p.is_verified,
          subscription_active: p.subscription_active,
          active_role: p.active_role,
          car_make: p.car_make,
          car_model: p.car_model,
          car_year: p.car_year,
          is_map_visible: p.is_map_visible,
          isAdmin: adminIds.has(p.id),
          isDriver: p.is_driver === true,  // Use actual is_driver field
          isRider: p.is_rider === true,    // Use actual is_rider field
          map_history_hidden_from_public: p.map_history_hidden_from_public,
        });

        // Process online users
        const onlineProfilesList = onlineProfiles || [];
        const onlineProfileIds = new Set(onlineProfilesList.map(p => p.id));
        
        // Add current user if they have location data but weren't in the online query
        if (ownProfile && ownProfile.current_lat && ownProfile.current_lng && !onlineProfileIds.has(ownProfile.id)) {
          onlineProfilesList.push(ownProfile);
        }

        const onlineUsersList: AllMapUser[] = onlineProfilesList
          .filter(p => {
            if (p.id === user.id) return true;
            if (adminIds.has(p.id) && !showAdminOnPublicMap) return false;
            return true;
          })
          .map(mapProfileToUser);
        setOnlineUsers(onlineUsersList);

        // Process all users (for "All Users" filter)
        const allProfilesList = allVisibleProfiles || [];
        const allProfileIds = new Set(allProfilesList.map(p => p.id));
        
        // Add current user if not in list
        if (ownProfile && ownProfile.current_lat && ownProfile.current_lng && !allProfileIds.has(ownProfile.id)) {
          allProfilesList.push(ownProfile);
        }

        const allUsersList: AllMapUser[] = allProfilesList
          .filter(p => {
            if (p.id === user.id) return true;
            if (adminIds.has(p.id) && !showAdminOnPublicMap) return false;
            return true;
          })
          .map(mapProfileToUser);
        setAllUsersForNonAdmin(allUsersList);
      }

      // Fetch driver status for the current user if they're a driver
      if (isDriver && user) {
        const { data: driverData } = await supabase
          .from("driver_status")
          .select(`user_id, state, approx_geo, current_zip, updated_at`)
          .eq("user_id", user.id)
          .single();

        if (driverData) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, display_name, full_name, photo_url, subscription_active, car_make, car_model, car_year, location_updated_at, is_verified, verification_status, email, phone_number, current_lat, current_lng, active_role")
            .eq("id", user.id)
            .single();

          setDrivers([{ ...driverData, profile: profile || undefined }]);
          
          const geo = parseApproxGeo(driverData.approx_geo);
          if (geo) {
            setUserLocation(geo);
          }
        } else {
          setDrivers([]);
        }
      } else if (!isAdmin) {
        setDrivers([]);
      }

      if (isAdmin || showAdminOnPublicMap) {
        const { data: adminRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");

        if (adminRoles && adminRoles.length > 0) {
          const adminIds = adminRoles.map(r => r.user_id);
          const { data: adminProfiles } = await supabase
            .from("profiles")
            .select("id, current_lat, current_lng, display_name, full_name, photo_url, location_updated_at, is_verified, verification_status, email, phone_number, subscription_active, active_role")
            .in("id", adminIds)
            .not("current_lat", "is", null)
            .not("current_lng", "is", null);

          if (adminProfiles) {
            const locations: AdminLocation[] = adminProfiles
              .filter(p => p.current_lat && p.current_lng)
              .map(p => ({
                user_id: p.id,
                lat: p.current_lat!,
                lng: p.current_lng!,
                display_name: p.display_name,
                full_name: p.full_name,
                photo_url: p.photo_url,
                location_updated_at: p.location_updated_at,
                is_verified: p.is_verified,
                verification_status: p.verification_status,
                email: p.email,
                phone_number: p.phone_number,
                subscription_active: p.subscription_active,
                active_role: p.active_role,
              }));
            setAdminLocations(locations);
          }
        }
      } else {
        setAdminLocations([]);
      }
    } catch (err: any) {
      console.error("Error fetching map data:", err);
      setError("Failed to load map data");
    }
  }, [user, isDriver, isRider, isAdmin, showAdminOnPublicMap]);

  // Initialize map
  useEffect(() => {
    const initMap = async () => {
      try {
        if (!L) {
          const leaflet = await import('leaflet');
          L = leaflet.default;
          
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);

          // Add custom styles for avatar markers
          const style = document.createElement('style');
          style.textContent = `
            .map-avatar-icon {
              background: transparent !important;
              border: none !important;
            }
            .map-avatar-marker img {
              transition: transform 0.2s ease;
            }
            .map-avatar-marker:hover img {
              transform: scale(1.1);
            }
          `;
          document.head.appendChild(style);

          delete (L.Icon.Default.prototype as any)._getIconUrl;
          L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
          });
        }

        if (!mapRef.current || mapInstanceRef.current) return;

        const centerLat = 33.7490;
        const centerLng = -84.3880;

        const map = L.map(mapRef.current, {
          center: [centerLat, centerLng],
          zoom: 10,
          zoomControl: true,
          scrollWheelZoom: true,
        });

        // Configurable tile URL with fallback to dark CARTO tiles
        const tileUrl = import.meta.env.VITE_MAP_TILE_URL || 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        
        L.tileLayer(tileUrl, {
          attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OSM</a> · <a href="https://carto.com/attributions" target="_blank">CARTO</a>',
          maxZoom: 19,
        }).addTo(map);

        mapInstanceRef.current = map;
        
        await fetchMapData();
        setLoading(false);
      } catch (err) {
        console.error('Error initializing map:', err);
        setError('Failed to load map');
        setLoading(false);
      }
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Fetch data when role is determined
  useEffect(() => {
    if (userProfile && mapInstanceRef.current) {
      fetchMapData();
    }
  }, [userProfile, fetchMapData]);

  // Helper to handle admin click on user marker
  const handleAdminUserClick = (userData: AllMapUser) => {
    if (!isAdmin) return;
    setSelectedUser(userData);
    setShowUserInfoPanel(true);
  };

  // Update markers
  useEffect(() => {
    if (!mapInstanceRef.current || !L) return;

    // Clear existing markers
    mapInstanceRef.current.eachLayer((layer: any) => {
      if (layer instanceof L.Marker) {
        mapInstanceRef.current.removeLayer(layer);
      }
    });

    userMarkerRef.current = null;

    // ADMIN VIEW: Show users based on filter (online or all with time range)
    if (isAdmin && allMapUsers.length > 0) {
      // Helper to get time filter cutoff for admin
      const getAdminTimeFilterCutoff = (): Date | null => {
        const now = Date.now();
        switch (adminTimeRange) {
          case 'all': return null; // No time filter
          case 'month': return new Date(now - 30 * 24 * 60 * 60 * 1000);
          case 'week': return new Date(now - 7 * 24 * 60 * 60 * 1000);
          case '72h': return new Date(now - 72 * 60 * 60 * 1000);
          case '24h': return new Date(now - 24 * 60 * 60 * 1000);
          case '5h': return new Date(now - 5 * 60 * 60 * 1000);
          case '1h': return new Date(now - 60 * 60 * 1000);
          default: return null;
        }
      };

      // Filter users based on userFilter setting
      const usersToShow = userFilter === 'online' 
        ? allMapUsers.filter(u => {
            const status = getOnlineStatus(u.location_updated_at || null);
            return status.isOnline || !status.isOffline; // Within 60 minutes
          })
        : allMapUsers.filter(u => {
            // Apply time range filter for "All Users" mode
            const cutoff = getAdminTimeFilterCutoff();
            if (!cutoff) return true; // "all" time - show everyone
            if (!u.location_updated_at) return false;
            return new Date(u.location_updated_at) >= cutoff;
          });

      usersToShow.forEach((mapUser) => {
        if (!mapUser.current_lat || !mapUser.current_lng) return;

        const jittered = getJitteredCoords(mapUser.current_lat, mapUser.current_lng, mapUser.id);
        const name = mapUser.full_name || mapUser.display_name || "User";
        const isPremium = mapUser.subscription_active;
        const isOwnUser = mapUser.id === user?.id;
        
        // Determine variant using helper
        const variant = getMarkerVariant(mapUser);

        const icon = createAvatarDivIcon(L, mapUser.photo_url, variant, mapUser.location_updated_at, true);

        // Admin sees full role labels for all users
        const roleLabel = getRoleLabel(mapUser, true);

        const marker = L.marker([jittered.lat, jittered.lng], { icon })
          .addTo(mapInstanceRef.current)
          .bindPopup(`
            <div class="p-3 min-w-[200px]">
              <div class="flex items-center gap-2 mb-2">
                <span class="font-semibold">${name}</span>
                ${isPremium ? '<span class="text-yellow-500">👑</span>' : ''}
                ${isOwnUser ? '<span class="text-xs text-gray-500">(You)</span>' : ''}
              </div>
              <p class="text-xs text-gray-600 mb-1"><strong>Role:</strong> ${roleLabel}</p>
              <p class="text-xs text-gray-600 mb-2"><strong>Status:</strong> ${mapUser.is_verified ? '✅ Verified' : '⏳ Pending'}</p>
              <button 
                onclick="window.dispatchEvent(new CustomEvent('admin-user-click', { detail: '${mapUser.id}' }))"
                class="text-xs text-blue-500 hover:underline cursor-pointer bg-transparent border-none p-0"
              >
                View Full Details →
              </button>
            </div>
          `);

        if (isOwnUser) {
          userMarkerRef.current = marker;
        }
      });

      // Add event listener for admin user clicks
      const handleCustomClick = (e: CustomEvent) => {
        const userId = e.detail;
        const userData = allMapUsers.find(u => u.id === userId);
        if (userData) {
          handleAdminUserClick(userData);
        }
      };
      window.addEventListener('admin-user-click', handleCustomClick as EventListener);
      
      return () => {
        window.removeEventListener('admin-user-click', handleCustomClick as EventListener);
      };
    }

    // NON-ADMIN: Show users based on filter (online or all)
    if (!isAdmin) {
      const usersToShow = userFilter === 'online' ? onlineUsers : allUsersForNonAdmin;
      
      if (usersToShow.length > 0) {
        usersToShow.forEach((mapUser) => {
          if (!mapUser.current_lat || !mapUser.current_lng) return;

          const jittered = getJitteredCoords(mapUser.current_lat, mapUser.current_lng, mapUser.id);
          const name = mapUser.full_name || mapUser.display_name || "User";
          const isPremium = mapUser.subscription_active;
          const isOwnUser = mapUser.id === user?.id;
          
          // Determine variant using helper
          const variant = getMarkerVariant(mapUser);

          // Use subtle status styling for non-admins (no timestamps shown)
          const icon = createAvatarDivIcon(L, mapUser.photo_url, variant, mapUser.location_updated_at, false);

          // Non-admins see "Admin" for admin users, full role labels for others
          const roleLabel = getRoleLabel(mapUser, false);
          const carInfo = mapUser.isDriver 
            ? [mapUser.car_year, mapUser.car_make, mapUser.car_model].filter(Boolean).join(" ")
            : '';

          // For non-admins: simple popup WITHOUT roles, WITHOUT crown icons
          // Hide roles from drivers and riders per user requirement
          const marker = L.marker([jittered.lat, jittered.lng], { icon })
            .addTo(mapInstanceRef.current)
            .bindPopup(`
              <div class="p-3 min-w-[200px]">
                <div class="flex items-center gap-2 mb-2">
                  <span class="font-semibold">${name}</span>
                  ${isOwnUser ? '<span class="text-xs text-gray-500">(You)</span>' : ''}
                </div>
                ${carInfo ? `<p class="text-xs text-gray-600 mb-1"><strong>Vehicle:</strong> ${carInfo}</p>` : ''}
                <p class="text-xs text-gray-400 italic">📍 Approximate location</p>
              </div>
            `);

          if (isOwnUser) {
            userMarkerRef.current = marker;
          }
        });
      }
    }

    // NON-ADMIN: Add admin crown markers when visible to public
    if (!isAdmin && showAdminOnPublicMap) {
      adminLocations.forEach((admin) => {
        const jittered = getJitteredCoords(admin.lat, admin.lng, admin.user_id);
        const name = admin.full_name || admin.display_name || "Admin";

        const icon = createAvatarDivIcon(L, admin.photo_url, 'admin', admin.location_updated_at, false);

        // Non-admins viewing admin markers: hide role and crown per user requirement
        L.marker([jittered.lat, jittered.lng], { icon })
          .addTo(mapInstanceRef.current)
          .bindPopup(`
            <div class="p-3 min-w-[180px]">
              <div class="mb-2">
                <span class="font-semibold">${name}</span>
              </div>
              <p class="text-xs text-gray-400 italic">📍 Approximate location</p>
            </div>
          `);
      });
    }
  }, [drivers, user, isDriver, isRider, isAdmin, adminLocations, showAdminOnPublicMap, allMapUsers, onlineUsers, userFilter, allUsersForNonAdmin, adminTimeRange]);

  // Refresh location
  const handleRefreshLocation = async () => {
    if (!user) return;
    setRefreshing(true);

    const consent = localStorage.getItem("location_consent");
    if (consent !== "granted") {
      setShowLocationDialog(true);
      setRefreshing(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const approxLat = Math.round(latitude * 100) / 100;
        const approxLng = Math.round(longitude * 100) / 100;

        try {
          await supabase
            .from("profiles")
            .update({
              current_lat: latitude,
              current_lng: longitude,
              location_updated_at: new Date().toISOString(),
            })
            .eq("id", user.id);

          if (isDriver) {
            await supabase
              .from("driver_status")
              .upsert({
                user_id: user.id,
                approx_geo: { lat: approxLat, lng: approxLng },
                updated_at: new Date().toISOString(),
              }, { onConflict: 'user_id' });
          }

          setUserLocation({ lat: approxLat, lng: approxLng });
          await fetchMapData();
          
          toast({
            title: "Location updated",
            description: "Your map pin has been refreshed.",
          });
        } catch (error) {
          console.error("Error updating location:", error);
          toast({
            title: "Error",
            description: "Failed to update location.",
            variant: "destructive",
          });
        } finally {
          setRefreshing(false);
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        toast({
          title: "Location unavailable",
          description: "Could not get your current location.",
          variant: "destructive",
        });
        setRefreshing(false);
      }
    );
  };

  // Center on user
  const handleCenterOnMe = () => {
    if (!mapInstanceRef.current) return;

    // Admin view: find self in allMapUsers
    if (isAdmin && allMapUsers.length > 0) {
      const ownUser = allMapUsers.find(u => u.id === user?.id);
      if (ownUser && ownUser.current_lat && ownUser.current_lng) {
        const jittered = getJitteredCoords(ownUser.current_lat, ownUser.current_lng, ownUser.id);
        mapInstanceRef.current.setView([jittered.lat, jittered.lng], 13, { animate: true });
        if (userMarkerRef.current) {
          userMarkerRef.current.openPopup();
        }
        return;
      }
    }

    // Non-admin: find self in onlineUsers
    if (!isAdmin && onlineUsers.length > 0) {
      const ownUser = onlineUsers.find(u => u.id === user?.id);
      if (ownUser && ownUser.current_lat && ownUser.current_lng) {
        const jittered = getJitteredCoords(ownUser.current_lat, ownUser.current_lng, ownUser.id);
        mapInstanceRef.current.setView([jittered.lat, jittered.lng], 13, { animate: true });
        if (userMarkerRef.current) {
          userMarkerRef.current.openPopup();
        }
        return;
      }
    }

    if (userLocation) {
      mapInstanceRef.current.setView([userLocation.lat, userLocation.lng], 13, { animate: true });
      return;
    }

    toast({
      title: "Location not found",
      description: "Update your pin to see yourself on the map.",
    });
  };

  // Refresh map data
  const handleRefreshData = async () => {
    setRefreshing(true);
    await fetchMapData();
    setRefreshing(false);
    const count = isAdmin ? allMapUsers.length : onlineUsers.length;
    toast({
      title: "Map refreshed",
      description: `Showing ${count} user${count !== 1 ? 's' : ''} on the map.`,
    });
  };

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-[400px] text-muted-foreground">
          {error}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={className}>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapPin className="h-5 w-5 text-primary" />
                Live Community Map
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {isAdmin ? "Admin view - all users and trips" : "See online users and trip requests in your community"}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshLocation}
                disabled={refreshing}
              >
                <Navigation className="h-4 w-4 mr-1" />
                Update My Pin
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefreshData}
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
          
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
            {/* User filter: All Users vs Online Users */}
            <div className="flex items-center rounded-full border border-border overflow-hidden">
              <button
                onClick={() => setUserFilter('online')}
                className={`px-3 py-1 text-xs transition-colors ${
                  userFilter === 'online'
                    ? 'bg-emerald-500/20 text-emerald-400 border-r border-border'
                    : 'bg-transparent text-muted-foreground hover:bg-muted/20 border-r border-border'
                }`}
              >
                Online ({isAdmin ? allMapUsers.filter(u => {
                  const status = getOnlineStatus(u.location_updated_at || null);
                  return status.isOnline || !status.isOffline;
                }).length : onlineUsers.length})
              </button>
              <button
                onClick={() => setUserFilter('all')}
                className={`px-3 py-1 text-xs transition-colors ${
                  userFilter === 'all'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-transparent text-muted-foreground hover:bg-muted/20'
                }`}
              >
                All Users ({isAdmin ? (() => {
                  // Count users based on current time range filter for admin
                  const getAdminTimeFilterCutoff = (): Date | null => {
                    const now = Date.now();
                    switch (adminTimeRange) {
                      case 'all': return null;
                      case 'month': return new Date(now - 30 * 24 * 60 * 60 * 1000);
                      case 'week': return new Date(now - 7 * 24 * 60 * 60 * 1000);
                      case '72h': return new Date(now - 72 * 60 * 60 * 1000);
                      case '24h': return new Date(now - 24 * 60 * 60 * 1000);
                      case '5h': return new Date(now - 5 * 60 * 60 * 1000);
                      case '1h': return new Date(now - 60 * 60 * 1000);
                      default: return null;
                    }
                  };
                  const cutoff = getAdminTimeFilterCutoff();
                  if (!cutoff) return allMapUsers.length;
                  return allMapUsers.filter(u => u.location_updated_at && new Date(u.location_updated_at) >= cutoff).length;
                })() : allUsersForNonAdmin.length})
              </button>
            </div>

            {/* Admin time range dropdown - only shown when "All Users" filter is active */}
            {isAdmin && userFilter === 'all' && (
              <Select value={adminTimeRange} onValueChange={(v) => setAdminTimeRange(v as any)}>
                <SelectTrigger className="w-[140px] h-8 text-xs border-border">
                  <Clock className="h-3 w-3 mr-1" />
                  <SelectValue placeholder="Time range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">Past 1 hour</SelectItem>
                  <SelectItem value="5h">Past 5 hours</SelectItem>
                  <SelectItem value="24h">Past 24 hours</SelectItem>
                  <SelectItem value="72h">Past 72 hours</SelectItem>
                  <SelectItem value="week">Past week</SelectItem>
                  <SelectItem value="month">Past month</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            )}
            
            {/* Visibility toggle for all users */}
            <button
              onClick={() => handleToggleVisibility(!isMapVisible)}
              className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-colors ${
                isMapVisible 
                  ? 'border-emerald-500/50 bg-emerald-500/10' 
                  : 'border-muted-foreground/30 bg-muted/20'
              }`}
            >
              {isMapVisible ? (
                <>
                  <Eye className="h-4 w-4 text-emerald-400" />
                  <span className="text-emerald-400">Visible</span>
                </>
              ) : (
                <>
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Invisible</span>
                </>
              )}
            </button>
            
            {/* Admin visibility toggle */}
            {isAdmin && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-yellow-500/30 bg-yellow-500/10">
                <img src="/assets/map/admin-crown-icon.png" alt="Admin" className="w-5 h-5" />
                <Label htmlFor="admin-visibility" className="text-xs cursor-pointer">
                  Show to users
                </Label>
                <Switch
                  id="admin-visibility"
                  checked={showAdminOnPublicMap}
                  onCheckedChange={handleToggleAdminVisibility}
                  className="scale-75"
                />
              </div>
            )}

            {/* Admin: Clear own visibility history */}
            {isAdmin && (
              <button
                onClick={handleClearOwnHistory}
                className="flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-colors text-xs text-amber-400"
                title="Hide your historical map locations from non-admin users"
              >
                <EyeOff className="h-3 w-3" />
                Clear my history
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="relative pt-0">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          {/* Map wrapper with disclaimer overlay - styled as a polished card */}
          <div className="live-map-card">
            <div 
              ref={mapRef} 
              className="h-[400px] w-full"
              role="application"
              aria-label="Live community map showing trip requests"
            />
            
            {/* Disclaimer overlay - covers Leaflet/OSM logo area */}
            <div className="cr-map-disclaimer">
              Cash Ridez Connect map always uses approximate locations, not precise locations. Base map data © OpenStreetMap contributors.
            </div>
            
            {/* Show Me on Map button - top right */}
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-3 right-3 z-[9999] h-10 w-10 rounded-full shadow-lg"
              onClick={handleCenterOnMe}
              title="Show Me on the Map"
            >
              <Crosshair className="h-5 w-5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <LocationConsentDialog
        open={showLocationDialog}
        onOpenChange={setShowLocationDialog}
        userId={user?.id || ""}
        onSuccess={() => {
          fetchMapData();
        }}
      />

      {/* Admin user info panel */}
      {isAdmin && (
        <AdminMapUserInfoPanel
          user={selectedUser}
          open={showUserInfoPanel}
          onOpenChange={setShowUserInfoPanel}
          onHistoryCleared={fetchMapData}
        />
      )}
    </>
  );
}
