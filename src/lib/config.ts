// Map and distance configuration
export const MAP_CONFIG = {
  // Distance threshold for nearby matching (miles)
  NEARBY_RADIUS_MI: 25,
  
  // Privacy jitter for map markers (miles)
  MAP_JITTER_MI: 0.35,
  
  // Map tile provider ('leaflet-osm' | 'mapbox')
  MAP_TILE_PROVIDER: 'leaflet-osm' as const,
  
  // Enable paid map features (Mapbox)
  USE_PAID_MAP: false,
} as const;

// Notification debounce (minutes)
export const NOTIFICATION_CONFIG = {
  DEBOUNCE_MINUTES: 30,
} as const;

// Membership pricing — single source of truth
export const MEMBERSHIP_PRICE_CENTS = 199;
export const MEMBERSHIP_PRICE_DISPLAY = "$1.99";
export const MEMBERSHIP_PRICE_LABEL = "$1.99/month";

// Live map: maximum number of most-recently-active users shown
export const LIVE_MAP_MAX_USERS = 100;
