// Map and distance configuration
export const MAP_CONFIG = {
  // Distance threshold for nearby matching (miles)
  NEARBY_RADIUS_MI: 25,
  
  // Privacy jitter for map markers (miles)
  MAP_JITTER_MI: 0.35,
  
  // Map tile provider ('leaflet-osm' | 'maptiler')
  MAP_TILE_PROVIDER: 'leaflet-osm' as const,
  
  // MapTiler API key (optional, for paid features)
  MAPTILER_API_KEY: import.meta.env.VITE_MAPTILER_API_KEY || '',
  
  // Enable paid map features (MapTiler)
  USE_PAID_MAP: false,
} as const;

// Notification debounce (minutes)
export const NOTIFICATION_CONFIG = {
  DEBOUNCE_MINUTES: 30,
} as const;
