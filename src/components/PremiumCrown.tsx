import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

interface PremiumCrownProps {
  className?: string;
  size?: number;
}

export const PremiumCrown = ({ className, size = 16 }: PremiumCrownProps) => {
  return (
    <Crown 
      className={cn(
        "text-[hsl(var(--premium-gold))] fill-[hsl(var(--premium-gold))]",
        "drop-shadow-[0_0_4px_hsl(var(--premium-gold-glow))]",
        className
      )} 
      size={size}
    />
  );
};
