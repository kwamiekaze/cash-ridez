import { Badge } from "@/components/ui/badge";
import { Crown } from "lucide-react";

interface MemberBadgeProps {
  isMember: boolean;
  className?: string;
}

export const MemberBadge = ({ isMember, className }: MemberBadgeProps) => {
  if (!isMember) return null;

  return (
    <Badge 
      variant="default" 
      className={`bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-1 ${className}`}
    >
      <Crown className="w-3 h-3" />
      Member
    </Badge>
  );
};
