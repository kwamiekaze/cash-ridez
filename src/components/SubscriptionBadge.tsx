import { Check } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SubscriptionBadgeProps {
  size?: number;
  className?: string;
}

export const SubscriptionBadge = ({ size = 16, className = "" }: SubscriptionBadgeProps) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div 
            className={`inline-flex items-center justify-center rounded-full bg-blue-500 ${className}`}
            style={{ width: size, height: size }}
          >
            <Check className="text-white" style={{ width: size * 0.7, height: size * 0.7 }} strokeWidth={3} />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Premium Member</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};