/**
 * CashRidez Fare Estimator v3 - Georgia/Metro Atlanta Specific
 * 
 * Matches FareEstimate.com logic with realistic Atlanta rideshare rates.
 * All calculations are range-based for transparency.
 * 
 * GEOGRAPHIC SCOPE:
 * - Primary: Georgia / Metro Atlanta (specific rates)
 * - Fallback: Generic US rates for out-of-state trips
 */

import { haversineMiles } from '@/lib/zipDistance';

// ============================================================================
// GEORGIA BOUNDING BOX - for geographic detection
// ============================================================================
const GEORGIA_BOUNDS = {
  north: 35.0,  // Northern Georgia border
  south: 30.35, // Southern Georgia border (Florida line)
  east: -80.75, // Eastern Georgia (Atlantic coast)
  west: -85.61, // Western Georgia (Alabama line)
};

// Metro Atlanta approximate center and radius
const METRO_ATLANTA = {
  centerLat: 33.749,
  centerLng: -84.388,
  radiusMiles: 50, // Metro Atlanta radius
};

// ============================================================================
// FARE CONFIGURATION - Georgia/Metro Atlanta Market Rates
// Based on FareEstimate.com patterns for Atlanta market
// ============================================================================

export const GEORGIA_FARE_CONFIG = {
  // Base fare range (Atlanta market)
  BASE_FARE_LOW: 1.50,
  BASE_FARE_HIGH: 2.50,
  
  // Per-mile rates - realistic for Atlanta rideshare (FareEstimate range)
  PER_MILE_LOW: 0.90,
  PER_MILE_HIGH: 1.35,
  
  // Per-minute rates (time component)
  PER_MINUTE_LOW: 0.20,
  PER_MINUTE_HIGH: 0.35,
  
  // Booking/service fees (matches typical rideshare)
  FEES_LOW: 2.50,
  FEES_HIGH: 3.75,
  
  // Minimum fare floor
  MINIMUM_FARE_LOW: 7.00,
  MINIMUM_FARE_HIGH: 12.00,
  
  // Surge/demand multiplier range (Atlanta varies by time/demand)
  SURGE_LOW: 1.00,
  SURGE_HIGH: 1.75,
  
  // Driver payout range (% of rider fare kept by driver)
  // Traditional rideshare: drivers keep 40-65% after platform fees
  DRIVER_PAYOUT_LOW: 0.40,
  DRIVER_PAYOUT_HIGH: 0.65,
  
  // Road factor (haversine → road distance multiplier)
  ROAD_FACTOR_LOW: 1.20,
  ROAD_FACTOR_HIGH: 1.40,
  
  // Average speed assumptions (mph) for duration estimation
  SPEED_URBAN: 25,  // Atlanta city traffic
  SPEED_SUBURBAN: 35, // Suburbs
  SPEED_HIGHWAY: 55,  // I-285, I-75, I-85
};

// Generic US fallback rates (slightly higher variance)
export const GENERIC_US_FARE_CONFIG = {
  BASE_FARE_LOW: 2.00,
  BASE_FARE_HIGH: 3.50,
  PER_MILE_LOW: 1.00,
  PER_MILE_HIGH: 1.75,
  PER_MINUTE_LOW: 0.18,
  PER_MINUTE_HIGH: 0.40,
  FEES_LOW: 2.00,
  FEES_HIGH: 5.00,
  MINIMUM_FARE_LOW: 8.00,
  MINIMUM_FARE_HIGH: 15.00,
  SURGE_LOW: 1.00,
  SURGE_HIGH: 2.00,
  DRIVER_PAYOUT_LOW: 0.35,
  DRIVER_PAYOUT_HIGH: 0.60,
  ROAD_FACTOR_LOW: 1.20,
  ROAD_FACTOR_HIGH: 1.45,
  SPEED_URBAN: 22,
  SPEED_SUBURBAN: 32,
  SPEED_HIGHWAY: 55,
};

// ============================================================================
// GEOGRAPHIC DETECTION
// ============================================================================

export interface GeographicContext {
  isGeorgia: boolean;
  isMetroAtlanta: boolean;
  config: typeof GEORGIA_FARE_CONFIG;
  region: 'georgia' | 'us_generic';
}

/**
 * Determine if coordinates are within Georgia and which config to use
 */
export function getGeographicContext(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): GeographicContext {
  const isPickupInGeorgia = isInGeorgia(lat1, lng1);
  const isDropoffInGeorgia = isInGeorgia(lat2, lng2);
  
  // Both must be in Georgia for Georgia rates
  const isGeorgia = isPickupInGeorgia && isDropoffInGeorgia;
  
  // Check if trip is in Metro Atlanta
  const isMetroAtlanta = isGeorgia && (
    isNearMetroAtlanta(lat1, lng1) || isNearMetroAtlanta(lat2, lng2)
  );
  
  return {
    isGeorgia,
    isMetroAtlanta,
    config: isGeorgia ? GEORGIA_FARE_CONFIG : GENERIC_US_FARE_CONFIG,
    region: isGeorgia ? 'georgia' : 'us_generic',
  };
}

function isInGeorgia(lat: number, lng: number): boolean {
  return (
    lat >= GEORGIA_BOUNDS.south &&
    lat <= GEORGIA_BOUNDS.north &&
    lng >= GEORGIA_BOUNDS.west &&
    lng <= GEORGIA_BOUNDS.east
  );
}

function isNearMetroAtlanta(lat: number, lng: number): boolean {
  const distance = haversineMiles(
    lat,
    lng,
    METRO_ATLANTA.centerLat,
    METRO_ATLANTA.centerLng
  );
  return distance <= METRO_ATLANTA.radiusMiles;
}

// ============================================================================
// TRIP METRICS CALCULATION
// ============================================================================

export interface TripMetrics {
  distanceMiles: number;
  durationMinutes: number;
  distanceText: string;
  durationText: string;
  source: 'coordinates' | 'fallback';
  geographic: GeographicContext;
}

/**
 * Calculate trip metrics from coordinates
 * Uses haversine with road factor adjustment (approximates routing)
 */
export function getTripMetricsFromCoords(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number
): TripMetrics | null {
  // Validate coordinates
  if (!isValidCoordinate(pickupLat, pickupLng) || !isValidCoordinate(dropoffLat, dropoffLng)) {
    return null;
  }
  
  // Get geographic context (Georgia vs generic)
  const geographic = getGeographicContext(pickupLat, pickupLng, dropoffLat, dropoffLng);
  const config = geographic.config;
  
  // Calculate straight-line distance
  const straightLineDistance = haversineMiles(pickupLat, pickupLng, dropoffLat, dropoffLng);
  
  if (straightLineDistance <= 0) return null;
  
  // Apply road factor (roads are longer than straight-line)
  const avgRoadFactor = (config.ROAD_FACTOR_LOW + config.ROAD_FACTOR_HIGH) / 2;
  const distanceMiles = Math.round(straightLineDistance * avgRoadFactor * 10) / 10;
  
  // Estimate duration based on distance and trip type
  const durationMinutes = estimateDuration(distanceMiles, geographic);
  
  return {
    distanceMiles,
    durationMinutes,
    distanceText: `${distanceMiles.toFixed(1)} mi`,
    durationText: `${durationMinutes} min`,
    source: 'coordinates',
    geographic,
  };
}

/**
 * Estimate trip duration based on distance and geography
 * Short trips = urban speeds, long trips = highway speeds
 */
function estimateDuration(distanceMiles: number, geographic: GeographicContext): number {
  const config = geographic.config;
  
  let avgSpeed: number;
  
  if (distanceMiles <= 5) {
    // Short urban trip
    avgSpeed = config.SPEED_URBAN;
  } else if (distanceMiles <= 15) {
    // Suburban trip (mix of urban and suburban)
    avgSpeed = (config.SPEED_URBAN + config.SPEED_SUBURBAN) / 2;
  } else if (distanceMiles <= 30) {
    // Mixed suburban/highway
    avgSpeed = (config.SPEED_SUBURBAN + config.SPEED_HIGHWAY) / 2;
  } else {
    // Long distance - mostly highway
    avgSpeed = config.SPEED_HIGHWAY * 0.85; // Account for traffic/stops
  }
  
  // Calculate base duration
  const baseDuration = (distanceMiles / avgSpeed) * 60;
  
  // Add buffer for traffic, stops, pickup/dropoff (2-5 min)
  const buffer = Math.min(5, Math.max(2, distanceMiles * 0.1));
  
  return Math.round(baseDuration + buffer);
}

/**
 * Validate coordinates (not default/mock values)
 */
function isValidCoordinate(lat: number, lng: number): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (isNaN(lat) || isNaN(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  // Mock NYC coordinates
  if (lat === 40.7128 && lng === -74.006) return false;
  // Valid US range
  if (lat < 24 || lat > 50 || lng < -130 || lng > -65) return false;
  return true;
}

// ============================================================================
// FARE RANGE ESTIMATION - FareEstimate.com Style
// ============================================================================

export interface FareRange {
  low: number;
  high: number;
  best: number; // "Best Price" = lowest realistic estimate
}

export interface TraditionalFareEstimate {
  riderFareRange: FareRange;
  driverPayoutRange: FareRange;
  distanceMiles: number;
  durationMinutes: number;
  region: 'georgia' | 'us_generic';
}

/**
 * Estimate traditional rideshare fare range
 * Matches FareEstimate.com formula structure
 */
export function estimateRideshareFareRange(
  distanceMiles: number,
  durationMinutes: number,
  config: typeof GEORGIA_FARE_CONFIG = GEORGIA_FARE_CONFIG
): TraditionalFareEstimate | null {
  if (!distanceMiles || distanceMiles <= 0) return null;
  
  // Ensure duration is valid
  if (!durationMinutes || durationMinutes <= 0) {
    // Fallback duration estimation
    const avgSpeed = (config.SPEED_SUBURBAN + config.SPEED_HIGHWAY) / 2;
    durationMinutes = Math.round((distanceMiles / avgSpeed) * 60) + 3;
  }
  
  // ========== LOW FARE CALCULATION (Best Price) ==========
  // Uses minimum rates, no surge
  const fareLowRaw = (
    config.BASE_FARE_LOW +
    (distanceMiles * config.PER_MILE_LOW) +
    (durationMinutes * config.PER_MINUTE_LOW) +
    config.FEES_LOW
  ) * config.SURGE_LOW;
  
  // Apply minimum fare floor
  const fareLow = Math.max(config.MINIMUM_FARE_LOW, fareLowRaw);
  
  // ========== HIGH FARE CALCULATION ==========
  // Uses maximum rates with surge
  const fareHighRaw = (
    config.BASE_FARE_HIGH +
    (distanceMiles * config.PER_MILE_HIGH) +
    (durationMinutes * config.PER_MINUTE_HIGH) +
    config.FEES_HIGH
  ) * config.SURGE_HIGH;
  
  // Apply minimum fare floor
  const fareHigh = Math.max(config.MINIMUM_FARE_HIGH, fareHighRaw);
  
  // "Best Price" = lowest realistic estimate (matches FareEstimate.com)
  const bestPrice = fareLow;
  
  // ========== DRIVER PAYOUT CALCULATION ==========
  // Drivers keep 40-65% of rider fare
  const driverPayoutLow = fareLow * config.DRIVER_PAYOUT_LOW;
  const driverPayoutHigh = fareHigh * config.DRIVER_PAYOUT_HIGH;
  const driverPayoutBest = fareLow * ((config.DRIVER_PAYOUT_LOW + config.DRIVER_PAYOUT_HIGH) / 2);
  
  return {
    riderFareRange: {
      low: round2(fareLow),
      high: round2(fareHigh),
      best: round2(bestPrice),
    },
    driverPayoutRange: {
      low: round2(driverPayoutLow),
      high: round2(driverPayoutHigh),
      best: round2(driverPayoutBest),
    },
    distanceMiles,
    durationMinutes,
    region: config === GEORGIA_FARE_CONFIG ? 'georgia' : 'us_generic',
  };
}

// ============================================================================
// RIDER SAVINGS CALCULATION
// ============================================================================

export interface RiderSavingsResult {
  traditionalFareRange: FareRange;
  bestPrice: number;
  cashRidezOffer: number;
  savingsRange: FareRange;
  hasSavings: boolean;
  savingsLabel: string;
}

/**
 * Calculate rider savings compared to traditional rideshare
 */
export function calculateRiderSavingsRange(
  distanceMiles: number,
  durationMinutes: number,
  cashRidezOffer: number,
  config: typeof GEORGIA_FARE_CONFIG = GEORGIA_FARE_CONFIG
): RiderSavingsResult | null {
  if (!cashRidezOffer || cashRidezOffer <= 0) return null;
  
  const estimate = estimateRideshareFareRange(distanceMiles, durationMinutes, config);
  if (!estimate) return null;
  
  const { riderFareRange } = estimate;
  
  // Savings = traditional fare - CashRidez offer
  const savingsLow = Math.max(0, riderFareRange.low - cashRidezOffer);
  const savingsHigh = Math.max(0, riderFareRange.high - cashRidezOffer);
  const savingsBest = Math.max(0, riderFareRange.best - cashRidezOffer);
  
  const hasSavings = savingsHigh > 0;
  
  // Generate human-readable label
  let savingsLabel: string;
  if (savingsLow > 0 && savingsHigh > 0) {
    savingsLabel = `You may save $${Math.round(savingsLow)}–$${Math.round(savingsHigh)}`;
  } else if (savingsHigh > 0) {
    savingsLabel = `You may save up to $${Math.round(savingsHigh)}`;
  } else if (cashRidezOffer <= riderFareRange.best) {
    savingsLabel = 'Great price! Below typical rideshare best price.';
  } else {
    savingsLabel = 'Competitive with typical rideshare pricing.';
  }
  
  return {
    traditionalFareRange: riderFareRange,
    bestPrice: riderFareRange.best,
    cashRidezOffer,
    savingsRange: {
      low: round2(savingsLow),
      high: round2(savingsHigh),
      best: round2(savingsBest),
    },
    hasSavings,
    savingsLabel,
  };
}

// ============================================================================
// DRIVER EARNINGS CALCULATION
// ============================================================================

export interface DriverEarningsResult {
  traditionalFareRange: FareRange;
  traditionalPayoutRange: FareRange;
  cashRidezEarnings: number;
  extraRange: FareRange;
  hasExtra: boolean;
  extraLabel: string;
}

/**
 * Calculate driver extra earnings on CashRidez vs traditional
 * CashRidez drivers keep 100%, traditional drivers keep 40-65%
 */
export function calculateDriverExtraRange(
  distanceMiles: number,
  durationMinutes: number,
  cashRidezEarnings: number,
  config: typeof GEORGIA_FARE_CONFIG = GEORGIA_FARE_CONFIG
): DriverEarningsResult | null {
  if (!cashRidezEarnings || cashRidezEarnings <= 0) return null;
  
  const estimate = estimateRideshareFareRange(distanceMiles, durationMinutes, config);
  if (!estimate) return null;
  
  const { riderFareRange, driverPayoutRange } = estimate;
  
  // Extra = CashRidez earnings - traditional driver payout
  // extraLow: worst case (CashRidez vs highest traditional payout)
  // extraHigh: best case (CashRidez vs lowest traditional payout)
  const extraLow = cashRidezEarnings - driverPayoutRange.high;
  const extraHigh = cashRidezEarnings - driverPayoutRange.low;
  const extraBest = cashRidezEarnings - driverPayoutRange.best;
  
  const hasExtra = extraLow > 0;
  
  // Generate human-readable label
  let extraLabel: string;
  if (extraLow > 0 && extraHigh > 0) {
    extraLabel = `You could earn $${Math.round(extraLow)}–$${Math.round(extraHigh)} more`;
  } else if (extraHigh > 0) {
    extraLabel = `You could earn up to $${Math.round(extraHigh)} more`;
  } else if (cashRidezEarnings >= driverPayoutRange.high) {
    extraLabel = 'Great earnings! Above typical rideshare driver payout.';
  } else {
    extraLabel = 'Competitive with traditional rideshare earnings.';
  }
  
  return {
    traditionalFareRange: riderFareRange,
    traditionalPayoutRange: driverPayoutRange,
    cashRidezEarnings,
    extraRange: {
      low: round2(extraLow),
      high: round2(extraHigh),
      best: round2(extraBest),
    },
    hasExtra,
    extraLabel,
  };
}

// ============================================================================
// COMPLETE TRIP CALCULATION (unified interface)
// ============================================================================

export interface TripFareCalculation {
  // Trip metrics
  distanceMiles: number;
  durationMinutes: number;
  region: 'georgia' | 'us_generic';
  metricsSource: 'coordinates' | 'fallback';
  
  // Traditional rideshare estimates (ranges)
  traditionalFareRange: FareRange;
  traditionalDriverPayoutRange: FareRange;
  bestPrice: number;
  
  // CashRidez amounts
  cashRidezPrice: number;
  
  // Comparison results (ranges)
  riderSavingsRange: FareRange;
  driverExtraRange: FareRange;
  
  // Flags
  hasSavings: boolean;
  hasExtra: boolean;
  
  // Human-readable labels
  riderSavingsLabel: string;
  driverExtraLabel: string;
}

/**
 * Calculate all fare comparisons for a trip
 * This is the main function to use for complete calculations
 */
export function calculateTripFares(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
  cashRidezPrice: number,
  etaMinutes?: number
): TripFareCalculation | null {
  if (!cashRidezPrice || cashRidezPrice <= 0) return null;
  
  // Get trip metrics from coordinates
  const metrics = getTripMetricsFromCoords(pickupLat, pickupLng, dropoffLat, dropoffLng);
  
  if (!metrics) return null;
  
  const distanceMiles = metrics.distanceMiles;
  const durationMinutes = etaMinutes && etaMinutes > 0 ? etaMinutes : metrics.durationMinutes;
  const config = metrics.geographic.config;
  
  // Get fare estimate
  const estimate = estimateRideshareFareRange(distanceMiles, durationMinutes, config);
  if (!estimate) return null;
  
  // Calculate rider savings
  const savingsResult = calculateRiderSavingsRange(distanceMiles, durationMinutes, cashRidezPrice, config);
  
  // Calculate driver extra
  const extraResult = calculateDriverExtraRange(distanceMiles, durationMinutes, cashRidezPrice, config);
  
  return {
    distanceMiles,
    durationMinutes,
    region: estimate.region,
    metricsSource: metrics.source,
    traditionalFareRange: estimate.riderFareRange,
    traditionalDriverPayoutRange: estimate.driverPayoutRange,
    bestPrice: estimate.riderFareRange.best,
    cashRidezPrice,
    riderSavingsRange: savingsResult?.savingsRange || { low: 0, high: 0, best: 0 },
    driverExtraRange: extraResult?.extraRange || { low: 0, high: 0, best: 0 },
    hasSavings: savingsResult?.hasSavings || false,
    hasExtra: extraResult?.hasExtra || false,
    riderSavingsLabel: savingsResult?.savingsLabel || 'Estimate unavailable',
    driverExtraLabel: extraResult?.extraLabel || 'Estimate unavailable',
  };
}

// ============================================================================
// LEGACY API COMPATIBILITY
// ============================================================================

export interface CompetitorFareEstimate {
  minFare: number;
  maxFare: number;
  midFare: number;
}

/** @deprecated Use calculateTripFares with coordinates instead */
export function estimateFromMilesOnly(
  distanceMiles: number,
  _pickupTime: Date
): CompetitorFareEstimate {
  const estimate = estimateRideshareFareRange(distanceMiles, 0, GEORGIA_FARE_CONFIG);
  if (!estimate) return { minFare: 0, maxFare: 0, midFare: 0 };
  
  return {
    minFare: estimate.riderFareRange.low,
    maxFare: estimate.riderFareRange.high,
    midFare: estimate.riderFareRange.best,
  };
}

/** @deprecated Use calculateDriverExtraRange instead */
export function estimateCompetitorDriverEarnings(traditionalFare: number): number {
  const avgPayout = (GEORGIA_FARE_CONFIG.DRIVER_PAYOUT_LOW + GEORGIA_FARE_CONFIG.DRIVER_PAYOUT_HIGH) / 2;
  return round2(traditionalFare * avgPayout);
}

/** @deprecated Use calculateRiderSavingsRange instead */
export function calculateRiderSavings(competitorMidFare: number, cashRidezPrice: number): number {
  return round2(competitorMidFare - cashRidezPrice);
}

/** @deprecated Use calculateDriverExtraRange instead */
export function calculateDriverExtra(cashRidezEarnings: number, competitorDriverEarnings: number): number {
  return round2(cashRidezEarnings - competitorDriverEarnings);
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatCurrencyRange(low: number, high: number): string {
  return `$${Math.round(low)}–$${Math.round(high)}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================================
// FARE ESTIMATE CONFIG EXPORT (for components that need it)
// ============================================================================
export const FARE_ESTIMATE_CONFIG = GEORGIA_FARE_CONFIG;

// ============================================================================
// TEST SCENARIOS - Georgia Real-World Trips
// ============================================================================
/**
 * Test these 10 Georgia scenarios to verify calculator accuracy:
 * 
 * 1. SHORT CITY (5 mi, ~15 min) - Midtown → Buckhead
 *    Low:  $1.50 + 5×$0.90 + 15×$0.20 + $2.50 = $11.50
 *    High: ($2.50 + 5×$1.35 + 15×$0.35 + $3.75) × 1.75 = $28.44
 *    Best: $11.50
 *    Driver Low: $11.50 × 0.40 = $4.60
 *    Driver High: $28.44 × 0.65 = $18.49
 * 
 * 2. SUBURBAN (12 mi, ~25 min) - Sandy Springs → Alpharetta
 *    Low:  $1.50 + 12×$0.90 + 25×$0.20 + $2.50 = $20.80
 *    High: ($2.50 + 12×$1.35 + 25×$0.35 + $3.75) × 1.75 = $51.10
 *    Best: $20.80
 * 
 * 3. AIRPORT RUN (15 mi, ~30 min) - Downtown → ATL Airport
 *    Low:  $1.50 + 15×$0.90 + 30×$0.20 + $2.50 = $23.50
 *    High: ($2.50 + 15×$1.35 + 30×$0.35 + $3.75) × 1.75 = $60.81
 *    Best: $23.50
 * 
 * 4. LONG TRIP (49 mi, ~56 min) - Gwinnett → South Atlanta
 *    Low:  $1.50 + 49×$0.90 + 56×$0.20 + $2.50 = $59.30
 *    High: ($2.50 + 49×$1.35 + 56×$0.35 + $3.75) × 1.75 = $167.30
 *    Best: $59.30
 *    >> NOT $32–$43! This was the bug.
 * 
 * 5. LATE NIGHT (8 mi, ~20 min) - Surge applies
 *    Low:  $1.50 + 8×$0.90 + 20×$0.20 + $2.50 = $15.20
 *    High: ($2.50 + 8×$1.35 + 20×$0.35 + $3.75) × 1.75 = $43.75
 * 
 * 6. MORNING RUSH (10 mi, ~35 min) - Traffic-heavy
 *    Low:  $1.50 + 10×$0.90 + 35×$0.20 + $2.50 = $20.00
 *    High: ($2.50 + 10×$1.35 + 35×$0.35 + $3.75) × 1.75 = $55.56
 * 
 * 7. MIDDAY (15 mi, ~25 min) - Low traffic
 *    Low:  $1.50 + 15×$0.90 + 25×$0.20 + $2.50 = $22.50
 *    High: ($2.50 + 15×$1.35 + 25×$0.35 + $3.75) × 1.75 = $57.09
 * 
 * 8. GWINNETT → ATLANTA (25 mi, ~40 min)
 *    Low:  $1.50 + 25×$0.90 + 40×$0.20 + $2.50 = $34.50
 *    High: ($2.50 + 25×$1.35 + 40×$0.35 + $3.75) × 1.75 = $94.06
 * 
 * 9. COBB → ATLANTA (20 mi, ~35 min)
 *    Low:  $1.50 + 20×$0.90 + 35×$0.20 + $2.50 = $29.00
 *    High: ($2.50 + 20×$1.35 + 35×$0.35 + $3.75) × 1.75 = $77.44
 * 
 * 10. SOUTH FULTON → NORTH ATLANTA (35 mi, ~50 min)
 *     Low:  $1.50 + 35×$0.90 + 50×$0.20 + $2.50 = $47.50
 *     High: ($2.50 + 35×$1.35 + 50×$0.35 + $3.75) × 1.75 = $130.81
 * 
 * All scenarios should produce realistic ranges that scale appropriately.
 */
