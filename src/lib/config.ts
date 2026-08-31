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

// Live map: how many of the most recently active users get the green ring
export const LIVE_MAP_ONLINE_RING_COUNT = 30;


// 3D car hero model (temporary CDN URL; swap to /models/cashridez-car.glb later)
export const CAR_MODEL_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_2zkin0wWd1fqvOlkf1ZVTn9Up98/hf_20260831_042212_b3311636-3259-4c6d-81ed-3aa4427dbea4.glb";

// Roof sign wordmark text (rendered on the 3D car topper)
export const ROOF_SIGN_TEXT = "CASH";

// Roof sign wordmark color (bright lime green, like a lit taxi display)
export const ROOF_SIGN_COLOR = "#4ADE80";
