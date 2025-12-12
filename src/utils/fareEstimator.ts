/**
 * Fare Estimator Utility
 * Estimates traditional rideshare fares using simple math formulas.
 * Aligned with fareestimate.com style pricing model.
 * No external APIs are called - all calculations are local.
 * 
 * FORMULA:
 * Traditional Fare = BASE_FARE + (distance * PER_MILE) + (duration * PER_MINUTE) + BOOKING_FEE
 * Driver Take-Home = Traditional Fare * TRADITIONAL_DRIVER_SHARE (65%)
 * 
 * Rider Savings = Traditional Mid Fare - CashRidez Offer
 * Driver Extra = CashRidez Offer - Traditional Driver Take-Home
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
  // Using 65% as industry standard
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
 * Uses fareestimate.com style calculation:
 * fare = base + (miles * per_mile_rate) + (minutes * per_minute_rate) + booking_fee
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
 * Quick estimate using just miles (assumes 2 min per mile average speed ~30mph)
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
 * Estimate what a traditional rideshare driver would earn (take-home)
 * Drivers typically keep 60-70% of the fare (we use 65%)
 * 
 * @param traditionalFare - The mid/average fare estimate
 * @returns The amount a driver would take home after platform fees
 */
export function estimateCompetitorDriverEarnings(traditionalFare: number): number {
  return Math.round((traditionalFare * FARE_ESTIMATE_CONFIG.TRADITIONAL_DRIVER_SHARE) * 100) / 100;
}

/**
 * Calculate how much extra a driver earns on CashRidez vs traditional
 * CashRidez drivers keep 100% of the trip price
 * 
 * FORMULA: CashRidez Earnings - Traditional Driver Take-Home
 * 
 * @param cashRidezEarnings - The CashRidez offer/price (driver keeps 100%)
 * @param competitorDriverEarnings - What driver would earn on traditional platform
 * @returns The difference (can be negative if CashRidez price is lower)
 */
export function calculateDriverExtra(
  cashRidezEarnings: number,
  competitorDriverEarnings: number
): number {
  const diff = cashRidezEarnings - competitorDriverEarnings;
  return Math.round(diff * 100) / 100;
}

// ============================================================================
// RIDER SAVINGS CALCULATIONS
// ============================================================================

/**
 * Calculate rider savings compared to traditional rideshare
 * 
 * FORMULA: Traditional Mid Fare - CashRidez Price
 * 
 * @param competitorMidFare - The estimated traditional rideshare fare
 * @param cashRidezPrice - The CashRidez offer/price
 * @returns Savings amount (can be negative if CashRidez is more expensive)
 */
export function calculateRiderSavings(
  competitorMidFare: number,
  cashRidezPrice: number
): number {
  const diff = competitorMidFare - cashRidezPrice;
  return Math.round(diff * 100) / 100;
}

// ============================================================================
// COMPLETE TRIP CALCULATION (for use when persisting to database)
// ============================================================================

export interface TripFareCalculation {
  // Traditional rideshare estimates
  traditionalFareMin: number;
  traditionalFareMax: number;
  traditionalFareMid: number;
  
  // What traditional driver would earn (after platform takes cut)
  traditionalDriverEarnings: number;
  
  // CashRidez amounts
  cashRidezPrice: number;
  
  // Comparison results
  riderSavings: number;        // How much rider saves vs traditional
  driverExtra: number;         // How much driver earns extra vs traditional
  
  // Human-readable explanations
  riderSavingsLabel: string;
  driverExtraLabel: string;
}

/**
 * Calculate all fare comparisons for a trip
 * This is the main function to use for complete calculations
 * 
 * @param distanceMiles - Trip distance in miles
 * @param durationMinutes - Trip duration in minutes (optional, estimated from distance if not provided)
 * @param cashRidezPrice - The accepted CashRidez offer price
 */
export function calculateTripFares(
  distanceMiles: number,
  cashRidezPrice: number,
  durationMinutes?: number
): TripFareCalculation | null {
  // Validate inputs
  if (!distanceMiles || distanceMiles <= 0 || !cashRidezPrice || cashRidezPrice <= 0) {
    return null;
  }
  
  // Estimate duration if not provided (30mph average = 2 min/mile)
  const duration = durationMinutes && durationMinutes > 0 
    ? durationMinutes 
    : distanceMiles * 2;
  
  // Get traditional fare estimates
  const traditionalFare = estimateTraditionalFare({ 
    distanceMiles, 
    durationMinutes: duration 
  });
  
  // Calculate driver take-home on traditional platform
  const traditionalDriverEarnings = estimateCompetitorDriverEarnings(traditionalFare.traditionalAverage);
  
  // Calculate comparisons
  const riderSavings = calculateRiderSavings(traditionalFare.traditionalAverage, cashRidezPrice);
  const driverExtra = calculateDriverExtra(cashRidezPrice, traditionalDriverEarnings);
  
  // Generate labels
  const riderSavingsLabel = riderSavings >= 0
    ? `You saved $${riderSavings.toFixed(2)} compared to typical rideshare`
    : `CashRidez is $${Math.abs(riderSavings).toFixed(2)} higher than typical estimate`;
  
  const driverExtraLabel = driverExtra >= 0
    ? `You earned $${driverExtra.toFixed(2)} more than traditional rideshare`
    : `Traditional rideshare would pay $${Math.abs(driverExtra).toFixed(2)} more`;
  
  return {
    traditionalFareMin: traditionalFare.traditionalMin,
    traditionalFareMax: traditionalFare.traditionalMax,
    traditionalFareMid: traditionalFare.traditionalAverage,
    traditionalDriverEarnings,
    cashRidezPrice,
    riderSavings,
    driverExtra,
    riderSavingsLabel,
    driverExtraLabel,
  };
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

// ============================================================================
// TEST CASES (for verification)
// ============================================================================
/**
 * Test cases to verify calculator logic:
 * 
 * Case 1: Short trip (2 miles, 8 min, $10 offer)
 *   Traditional Min: 2.75 + (2 * 0.90) + (8 * 0.20) + 2.25 = $8.00 (min $7.00)
 *   Traditional Max: 2.75 + (2 * 1.40) + (8 * 0.20) + 2.25 = $9.00
 *   Traditional Mid: $8.00
 *   Driver Take-Home: $8.00 * 0.65 = $5.20
 *   Rider Savings: $8.00 - $10.00 = -$2.00 (CashRidez more expensive)
 *   Driver Extra: $10.00 - $5.20 = $4.80
 * 
 * Case 2: Medium trip (12 miles, 25 min, $35 offer)
 *   Traditional Min: 2.75 + (12 * 0.90) + (25 * 0.20) + 2.25 = $20.80
 *   Traditional Max: 2.75 + (12 * 1.40) + (25 * 0.20) + 2.25 = $26.80
 *   Traditional Mid: $23.80
 *   Driver Take-Home: $23.80 * 0.65 = $15.47
 *   Rider Savings: $23.80 - $35.00 = -$11.20 (CashRidez more expensive)
 *   Driver Extra: $35.00 - $15.47 = $19.53
 * 
 * Case 3: Long trip (35 miles, 55 min, $80 offer)
 *   Traditional Min: 2.75 + (35 * 0.90) + (55 * 0.20) + 2.25 = $47.50
 *   Traditional Max: 2.75 + (35 * 1.40) + (55 * 0.20) + 2.25 = $65.00
 *   Traditional Mid: $56.25
 *   Driver Take-Home: $56.25 * 0.65 = $36.56
 *   Rider Savings: $56.25 - $80.00 = -$23.75 (CashRidez more expensive)
 *   Driver Extra: $80.00 - $36.56 = $43.44
 * 
 * CRITICAL: Driver Extra should NEVER equal the offer amount.
 * Driver Extra = Offer - (Traditional Mid * 0.65)
 */
