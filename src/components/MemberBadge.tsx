import { CheckCircle } from "lucide-react";

interface MemberBadgeProps {
  isMember: boolean;
  className?: string;
}

export const MemberBadge = ({ isMember, className }: MemberBadgeProps) => {
  if (!isMember) return null;

  return (
    <CheckCircle 
      className={`w-4 h-4 text-primary fill-primary ${className}`} 
      aria-label="Verified Member"
      role="img"
    />
  );
};
