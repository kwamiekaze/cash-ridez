import { useMemo } from "react";
import { 
  estimateRideshareFareRange,
  calculateRiderSavingsRange,
  calculateDriverExtraRange,
  getTripMetricsFromCoords,
  formatCurrency,
  formatCurrencyRange,
  FARE_ESTIMATE_CONFIG,
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
  // Mode: rider sees savings, driver sees extra earnings
  mode: "rider" | "driver";
  // Display variant
  variant?: "compact" | "full";
  className?: string;
}

/**
 * SavingsCalculator Component
 * Displays savings (for riders) or extra earnings (for drivers) compared to traditional rideshare
 * Now uses range-based calculations for realistic estimates
 */
export function SavingsCalculator({
  pickupLat,
  pickupLng,
  dropoffLat,
  dropoffLng,
  distanceMiles: providedDistance,
  durationMinutes: providedDuration,
  userPrice = 0,
  mode,
  variant = "full",
  className = "",
}: SavingsCalculatorProps) {
  const calculation = useMemo(() => {
    // Get trip metrics from coordinates first
    let distance = providedDistance;
    let duration = providedDuration;
    
    if (pickupLat && pickupLng && dropoffLat && dropoffLng) {
      const metrics = getTripMetricsFromCoords(pickupLat, pickupLng, dropoffLat, dropoffLng);
      if (metrics) {
        distance = metrics.distanceMiles;
        duration = metrics.durationMinutes;
      }
    }
    
    if (!distance || distance <= 0) {
      return null;
    }
    
    // Estimate duration if not available
    if (!duration || duration <= 0) {
      const avgSpeed = (FARE_ESTIMATE_CONFIG.AVG_SPEED_LOW + FARE_ESTIMATE_CONFIG.AVG_SPEED_HIGH) / 2;
      duration = Math.round((distance / avgSpeed) * 60);
    }
    
    // Get fare estimate
    const fareEstimate = estimateRideshareFareRange(distance, duration);
    if (!fareEstimate) return null;

    if (mode === "rider") {
      const savingsResult = userPrice > 0 
        ? calculateRiderSavingsRange(distance, duration, userPrice)
        : null;
      
      return {
        fareRange: fareEstimate.fareRange,
        savingsRange: savingsResult?.savingsRange,
        hasSavings: savingsResult?.hasSavings || false,
        savingsLabel: savingsResult?.label,
        hasPriceOffer: userPrice > 0,
        distanceMiles: distance,
        durationMinutes: duration,
      };
    } else {
      // Driver mode
      const extraResult = userPrice > 0
        ? calculateDriverExtraRange(distance, duration, userPrice)
        : null;
      
      return {
        fareRange: fareEstimate.fareRange,
        driverEarningsRange: fareEstimate.driverEarningsRange,
        extraRange: extraResult?.extraRange,
        hasExtra: extraResult?.hasExtra || false,
        extraLabel: extraResult?.label,
        hasPriceOffer: userPrice > 0,
        distanceMiles: distance,
        durationMinutes: duration,
      };
    }
  }, [pickupLat, pickupLng, dropoffLat, dropoffLng, providedDistance, providedDuration, userPrice, mode]);

  if (!calculation) {
    return null;
  }

  if (variant === "compact") {
    if (mode === "rider" && calculation.hasSavings && calculation.savingsRange) {
      return (
        <div className={`flex items-center gap-1 text-success font-semibold ${className}`}>
          <span>💰</span>
          <span>Save {formatCurrencyRange(calculation.savingsRange.low, calculation.savingsRange.high)}</span>
        </div>
      );
    }
    if (mode === "driver" && calculation.hasExtra && calculation.extraRange) {
      return (
        <div className={`flex items-center gap-1 text-success font-semibold ${className}`}>
          <span>💰</span>
          <span>+{formatCurrencyRange(calculation.extraRange.low, calculation.extraRange.high)} extra</span>
        </div>
      );
    }
    return null;
  }

  // Full variant
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
                      ? `You could save ${formatCurrencyRange(calculation.savingsRange.low, calculation.savingsRange.high)} compared to traditional rideshare.`
                      : 'Competitive with traditional rideshare pricing.'
                    }
                  </p>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>
                      Typical rideshare price range (estimated): {formatCurrencyRange(calculation.fareRange.low, calculation.fareRange.high)}
                    </p>
                    <p>
                      Your CashRidez offer: <span className="font-semibold text-success">{formatCurrency(userPrice)}</span>
                    </p>
                    {calculation.hasSavings && (
                      <p className="font-medium text-success">
                        Estimated savings: {formatCurrencyRange(calculation.savingsRange.low, calculation.savingsRange.high)}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold text-foreground">
                    Typical rideshare price range: {formatCurrencyRange(calculation.fareRange.low, calculation.fareRange.high)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    With CashRidez, you can offer what feels fair and pay drivers directly.
                  </p>
                </>
              )}
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-foreground">
                {calculation.hasExtra && calculation.extraRange
                  ? `You could earn ${formatCurrencyRange(calculation.extraRange.low, calculation.extraRange.high)} more than traditional rideshare.`
                  : 'Competitive with traditional rideshare driver earnings.'
                }
              </p>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  Typical rideshare driver earnings (estimated): {calculation.driverEarningsRange 
                    ? formatCurrencyRange(calculation.driverEarningsRange.low, calculation.driverEarningsRange.high)
                    : 'N/A'
                  }
                </p>
                <p>
                  Your CashRidez earnings: <span className="font-semibold text-success">{formatCurrency(userPrice)}</span> (100%)
                </p>
                {calculation.hasExtra && calculation.extraRange && (
                  <p className="font-medium text-success">
                    Estimated difference: {formatCurrencyRange(calculation.extraRange.low, calculation.extraRange.high)}
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

/**
 * LifetimeSavings Component
 * Displays cumulative savings/earnings on profile pages
 */
export function LifetimeSavings({
  totalSavings = 0,
  totalEarnings = 0,
  totalExtra = 0,
  mode,
  className = "",
}: LifetimeSavingsProps) {
  if (mode === "rider") {
    return (
      <div className={`bg-gradient-to-r from-warning/10 to-success/10 border border-warning/30 rounded-lg p-4 ${className}`}>
        <div className="flex items-center gap-2">
          <span className="text-2xl">💰</span>
          <div>
            <p className="text-lg font-bold text-foreground">
              You've saved {formatCurrency(totalSavings)} compared to traditional rideshare on CashRidez
            </p>
            <p className="text-sm text-muted-foreground">
              Keep stacking your savings with every trip!
            </p>
          </div>
        </div>
      </div>
    );
  }

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
      <div className="flex items-center gap-2 pl-8">
        <div>
          <p className="text-base font-semibold text-success">
            You've earned {formatCurrency(totalExtra)} more than traditional rideshare across all completed trips 💰
          </p>
          <p className="text-sm text-muted-foreground">
            Keep 100% of your earnings on CashRidez!
          </p>
        </div>
      </div>
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
 */
export function TripCompletedSavings({
  savings = 0,
  extra = 0,
  mode,
  className = "",
}: TripCompletedSavingsProps) {
  if (mode === "rider" && savings > 0) {
    return (
      <div className={`bg-success/10 border border-success/30 rounded-lg p-3 ${className}`}>
        <p className="text-base font-semibold text-success flex items-center gap-2">
          <span>💰</span>
          You saved {formatCurrency(savings)} compared to traditional rideshare on this trip!
        </p>
      </div>
    );
  }

  if (mode === "driver" && extra > 0) {
    return (
      <div className={`bg-success/10 border border-success/30 rounded-lg p-3 ${className}`}>
        <p className="text-base font-semibold text-success flex items-center gap-2">
          <span>💰</span>
          You made {formatCurrency(extra)} more than traditional rideshare on this trip!
        </p>
      </div>
    );
  }

  return null;
}
