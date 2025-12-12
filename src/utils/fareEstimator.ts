/**
 * Fare Estimator Utility v2
 * Estimates traditional rideshare fares using realistic range-based formulas.
 * 
 * KEY IMPROVEMENTS:
 * 1. Uses realistic fare ranges ($1.10-$2.10 per mile, not $0.90-$1.40)
 * 2. Driver take-rate is a range (25%-55%), not fixed 65%
 * 3. Includes surge multiplier range (1.0-1.6)
 * 4. Proper minimum fare floor ($7-$12)
 * 5. All outputs are ranges, not single values
 * 
 * FORMULA:
 * fare = (base + miles*per_mile + minutes*per_minute + fees) * surge_multiplier
 */

import { haversineMiles } from '@/lib/zipDistance';

// ============================================================================
// FARE CONFIGURATION - Realistic Georgia/Atlanta market ranges
// ============================================================================
export const FARE_ESTIMATE_CONFIG = {
  // Base fare range
  BASE_FARE_LOW: 1.50,
  BASE_FARE_HIGH: 4.00,
  
  // Per-mile rates - realistic for rideshare
  PER_MILE_LOW: 1.10,
  PER_MILE_HIGH: 2.10,
  
  // Per-minute rates
  PER_MINUTE_LOW: 0.15,
  PER_MINUTE_HIGH: 0.45,
  
  // Booking/service/misc fees range
  FEES_LOW: 2.00,
  FEES_HIGH: 8.00,
  
  // Minimum fare floor range
  MINIMUM_FARE_LOW: 7.00,
  MINIMUM_FARE_HIGH: 12.00,
  
  // Surge/variance multiplier range (default, can be tuned)
  SURGE_LOW: 1.0,
  SURGE_HIGH: 1.6,
  
  // Driver take-rate range (what % of fare driver keeps after platform fees)
  // Traditional rideshare drivers keep 25-55% depending on platform, tips, bonuses
  DRIVER_TAKE_RATE_LOW: 0.25,
  DRIVER_TAKE_RATE_HIGH: 0.55,
  
  // Road factor for haversine fallback (multiply straight-line by this)
  ROAD_FACTOR_LOW: 1.15,
  ROAD_FACTOR_HIGH: 1.35,
  
  // Average speed assumptions for duration estimation (mph)
  AVG_SPEED_LOW: 25, // Urban/traffic
  AVG_SPEED_HIGH: 45, // Highway
};

// ============================================================================
// TRIP METRICS CALCULATION
// ============================================================================

export interface TripMetrics {
  distanceMiles: number;
  durationMinutes: number;
  distanceText: string;
  durationText: string;
  source: 'coordinates' | 'zip' | 'fallback';
}

/**
 * Get trip metrics from coordinates
 * Uses haversine distance with road factor adjustment
 */
export function getTripMetricsFromCoords(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number
): TripMetrics | null {
  // Validate coordinates - check for default/mock values
  if (!isValidCoordinate(pickupLat, pickupLng) || !isValidCoordinate(dropoffLat, dropoffLng)) {
    return null;
  }
  
  // Calculate straight-line distance
  const straightLineDistance = haversineMiles(pickupLat, pickupLng, dropoffLat, dropoffLng);
  
  if (straightLineDistance <= 0) return null;
  
  // Apply road factor (roads are longer than straight-line)
  const avgRoadFactor = (FARE_ESTIMATE_CONFIG.ROAD_FACTOR_LOW + FARE_ESTIMATE_CONFIG.ROAD_FACTOR_HIGH) / 2;
  const distanceMiles = Math.round(straightLineDistance * avgRoadFactor * 10) / 10;
  
  // Estimate duration based on average speed (use mid-point for main estimate)
  const avgSpeed = (FARE_ESTIMATE_CONFIG.AVG_SPEED_LOW + FARE_ESTIMATE_CONFIG.AVG_SPEED_HIGH) / 2;
  const durationMinutes = Math.round((distanceMiles / avgSpeed) * 60);
  
  return {
    distanceMiles,
    durationMinutes,
    distanceText: `${distanceMiles.toFixed(1)} mi`,
    durationText: `${durationMinutes} min`,
    source: 'coordinates',
  };
}

/**
 * Check if coordinates are valid (not default/mock values)
 */
function isValidCoordinate(lat: number, lng: number): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (lat === 0 && lng === 0) return false;
  // Check for the mock NYC coordinates used in CreateRideRequest
  if (lat === 40.7128 && lng === -74.006) return false;
  // Valid Georgia coordinates range roughly: lat 30.5-35, lng -85.5 to -80.5
  // But allow broader range for edge cases
  if (lat < 25 || lat > 50 || lng < -130 || lng > -65) return false;
  return true;
}

// ============================================================================
// FARE RANGE ESTIMATION
// ============================================================================

export interface FareRange {
  low: number;
  high: number;
  mid: number;
}

export interface TraditionalFareEstimate {
  fareRange: FareRange;
  driverEarningsRange: FareRange;
  assumptions: {
    distanceMiles: number;
    durationMinutes: number;
    baseFareRange: string;
    perMileRange: string;
    perMinuteRange: string;
    feesRange: string;
    surgeRange: string;
    driverTakeRateRange: string;
  };
}

/**
 * Estimate traditional rideshare fare range for a trip
 * Returns realistic low/high bounds based on market data
 */
export function estimateRideshareFareRange(
  distanceMiles: number,
  durationMinutes: number
): TraditionalFareEstimate | null {
  if (!distanceMiles || distanceMiles <= 0) return null;
  if (!durationMinutes || durationMinutes <= 0) {
    // Estimate duration from distance using average speed
    const avgSpeed = (FARE_ESTIMATE_CONFIG.AVG_SPEED_LOW + FARE_ESTIMATE_CONFIG.AVG_SPEED_HIGH) / 2;
    durationMinutes = Math.round((distanceMiles / avgSpeed) * 60);
  }
  
  const config = FARE_ESTIMATE_CONFIG;
  
  // Calculate LOW fare estimate (minimum rates, no surge)
  const fareLowRaw = (
    config.BASE_FARE_LOW +
    (distanceMiles * config.PER_MILE_LOW) +
    (durationMinutes * config.PER_MINUTE_LOW) +
    config.FEES_LOW
  ) * config.SURGE_LOW;
  
  // Calculate HIGH fare estimate (maximum rates, with surge)
  const fareHighRaw = (
    config.BASE_FARE_HIGH +
    (distanceMiles * config.PER_MILE_HIGH) +
    (durationMinutes * config.PER_MINUTE_HIGH) +
    config.FEES_HIGH
  ) * config.SURGE_HIGH;
  
  // Apply minimum fare floors
  const fareLow = Math.max(config.MINIMUM_FARE_LOW, Math.round(fareLowRaw * 100) / 100);
  const fareHigh = Math.max(config.MINIMUM_FARE_HIGH, Math.round(fareHighRaw * 100) / 100);
  const fareMid = Math.round(((fareLow + fareHigh) / 2) * 100) / 100;
  
  // Calculate driver earnings range
  // Low end: low fare * low take rate
  // High end: high fare * high take rate
  const driverEarnLow = Math.round((fareLow * config.DRIVER_TAKE_RATE_LOW) * 100) / 100;
  const driverEarnHigh = Math.round((fareHigh * config.DRIVER_TAKE_RATE_HIGH) * 100) / 100;
  const driverEarnMid = Math.round(((driverEarnLow + driverEarnHigh) / 2) * 100) / 100;
  
  return {
    fareRange: { low: fareLow, high: fareHigh, mid: fareMid },
    driverEarningsRange: { low: driverEarnLow, high: driverEarnHigh, mid: driverEarnMid },
    assumptions: {
      distanceMiles,
      durationMinutes,
      baseFareRange: `$${config.BASE_FARE_LOW.toFixed(2)}-$${config.BASE_FARE_HIGH.toFixed(2)}`,
      perMileRange: `$${config.PER_MILE_LOW.toFixed(2)}-$${config.PER_MILE_HIGH.toFixed(2)}/mi`,
      perMinuteRange: `$${config.PER_MINUTE_LOW.toFixed(2)}-$${config.PER_MINUTE_HIGH.toFixed(2)}/min`,
      feesRange: `$${config.FEES_LOW.toFixed(2)}-$${config.FEES_HIGH.toFixed(2)}`,
      surgeRange: `${config.SURGE_LOW}x-${config.SURGE_HIGH}x`,
      driverTakeRateRange: `${config.DRIVER_TAKE_RATE_LOW * 100}%-${config.DRIVER_TAKE_RATE_HIGH * 100}%`,
    },
  };
}

// ============================================================================
// SAVINGS & EARNINGS COMPARISON
// ============================================================================

export interface RiderSavingsResult {
  fareRange: FareRange;
  savingsRange: FareRange;
  cashRidezOffer: number;
  hasSavings: boolean;
  label: string;
}

/**
 * Calculate rider savings compared to traditional rideshare
 * Returns a range of potential savings
 */
export function calculateRiderSavingsRange(
  distanceMiles: number,
  durationMinutes: number,
  cashRidezOffer: number
): RiderSavingsResult | null {
  if (!cashRidezOffer || cashRidezOffer <= 0) return null;
  
  const estimate = estimateRideshareFareRange(distanceMiles, durationMinutes);
  if (!estimate) return null;
  
  // Savings = traditional fare - CashRidez offer
  // savingsLow: what you save if traditional was at its LOW end
  // savingsHigh: what you save if traditional was at its HIGH end
  const savingsLow = Math.max(0, estimate.fareRange.low - cashRidezOffer);
  const savingsHigh = Math.max(0, estimate.fareRange.high - cashRidezOffer);
  const savingsMid = Math.round(((savingsLow + savingsHigh) / 2) * 100) / 100;
  
  const hasSavings = savingsHigh > 0;
  
  let label: string;
  if (savingsLow > 0 && savingsHigh > 0) {
    label = `You may save approx $${savingsLow.toFixed(0)}–$${savingsHigh.toFixed(0)}`;
  } else if (savingsHigh > 0) {
    label = `You may save up to $${savingsHigh.toFixed(0)}`;
  } else {
    const overage = cashRidezOffer - estimate.fareRange.mid;
    label = overage > 0 
      ? `Your offer is $${overage.toFixed(0)} above typical estimate`
      : 'Competitive with typical rideshare';
  }
  
  return {
    fareRange: estimate.fareRange,
    savingsRange: { low: savingsLow, high: savingsHigh, mid: savingsMid },
    cashRidezOffer,
    hasSavings,
    label,
  };
}

export interface DriverEarningsResult {
  traditionalEarningsRange: FareRange;
  traditionalFareRange: FareRange;
  cashRidezEarnings: number;
  extraRange: FareRange;
  hasExtra: boolean;
  label: string;
}

/**
 * Calculate driver extra earnings on CashRidez vs traditional
 * CashRidez drivers keep 100%, traditional drivers keep 25-55%
 */
export function calculateDriverExtraRange(
  distanceMiles: number,
  durationMinutes: number,
  cashRidezEarnings: number
): DriverEarningsResult | null {
  if (!cashRidezEarnings || cashRidezEarnings <= 0) return null;
  
  const estimate = estimateRideshareFareRange(distanceMiles, durationMinutes);
  if (!estimate) return null;
  
  // Extra = CashRidez earnings - traditional driver earnings
  // extraLow: worst case (CashRidez vs highest traditional earning)
  // extraHigh: best case (CashRidez vs lowest traditional earning)
  const extraLow = cashRidezEarnings - estimate.driverEarningsRange.high;
  const extraHigh = cashRidezEarnings - estimate.driverEarningsRange.low;
  const extraMid = Math.round(((extraLow + extraHigh) / 2) * 100) / 100;
  
  const hasExtra = extraLow > 0;
  
  let label: string;
  if (extraLow > 0 && extraHigh > 0) {
    label = `You could earn $${extraLow.toFixed(0)}–$${extraHigh.toFixed(0)} more`;
  } else if (extraHigh > 0) {
    label = `You could earn up to $${extraHigh.toFixed(0)} more`;
  } else {
    label = 'Competitive with traditional rideshare earnings';
  }
  
  return {
    traditionalEarningsRange: estimate.driverEarningsRange,
    traditionalFareRange: estimate.fareRange,
    cashRidezEarnings,
    extraRange: { 
      low: Math.round(extraLow * 100) / 100, 
      high: Math.round(extraHigh * 100) / 100, 
      mid: extraMid 
    },
    hasExtra,
    label,
  };
}

// ============================================================================
// COMPLETE TRIP CALCULATION (unified interface)
// ============================================================================

export interface TripFareCalculation {
  // Trip metrics
  distanceMiles: number;
  durationMinutes: number;
  metricsSource: 'coordinates' | 'zip' | 'fallback';
  
  // Traditional rideshare estimates (ranges)
  traditionalFareRange: FareRange;
  traditionalDriverEarningsRange: FareRange;
  
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
 * Calculate all fare comparisons for a trip using coordinates
 * This is the main function to use for complete calculations
 */
export function calculateTripFares(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
  cashRidezPrice: number,
  etaMinutes?: number // Optional override for duration
): TripFareCalculation | null {
  // Validate price
  if (!cashRidezPrice || cashRidezPrice <= 0) return null;
  
  // Get trip metrics from coordinates
  const metrics = getTripMetricsFromCoords(pickupLat, pickupLng, dropoffLat, dropoffLng);
  
  if (!metrics) {
    // Coordinates invalid - cannot calculate
    return null;
  }
  
  const distanceMiles = metrics.distanceMiles;
  const durationMinutes = etaMinutes && etaMinutes > 0 ? etaMinutes : metrics.durationMinutes;
  
  // Get fare estimate
  const estimate = estimateRideshareFareRange(distanceMiles, durationMinutes);
  if (!estimate) return null;
  
  // Calculate rider savings
  const savingsResult = calculateRiderSavingsRange(distanceMiles, durationMinutes, cashRidezPrice);
  
  // Calculate driver extra
  const extraResult = calculateDriverExtraRange(distanceMiles, durationMinutes, cashRidezPrice);
  
  return {
    distanceMiles,
    durationMinutes,
    metricsSource: metrics.source,
    traditionalFareRange: estimate.fareRange,
    traditionalDriverEarningsRange: estimate.driverEarningsRange,
    cashRidezPrice,
    riderSavingsRange: savingsResult?.savingsRange || { low: 0, high: 0, mid: 0 },
    driverExtraRange: extraResult?.extraRange || { low: 0, high: 0, mid: 0 },
    hasSavings: savingsResult?.hasSavings || false,
    hasExtra: extraResult?.hasExtra || false,
    riderSavingsLabel: savingsResult?.label || 'Estimate unavailable',
    driverExtraLabel: extraResult?.label || 'Estimate unavailable',
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

/**
 * Legacy function - for backward compatibility
 * @deprecated Use calculateTripFares with coordinates instead
 */
export function estimateFromMilesOnly(
  distanceMiles: number,
  _pickupTime: Date
): CompetitorFareEstimate {
  // Estimate duration from distance
  const avgSpeed = (FARE_ESTIMATE_CONFIG.AVG_SPEED_LOW + FARE_ESTIMATE_CONFIG.AVG_SPEED_HIGH) / 2;
  const durationMinutes = Math.round((distanceMiles / avgSpeed) * 60);
  
  const estimate = estimateRideshareFareRange(distanceMiles, durationMinutes);
  if (!estimate) {
    return { minFare: 0, maxFare: 0, midFare: 0 };
  }
  
  return {
    minFare: estimate.fareRange.low,
    maxFare: estimate.fareRange.high,
    midFare: estimate.fareRange.mid,
  };
}

/**
 * Legacy function - for backward compatibility
 * @deprecated Use calculateDriverExtraRange instead
 */
export function estimateCompetitorDriverEarnings(traditionalFare: number): number {
  // Use mid-point of take rate range
  const avgTakeRate = (FARE_ESTIMATE_CONFIG.DRIVER_TAKE_RATE_LOW + FARE_ESTIMATE_CONFIG.DRIVER_TAKE_RATE_HIGH) / 2;
  return Math.round((traditionalFare * avgTakeRate) * 100) / 100;
}

/**
 * Legacy function - for backward compatibility
 * @deprecated Use calculateRiderSavingsRange instead
 */
export function calculateRiderSavings(competitorMidFare: number, cashRidezPrice: number): number {
  return Math.round((competitorMidFare - cashRidezPrice) * 100) / 100;
}

/**
 * Legacy function - for backward compatibility
 * @deprecated Use calculateDriverExtraRange instead
 */
export function calculateDriverExtra(cashRidezEarnings: number, competitorDriverEarnings: number): number {
  return Math.round((cashRidezEarnings - competitorDriverEarnings) * 100) / 100;
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

// ============================================================================
// TEST VERIFICATION
// ============================================================================
/**
 * Test cases to verify calculator logic:
 * 
 * Case 1: Short trip (5 miles, ~9 min at 35mph avg)
 *   Fare Low: (1.50 + 5*1.10 + 9*0.15 + 2.00) * 1.0 = $10.35 → floor $10.35
 *   Fare High: (4.00 + 5*2.10 + 9*0.45 + 8.00) * 1.6 = $40.32
 *   Driver Earn Low: $10.35 * 0.25 = $2.59
 *   Driver Earn High: $40.32 * 0.55 = $22.18
 * 
 * Case 2: Medium trip (20 miles, ~34 min)
 *   Fare Low: (1.50 + 20*1.10 + 34*0.15 + 2.00) * 1.0 = $30.60
 *   Fare High: (4.00 + 20*2.10 + 34*0.45 + 8.00) * 1.6 = $117.92
 *   Driver Earn Low: $30.60 * 0.25 = $7.65
 *   Driver Earn High: $117.92 * 0.55 = $64.86
 * 
 * Case 3: Long trip (~49 miles, ~56 min) - THE PROBLEM TRIP
 *   Fare Low: (1.50 + 49*1.10 + 56*0.15 + 2.00) * 1.0 = $65.70
 *   Fare High: (4.00 + 49*2.10 + 56*0.45 + 8.00) * 1.6 = $253.76
 *   Typical Range: $66–$254 (not $32–$43!)
 *   
 *   If CashRidez offer = $100:
 *   Driver Earn Low: $65.70 * 0.25 = $16.43
 *   Driver Earn High: $253.76 * 0.55 = $139.57
 *   Extra Low: $100 - $139.57 = -$39.57 (traditional could pay more)
 *   Extra High: $100 - $16.43 = $83.57
 *   
 *   Display: "You could earn up to $84 more" (or show range)
 */
