import { useMemo } from "react";
import { 
  estimateFromMilesOnly, 
  estimateCompetitorDriverEarnings,
  calculateRiderSavings,
  calculateDriverExtra,
  formatCurrency 
} from "@/utils/fareEstimator";

interface SavingsCalculatorProps {
  distanceMiles?: number;
  pickupTime?: Date;
  userPrice?: number;
  mode: "rider" | "driver";
  variant?: "compact" | "full";
  className?: string;
}

/**
 * SavingsCalculator Component
 * Displays savings (for riders) or extra earnings (for drivers) compared to traditional rideshare
 */
export function SavingsCalculator({
  distanceMiles,
  pickupTime,
  userPrice = 0,
  mode,
  variant = "full",
  className = "",
}: SavingsCalculatorProps) {
  const calculation = useMemo(() => {
    if (!distanceMiles || distanceMiles <= 0) {
      return null;
    }

    const time = pickupTime || new Date();
    const estimate = estimateFromMilesOnly(distanceMiles, time);
    const competitorDriverEarn = estimateCompetitorDriverEarnings(estimate.midFare);

    if (mode === "rider") {
      const hasPriceOffer = userPrice > 0;
      const savings = hasPriceOffer ? calculateRiderSavings(estimate.midFare, userPrice) : 0;
      const minSavings = hasPriceOffer ? calculateRiderSavings(estimate.minFare, userPrice) : 0;
      const maxSavings = hasPriceOffer ? calculateRiderSavings(estimate.maxFare, userPrice) : 0;
      return {
        minFare: estimate.minFare,
        maxFare: estimate.maxFare,
        midFare: estimate.midFare,
        savings,
        minSavings,
        maxSavings,
        competitorDriverEarn,
        hasPriceOffer,
      };
    } else {
      // Driver mode - they keep 100% on CashRidez
      const hasPriceOffer = userPrice > 0;
      const extra = hasPriceOffer ? calculateDriverExtra(userPrice, competitorDriverEarn) : 0;
      return {
        minFare: estimate.minFare,
        maxFare: estimate.maxFare,
        midFare: estimate.midFare,
        competitorDriverEarn,
        extra,
        hasPriceOffer,
      };
    }
  }, [distanceMiles, pickupTime, userPrice, mode]);

  if (!calculation) {
    return null;
  }

  if (variant === "compact") {
    if (mode === "rider" && calculation.savings > 0) {
      return (
        <div className={`flex items-center gap-1 text-success font-semibold ${className}`}>
          <span>💰</span>
          <span>Save {formatCurrency(calculation.savings)}</span>
        </div>
      );
    }
    if (mode === "driver" && calculation.extra && calculation.extra > 0) {
      return (
        <div className={`flex items-center gap-1 text-success font-semibold ${className}`}>
          <span>💰</span>
          <span>+{formatCurrency(calculation.extra)} extra</span>
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
              {calculation.hasPriceOffer ? (
                <>
                  <p className="text-lg font-bold text-foreground">
                    You could save {formatCurrency(calculation.minSavings)} – {formatCurrency(calculation.maxSavings)} compared to traditional rideshare.
                  </p>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>
                      Typical apps might charge: {formatCurrency(calculation.minFare)} – {formatCurrency(calculation.maxFare)} for this trip.
                    </p>
                    <p>
                      Your CashRidez offer: <span className="font-semibold text-success">{formatCurrency(userPrice)}</span>
                    </p>
                    <p className="font-medium text-success">
                      You're saving about {formatCurrency(calculation.savings)} on this ride.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold text-foreground">
                    Typical rideshare apps might charge {formatCurrency(calculation.minFare)} – {formatCurrency(calculation.maxFare)} for this trip.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Enter your price offer below to see how much you could save with CashRidez!
                  </p>
                </>
              )}
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-foreground">
                You're on track to earn about {formatCurrency(calculation.extra || 0)} more than traditional rideshare.
              </p>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  Traditional rideshare driver earnings: ~{formatCurrency(calculation.competitorDriverEarn)}
                </p>
                <p>
                  Your CashRidez earnings: <span className="font-semibold text-success">{formatCurrency(userPrice)}</span> (100%)
                </p>
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
