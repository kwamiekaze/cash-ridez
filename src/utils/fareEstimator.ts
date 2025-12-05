/**
 * Fare Estimator Utility
 * Estimates traditional rideshare fares using simple math formulas.
 * No external APIs are called - all calculations are local.
 */

// Pricing constants (adjust as needed)
const BASE_FARE = 2.00; // Base fare in USD
const PER_MILE_RATE = 1.60; // Per mile rate in USD
const PER_MINUTE_RATE = 0.30; // Per minute rate in USD
const DRIVER_SHARE = 0.60; // Traditional rideshare driver share (60%)

// Distance conversion
const KM_TO_MILES = 0.621371;

/**
 * Time-of-day multiplier based on pickup time
 */
function getTimeMultiplier(pickupTime: Date): number {
  const hour = pickupTime.getHours();
  const dayOfWeek = pickupTime.getDay(); // 0 = Sunday, 6 = Saturday
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  
  // Late night (10pm - 5am) or weekend - higher demand
  if (hour >= 22 || hour < 5 || isWeekend) {
    return 1.3;
  }
  
  // Rush hours (7-9am, 4-7pm) - busy times
  if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19)) {
    return 1.2;
  }
  
  // Off-peak hours
  return 1.0;
}

export interface CompetitorFareEstimate {
  minFare: number;
  maxFare: number;
  midFare: number;
}

/**
 * Estimate what traditional rideshare services would charge for a trip
 * @param distanceKm - Distance in kilometers
 * @param durationMinutes - Duration in minutes
 * @param pickupTime - Pickup date/time for time-of-day multiplier
 */
export function estimateCompetitorFare(
  distanceKm: number,
  durationMinutes: number,
  pickupTime: Date
): CompetitorFareEstimate {
  // Convert km to miles
  const distanceMiles = distanceKm * KM_TO_MILES;
  
  // Get time-of-day multiplier
  const timeMultiplier = getTimeMultiplier(pickupTime);
  
  // Calculate base fare
  const distanceCharge = distanceMiles * PER_MILE_RATE;
  const timeCharge = durationMinutes * PER_MINUTE_RATE;
  const baseFare = BASE_FARE + distanceCharge + timeCharge;
  
  // Apply time multiplier
  const midFare = Math.round((baseFare * timeMultiplier) * 100) / 100;
  
  // Calculate min/max range (±10%)
  const minFare = Math.round((midFare * 0.9) * 100) / 100;
  const maxFare = Math.round((midFare * 1.1) * 100) / 100;
  
  return { minFare, maxFare, midFare };
}

/**
 * Estimate what a traditional rideshare driver would earn
 * @param midFare - The mid-point fare estimate
 */
export function estimateCompetitorDriverEarnings(midFare: number): number {
  return Math.round((midFare * DRIVER_SHARE) * 100) / 100;
}

/**
 * Calculate rider savings compared to traditional rideshare
 * @param competitorMidFare - What traditional rideshare would charge
 * @param cashRidezPrice - What the rider is paying on CashRidez
 */
export function calculateRiderSavings(
  competitorMidFare: number,
  cashRidezPrice: number
): number {
  return Math.max(0, Math.round((competitorMidFare - cashRidezPrice) * 100) / 100);
}

/**
 * Calculate driver extra earnings compared to traditional rideshare
 * @param cashRidezEarnings - What the driver earns on CashRidez (100% of trip price)
 * @param competitorDriverEarnings - What driver would earn with traditional rideshare
 */
export function calculateDriverExtra(
  cashRidezEarnings: number,
  competitorDriverEarnings: number
): number {
  return Math.max(0, Math.round((cashRidezEarnings - competitorDriverEarnings) * 100) / 100);
}

/**
 * Format a number as USD currency
 */
export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Quick estimate using just miles (assumes 2 min per mile average speed)
 * Useful when only distance is available
 */
export function estimateFromMilesOnly(
  distanceMiles: number,
  pickupTime: Date
): CompetitorFareEstimate {
  const estimatedMinutes = distanceMiles * 2; // Rough estimate: 30mph average
  const distanceKm = distanceMiles / KM_TO_MILES;
  return estimateCompetitorFare(distanceKm, estimatedMinutes, pickupTime);
}

// Export constants for reference/debugging
export const FARE_CONSTANTS = {
  BASE_FARE,
  PER_MILE_RATE,
  PER_MINUTE_RATE,
  DRIVER_SHARE,
  KM_TO_MILES,
};
