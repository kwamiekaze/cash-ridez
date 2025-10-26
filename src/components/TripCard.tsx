import { memo } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, DollarSign, CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns";
import StatusBadge from "@/components/StatusBadge";
import { UserChip } from "@/components/UserChip";

interface TripCardProps {
  request: any;
  isCompleted?: boolean;
  onComplete?: (trip: any, e: React.MouseEvent) => void;
  onCancel?: (trip: any, e: React.MouseEvent) => void;
  userRole: "rider" | "driver";
}

export const TripCard = memo(({ request, isCompleted, onComplete, onCancel, userRole }: TripCardProps) => {
  const navigate = useNavigate();
  const otherUser = userRole === "rider" ? request.assigned_driver : request.rider;

  return (
    <Card
      key={request.id}
      className="p-4 sm:p-6 hover:shadow-xl hover:border-primary/50 transition-all duration-200 bg-gradient-to-br from-card to-card/50 cursor-pointer"
      onClick={() => navigate(`/trip/${request.id}`)}
    >
      <div className="flex flex-col gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <StatusBadge status={request.status} />
            <span className="text-xs text-muted-foreground">
              {format(new Date(request.created_at), "MMM d, yyyy 'at' h:mm a")}
            </span>
          </div>

          {otherUser && (
            <div className="mb-3">
              <UserChip
                userId={otherUser.id}
                fullName={otherUser.full_name}
                displayName={otherUser.display_name}
                photoUrl={otherUser.photo_url}
                role={userRole === "rider" ? "driver" : "rider"}
                ratingAvg={userRole === "rider" ? otherUser.driver_rating_avg : otherUser.rider_rating_avg}
                ratingCount={userRole === "rider" ? otherUser.driver_rating_count : otherUser.rider_rating_count}
                size="md"
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 mt-1 text-success flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium break-words">{request.pickup_address}</p>
                <p className="text-sm text-muted-foreground break-words">To: {request.dropoff_address}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <p className="text-sm text-muted-foreground">
                {format(new Date(request.pickup_time), "MMM d, yyyy 'at' h:mm a")}
              </p>
            </div>
            {request.price_offer && (
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-green-600 flex-shrink-0" />
                <p className="text-sm font-semibold text-green-600">${request.price_offer}</p>
              </div>
            )}
          </div>
        </div>

        {!isCompleted && onComplete && onCancel && (
          <div className="flex gap-2 pt-2 border-t">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation();
                onCancel(request, e);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation();
                onComplete(request, e);
              }}
            >
              Complete
            </Button>
          </div>
        )}

        {isCompleted && (
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-2 text-sm">
              {(userRole === "rider" ? request.driver_rating : request.rider_rating) ? (
                <div className="flex items-center gap-1">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-green-600 font-medium">Rated</span>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Not rated</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
});

TripCard.displayName = "TripCard";
