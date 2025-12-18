import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

export interface UserFilters {
  roles: string[];
  verificationStatus: string;
  lastVisit: string;
}

interface AdminUserFiltersProps {
  filters: UserFilters;
  onFiltersChange: (filters: UserFilters) => void;
}

const roleOptions = [
  { value: "driver", label: "Driver" },
  { value: "rider", label: "Rider" },
  { value: "both", label: "Both (Driver + Rider)" },
  { value: "admin", label: "Admin" },
];

const verificationOptions = [
  { value: "all", label: "All Statuses" },
  { value: "verified", label: "Verified" },
  { value: "pending", label: "Pending" },
  { value: "rejected", label: "Rejected" },
  { value: "not_submitted", label: "Not Submitted" },
];

const lastVisitOptions = [
  { value: "all", label: "All Activity" },
  { value: "online_now", label: "Online Now (5 min)" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "never", label: "Never visited" },
];

export function AdminUserFilters({ filters, onFiltersChange }: AdminUserFiltersProps) {
  const toggleRole = (role: string) => {
    const newRoles = filters.roles.includes(role)
      ? filters.roles.filter(r => r !== role)
      : [...filters.roles, role];
    onFiltersChange({ ...filters, roles: newRoles });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      roles: [],
      verificationStatus: "all",
      lastVisit: "all",
    });
  };

  const hasActiveFilters = filters.roles.length > 0 || filters.verificationStatus !== "all" || filters.lastVisit !== "all";

  return (
    <div className="space-y-3 p-3 bg-card/50 backdrop-blur-sm rounded-lg border border-border/50 mb-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Filters:</span>
        
        {/* Role multi-select pills */}
        <div className="flex flex-wrap gap-1.5">
          {roleOptions.map((option) => (
            <Badge
              key={option.value}
              variant={filters.roles.includes(option.value) ? "default" : "outline"}
              className={`cursor-pointer transition-colors text-xs ${
                filters.roles.includes(option.value) 
                  ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                  : "hover:bg-muted"
              }`}
              onClick={() => toggleRole(option.value)}
            >
              {option.label}
            </Badge>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Verification Status */}
        <Select
          value={filters.verificationStatus}
          onValueChange={(value) => onFiltersChange({ ...filters, verificationStatus: value })}
        >
          <SelectTrigger className="w-[160px] h-8 text-xs bg-background/50">
            <SelectValue placeholder="ID Status" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border z-50">
            {verificationOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Last Visit */}
        <Select
          value={filters.lastVisit}
          onValueChange={(value) => onFiltersChange({ ...filters, lastVisit: value })}
        >
          <SelectTrigger className="w-[160px] h-8 text-xs bg-background/50">
            <SelectValue placeholder="Last Visit" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border z-50">
            {lastVisitOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Clear filters button */}
        {hasActiveFilters && (
          <Badge
            variant="secondary"
            className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors text-xs gap-1"
            onClick={clearAllFilters}
          >
            <X className="h-3 w-3" />
            Clear
          </Badge>
        )}
      </div>
    </div>
  );
}
