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
