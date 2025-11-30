import { Check } from "lucide-react";

interface SubscriptionBadgeProps {
  size?: number;
  className?: string;
}

export const SubscriptionBadge = ({ size = 16, className = "" }: SubscriptionBadgeProps) => {
  return (
    <div 
      className={`inline-flex items-center justify-center rounded-full bg-blue-500 ${className}`}
      style={{ width: size, height: size }}
      title="Premium Member"
    >
      <Check className="text-white" size={size * 0.6} />
    </div>
  );
};