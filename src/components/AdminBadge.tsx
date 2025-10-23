import { Badge } from "@/components/ui/badge";

interface AdminBadgeProps {
  isAdmin: boolean;
  className?: string;
}

export const AdminBadge = ({ isAdmin, className }: AdminBadgeProps) => {
  if (!isAdmin) return null;

  return (
    <Badge 
      variant="default" 
      className={`bg-primary hover:bg-primary text-primary-foreground text-xs px-2 py-0.5 ${className}`}
      aria-label="Admin"
      role="status"
    >
      Admin
    </Badge>
  );
};
