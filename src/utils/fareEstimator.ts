/**
 * Fare Estimator Utility
 * Estimates traditional rideshare fares using simple math formulas.
 * Aligned with fareestimate.com style pricing model.
 * No external APIs are called - all calculations are local.
 */

// ============================================================================
// FARE CONFIGURATION - Adjust these values to tune pricing
// ============================================================================
export const FARE_ESTIMATE_CONFIG = {
  // Base fare charged at start of trip
  BASE_FARE: 2.75,
  
  // Per-mile rates (min/max for range)
  PER_MILE_MIN: 0.90,
  PER_MILE_MAX: 1.40,
  
  // Per-minute rate (same for min/max)
  PER_MINUTE: 0.20,
  
  // Booking/service fee
  BOOKING_FEE: 2.25,
  
  // What percentage traditional rideshare drivers keep (60-70%)
  TRADITIONAL_DRIVER_SHARE: 0.65,
  
  // Minimum fare threshold
  MINIMUM_FARE: 7.00,
};

// Distance conversion
const KM_TO_MILES = 0.621371;

// ============================================================================
// CORE ESTIMATION FUNCTIONS
// ============================================================================

export interface FareInputs {
  distanceMiles: number;
  durationMinutes: number;
}

export interface FareEstimate {
  traditionalMin: number;
  traditionalMax: number;
  traditionalAverage: number;
}

/**
 * Estimate what traditional rideshare services would charge for a trip
 * Uses fareestimate.com style calculation
 */
export function estimateTraditionalFare({ distanceMiles, durationMinutes }: FareInputs): FareEstimate {
  const { BASE_FARE, PER_MILE_MIN, PER_MILE_MAX, PER_MINUTE, BOOKING_FEE, MINIMUM_FARE } = FARE_ESTIMATE_CONFIG;
  
  // Calculate min fare
  const minRaw = BASE_FARE + (distanceMiles * PER_MILE_MIN) + (durationMinutes * PER_MINUTE) + BOOKING_FEE;
  const traditionalMin = Math.max(MINIMUM_FARE, Math.round(minRaw * 100) / 100);
  
  // Calculate max fare
  const maxRaw = BASE_FARE + (distanceMiles * PER_MILE_MAX) + (durationMinutes * PER_MINUTE) + BOOKING_FEE;
  const traditionalMax = Math.max(MINIMUM_FARE, Math.round(maxRaw * 100) / 100);
  
  // Average
  const traditionalAverage = Math.round(((traditionalMin + traditionalMax) / 2) * 100) / 100;
  
  return { traditionalMin, traditionalMax, traditionalAverage };
}

// ============================================================================
// LEGACY API COMPATIBILITY (used by existing SavingsCalculator)
// ============================================================================

export interface CompetitorFareEstimate {
  minFare: number;
  maxFare: number;
  midFare: number;
}

/**
 * Legacy function - wraps new estimateTraditionalFare for backward compatibility
 */
export function estimateCompetitorFare(
  distanceKm: number,
  durationMinutes: number,
  _pickupTime: Date
): CompetitorFareEstimate {
  const distanceMiles = distanceKm * KM_TO_MILES;
  const estimate = estimateTraditionalFare({ distanceMiles, durationMinutes });
  
  return {
    minFare: estimate.traditionalMin,
    maxFare: estimate.traditionalMax,
    midFare: estimate.traditionalAverage,
  };
}

/**
 * Quick estimate using just miles (assumes 2 min per mile average speed)
 * Useful when only distance is available
 */
export function estimateFromMilesOnly(
  distanceMiles: number,
  _pickupTime: Date
): CompetitorFareEstimate {
  const estimatedMinutes = distanceMiles * 2; // Rough estimate: 30mph average
  const estimate = estimateTraditionalFare({ distanceMiles, durationMinutes: estimatedMinutes });
  
  return {
    minFare: estimate.traditionalMin,
    maxFare: estimate.traditionalMax,
    midFare: estimate.traditionalAverage,
  };
}

// ============================================================================
// DRIVER EARNINGS CALCULATIONS
// ============================================================================

/**
 * Estimate what a traditional rideshare driver would earn
 * Drivers typically keep 60-70% of the fare
 */
export function estimateCompetitorDriverEarnings(traditionalFare: number): number {
  return Math.round((traditionalFare * FARE_ESTIMATE_CONFIG.TRADITIONAL_DRIVER_SHARE) * 100) / 100;
}

/**
 * Calculate how much extra a driver earns on CashRidez vs traditional
 * CashRidez drivers keep 100% of the trip price
 */
export function calculateDriverExtra(
  cashRidezEarnings: number,
  competitorDriverEarnings: number
): number {
  return Math.max(0, Math.round((cashRidezEarnings - competitorDriverEarnings) * 100) / 100);
}

// ============================================================================
// RIDER SAVINGS CALCULATIONS
// ============================================================================

/**
 * Calculate rider savings compared to traditional rideshare
 */
export function calculateRiderSavings(
  competitorMidFare: number,
  cashRidezPrice: number
): number {
  return Math.max(0, Math.round((competitorMidFare - cashRidezPrice) * 100) / 100);
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Format a number as USD currency
 */
export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

// Export constants for reference/debugging (legacy)
export const FARE_CONSTANTS = {
  BASE_FARE: FARE_ESTIMATE_CONFIG.BASE_FARE,
  PER_MILE_RATE: (FARE_ESTIMATE_CONFIG.PER_MILE_MIN + FARE_ESTIMATE_CONFIG.PER_MILE_MAX) / 2,
  PER_MINUTE_RATE: FARE_ESTIMATE_CONFIG.PER_MINUTE,
  DRIVER_SHARE: FARE_ESTIMATE_CONFIG.TRADITIONAL_DRIVER_SHARE,
  KM_TO_MILES,
};
