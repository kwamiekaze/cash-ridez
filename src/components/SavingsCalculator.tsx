import { useMemo } from "react";
import { 
  estimateRideshareFareRange,
  calculateRiderSavingsRange,
  calculateDriverExtraRange,
  getTripMetricsFromCoords,
  formatCurrency,
  formatCurrencyRange,
  getSurgePeriod,
  GEORGIA_FARE_CONFIG,
  type FareRange,
  type SurgePeriod,
} from "@/utils/fareEstimator";

interface SavingsCalculatorProps {
  // Prefer coordinates for accurate distance calculation
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  // Fallback: direct distance/duration if coordinates unavailable
  distanceMiles?: number;
  durationMinutes?: number;
  // The CashRidez offer/price
  userPrice?: number;
  // Pickup time for time-of-day surge awareness
  pickupTime?: Date;
  // Mode: rider sees savings, driver sees extra earnings
  mode: "rider" | "driver";
  // Display variant
  variant?: "compact" | "full";
  className?: string;
}

// Map surge period to human-readable label
function getSurgePeriodLabel(period: SurgePeriod): string {
  switch (period) {
    case 'rush_hour': return 'Rush Hour';
    case 'late_night': return 'Late Night';
    case 'weekend_day': return 'Weekend';
    case 'off_peak':
    default: return 'Standard';
  }
}

// Format approximate range for advisory display
function formatApproxRange(low: number, high: number): string {
  // Round to reasonable increments to avoid false precision
  const roundedLow = Math.round(low / 5) * 5;
  const roundedHigh = Math.round(high / 5) * 5;
  if (roundedLow === roundedHigh) {
    return `around $${roundedLow}`;
  }
  return `$${roundedLow} – $${roundedHigh}`;
}

/**
 * SavingsCalculator Component
 * Displays savings (for riders) or extra earnings (for drivers) compared to traditional rideshare
 * Uses Georgia/Metro Atlanta specific rates matching FareEstimate.com patterns
 * Now with time-of-day surge awareness
 * 
 * IMPORTANT: This component should only appear AFTER trip acceptance (rider) or completion (driver)
 */
export function SavingsCalculator({
  pickupLat,
  pickupLng,
  dropoffLat,
  dropoffLng,
  distanceMiles: providedDistance,
  durationMinutes: providedDuration,
  userPrice = 0,
  pickupTime,
  mode,
  variant = "full",
  className = "",
}: SavingsCalculatorProps) {
  const calculation = useMemo(() => {
    // Get trip metrics from coordinates first
    let distance = providedDistance;
    let duration = providedDuration;
    let config = GEORGIA_FARE_CONFIG;
    
    if (pickupLat && pickupLng && dropoffLat && dropoffLng) {
      const metrics = getTripMetricsFromCoords(pickupLat, pickupLng, dropoffLat, dropoffLng);
      if (metrics) {
        distance = metrics.distanceMiles;
        duration = metrics.durationMinutes;
        config = metrics.geographic.config;
      }
    }
    
    if (!distance || distance <= 0) {
      return null;
    }
    
    // Estimate duration if not available
    if (!duration || duration <= 0) {
      const avgSpeed = (config.SPEED_SUBURBAN + config.SPEED_HIGHWAY) / 2;
      duration = Math.round((distance / avgSpeed) * 60) + 3;
    }
    
    // Get fare estimate with time-of-day awareness
    const fareEstimate = estimateRideshareFareRange(distance, duration, config, pickupTime);
    if (!fareEstimate) return null;

    // Get surge period for display
    const surgePeriod = getSurgePeriod(pickupTime);
    const surgePeriodLabel = getSurgePeriodLabel(surgePeriod);

    if (mode === "rider") {
      const savingsResult = userPrice > 0 
        ? calculateRiderSavingsRange(distance, duration, userPrice, config, pickupTime)
        : null;
      
      return {
        fareRange: fareEstimate.riderFareRange,
        bestPrice: fareEstimate.riderFareRange.best,
        savingsRange: savingsResult?.savingsRange,
        hasSavings: savingsResult?.hasSavings || false,
        savingsLabel: savingsResult?.savingsLabel,
        hasPriceOffer: userPrice > 0,
        distanceMiles: distance,
        durationMinutes: duration,
        surgePeriod,
        surgePeriodLabel,
      };
    } else {
      // Driver mode
      const extraResult = userPrice > 0
        ? calculateDriverExtraRange(distance, duration, userPrice, config, pickupTime)
        : null;
      
      return {
        fareRange: fareEstimate.riderFareRange,
        driverPayoutRange: fareEstimate.driverPayoutRange,
        extraRange: extraResult?.extraRange,
        hasExtra: extraResult?.hasExtra || false,
        extraLabel: extraResult?.extraLabel,
        hasPriceOffer: userPrice > 0,
        distanceMiles: distance,
        durationMinutes: duration,
        surgePeriod,
        surgePeriodLabel,
      };
    }
  }, [pickupLat, pickupLng, dropoffLat, dropoffLng, providedDistance, providedDuration, userPrice, pickupTime, mode]);

  if (!calculation) {
    return null;
  }

  if (variant === "compact") {
    if (mode === "rider" && calculation.hasSavings && calculation.savingsRange) {
      return (
        <div className={`flex items-center gap-1 text-success font-semibold ${className}`}>
          <span>💰</span>
          <span>Estimated savings: {formatApproxRange(calculation.savingsRange.low, calculation.savingsRange.high)}</span>
        </div>
      );
    }
    if (mode === "driver" && calculation.hasExtra && calculation.extraRange) {
      return (
        <div className={`flex items-center gap-1 text-success font-semibold ${className}`}>
          <span>💰</span>
          <span>Estimated extra: {formatApproxRange(calculation.extraRange.low, calculation.extraRange.high)}</span>
        </div>
      );
    }
    return null;
  }

  // Full variant - advisory, range-based messaging
  return (
    <div className={`bg-gradient-to-r from-warning/10 to-success/10 border border-warning/30 rounded-lg p-4 ${className}`}>
      <div className="flex items-start gap-2">
        <span className="text-2xl">💰</span>
        <div className="flex-1 space-y-2">
          {mode === "rider" ? (
            <>
              {calculation.hasPriceOffer && calculation.savingsRange ? (
                <>
                  <p className="text-lg font-bold text-foreground">
                    {calculation.hasSavings 
                      ? `Estimated savings: ${formatApproxRange(calculation.savingsRange.low, calculation.savingsRange.high)}`
                      : 'Competitive with typical rideshare pricing.'
                    }
                  </p>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>
                      Based on similar trips, traditional rideshare prices typically range between{' '}
                      <span className="font-medium">{formatApproxRange(calculation.fareRange.low, calculation.fareRange.high)}</span>
                    </p>
                    <p>
                      Your CashRidez trip: <span className="font-semibold text-success">{formatCurrency(userPrice)}</span>
                    </p>
                    {calculation.hasSavings && (
                      <p className="text-xs italic text-muted-foreground/80">
                        CashRidez helps riders often save on trips like this.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold text-foreground">
                    Typical rideshare prices for similar trips
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Most riders pay {formatApproxRange(calculation.fareRange.low, calculation.fareRange.high)} for trips like this.
                  </p>
                  <p className="text-xs italic text-muted-foreground/80">
                    With CashRidez, you can offer what feels fair and pay drivers directly.
                  </p>
                </>
              )}
            </>
          ) : (
            // Driver mode - only shown after completion, only if positive
            <>
              <p className="text-lg font-bold text-foreground">
                {calculation.hasExtra && calculation.extraRange
                  ? `You earned more than typical rideshare!`
                  : 'Competitive with typical rideshare driver earnings.'
                }
              </p>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  On trips like this, traditional rideshare drivers typically earn{' '}
                  {calculation.driverPayoutRange 
                    ? formatApproxRange(calculation.driverPayoutRange.low, calculation.driverPayoutRange.high)
                    : 'N/A'
                  }
                </p>
                <p>
                  You earned on CashRidez: <span className="font-semibold text-success">{formatCurrency(userPrice)}</span>
                </p>
                {calculation.hasExtra && calculation.extraRange && (
                  <p className="font-medium text-success">
                    Estimated extra earnings: {formatApproxRange(calculation.extraRange.low, calculation.extraRange.high)}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface LifetimeSavingsProps {
  totalSavings?: number;
  totalEarnings?: number;
  totalExtra?: number;
  mode: "rider" | "driver";
  className?: string;
}

// Generate approximate range from a single value (±15% for realistic variance)
function approximateRange(value: number): { low: number; high: number } {
  const variance = 0.15;
  const low = Math.round(value * (1 - variance));
  const high = Math.round(value * (1 + variance));
  return { low, high };
}

/**
 * LifetimeSavings Component
 * Displays cumulative savings/earnings on profile pages and subscription upsells
 * Uses approximate ranges to avoid false precision
 */
export function LifetimeSavings({
  totalSavings = 0,
  totalEarnings = 0,
  totalExtra = 0,
  mode,
  className = "",
}: LifetimeSavingsProps) {
  if (mode === "rider") {
    if (totalSavings <= 0) return null;
    
    const savingsRange = approximateRange(totalSavings);
    
    return (
      <div className={`bg-gradient-to-r from-warning/10 to-success/10 border border-warning/30 rounded-lg p-4 ${className}`}>
        <div className="flex items-center gap-2">
          <span className="text-2xl">💰</span>
          <div>
            <p className="text-lg font-bold text-foreground">
              Estimated lifetime savings: {formatApproxRange(savingsRange.low, savingsRange.high)}
            </p>
            <p className="text-sm text-muted-foreground">
              So far, you've likely saved approximately this amount compared to traditional rideshare.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Driver mode
  if (totalExtra <= 0 && totalEarnings <= 0) return null;
  
  const extraRange = totalExtra > 0 ? approximateRange(totalExtra) : null;
  
  return (
    <div className={`bg-gradient-to-r from-warning/10 to-success/10 border border-warning/30 rounded-lg p-4 space-y-3 ${className}`}>
      <div className="flex items-center gap-2">
        <span className="text-2xl">💰</span>
        <div>
          <p className="text-lg font-bold text-foreground">
            Total CashRidez Earnings: {formatCurrency(totalEarnings)}
          </p>
        </div>
      </div>
      {extraRange && (
        <div className="flex items-center gap-2 pl-8">
          <div>
            <p className="text-base font-semibold text-success">
              Estimated extra earnings: {formatApproxRange(extraRange.low, extraRange.high)} 💰
            </p>
            <p className="text-sm text-muted-foreground">
              So far, you've earned approximately this much more than traditional rideshare drivers on similar trips.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

interface TripCompletedSavingsProps {
  savings?: number;
  extra?: number;
  mode: "rider" | "driver";
  className?: string;
}

/**
 * TripCompletedSavings Component
 * Shows savings/extra for a completed trip
 * Uses approximate ranges to avoid false precision
 * Only shows positive comparisons (no negative messaging for drivers)
 */
export function TripCompletedSavings({
  savings = 0,
  extra = 0,
  mode,
  className = "",
}: TripCompletedSavingsProps) {
  if (mode === "rider" && savings > 0) {
    const savingsRange = approximateRange(savings);
    return (
      <div className={`bg-success/10 border border-success/30 rounded-lg p-3 ${className}`}>
        <p className="text-base font-semibold text-success flex items-center gap-2">
          <span>💰</span>
          Estimated savings on this trip: {formatApproxRange(savingsRange.low, savingsRange.high)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Based on typical rideshare pricing for similar trips.
        </p>
      </div>
    );
  }

  // Driver mode - only show if actually earned more
  if (mode === "driver" && extra > 0) {
    const extraRange = approximateRange(extra);
    return (
      <div className={`bg-success/10 border border-success/30 rounded-lg p-3 ${className}`}>
        <p className="text-base font-semibold text-success flex items-center gap-2">
          <span>💰</span>
          You earned approximately {formatApproxRange(extraRange.low, extraRange.high)} more on this trip!
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Compared to typical rideshare driver earnings for similar trips.
        </p>
      </div>
    );
  }

  // Don't show anything if no positive comparison
  return null;
}
