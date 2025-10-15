import { Badge } from "@/components/ui/badge";
import { Shield, Clock, CheckCircle, XCircle } from "lucide-react";

interface StatusBadgeProps {
  status: "pending" | "approved" | "rejected" | "open" | "assigned" | "completed" | "cancelled";
  className?: string;
}

const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const variants = {
    pending: { variant: "default" as const, icon: Clock, label: "Pending", color: "bg-warning" },
    approved: { variant: "default" as const, icon: CheckCircle, label: "Verified", color: "bg-verified" },
    rejected: { variant: "destructive" as const, icon: XCircle, label: "Rejected", color: "bg-destructive" },
    open: { variant: "default" as const, icon: Shield, label: "Open", color: "bg-primary" },
    assigned: { variant: "default" as const, icon: Clock, label: "Assigned", color: "bg-warning" },
    completed: { variant: "default" as const, icon: CheckCircle, label: "Completed", color: "bg-verified" },
    cancelled: { variant: "destructive" as const, icon: XCircle, label: "Cancelled", color: "bg-destructive" },
  };

  const config = variants[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={className}>
      <Icon className="w-3 h-3 mr-1" />
      {config.label}
    </Badge>
  );
};

export default StatusBadge;
