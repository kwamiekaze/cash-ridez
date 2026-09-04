import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, MapPin, MessageSquare, Clock, CheckCircle, XCircle, Users, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { RatingDisplay } from "@/components/RatingDisplay";
import { RatingDialog } from "@/components/RatingDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserChip } from "@/components/UserChip";
import TripActionDialog from "@/components/TripActionDialog";
import AppHeader from "@/components/AppHeader";
import { MapBackground } from "@/components/MapBackground";
import { MaskedCallButton } from "@/components/MaskedCallButton";
import { useSubscription } from "@/hooks/useSubscription";
import { calculateTripFares, formatCurrency, formatCurrencyRange } from "@/utils/fareEstimator";
import { AddressLink } from "@/components/AddressLink";
import { AdminTripMessages } from "@/components/AdminTripMessages";
import { AdminCancelRideDialog } from "@/components/AdminCancelRideDialog";

export default function TripDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [request, setRequest] = useState<any>(null);
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isRider, setIsRider] = useState(false);
  const [counterAmount, setCounterAmount] = useState("");
  const [counterMessage, setCounterMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showRatingDialog, setShowRatingDialog] = useState(false);
  const [riderProfile, setRiderProfile] = useState<any>(null);
  const [driverProfile, setDriverProfile] = useState<any>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<"complete" | "cancel">("complete");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedOffer, setEditedOffer] = useState("");
  const [adminCancelDialogOpen, setAdminCancelDialogOpen] = useState(false);
  const { checkStatus } = useSubscription();

  useEffect(() => {
    fetchTripData();
    getCurrentUser();

    // Subscribe to realtime updates for the trip itself (for status changes)
    const tripChannel = supabase
      .channel(`trip-${id}-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ride_requests',
          filter: `id=eq.${id}`
        },
        () => {
          console.log('Trip status updated, refetching...');
          fetchTripData();
        }
      )
      .subscribe((status, err) => {
        if (err) console.warn('[realtime] subscription error:', err);
      });

    // Subscribe to realtime updates for offers
    const offersChannel = supabase
      .channel(`counter-offers-changes-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'counter_offers',
          filter: `ride_request_id=eq.${id}`
        },
        () => {
          fetchOffers();
        }
      )
      .subscribe((status, err) => {
        if (err) console.warn('[realtime] subscription error:', err);
      });

    return () => {
      supabase.removeChannel(tripChannel);
      supabase.removeChannel(offersChannel);
    };
  }, [id]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || null);
    
    // Check if user is admin
    if (user?.id) {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin');
      setIsAdmin(roles && roles.length > 0);
    }
  };

  const fetchTripData = async () => {
    try {
      const { data: tripData, error: tripError } = await supabase
        .from('ride_requests')
        .select('*')
        .eq('id', id)
        .single();

      if (tripError) throw tripError;
      setRequest(tripData);

      const { data: { user } } = await supabase.auth.getUser();
      setIsRider(tripData.rider_id === user?.id);

      // Fetch rider profile - always include full_name but only email/phone for assigned drivers
      const riderFields = tripData.status === 'assigned' && tripData.assigned_driver_id === user?.id
        ? 'id, full_name, email, rider_rating_avg, rider_rating_count, phone_number, photo_url, is_member'
        : 'id, full_name, rider_rating_avg, rider_rating_count, photo_url, is_member';
      
      const { data: riderData } = await supabase
        .from('profiles')
        .select(riderFields)
        .eq('id', tripData.rider_id)
        .single();
      setRiderProfile(riderData);

      // Fetch driver profile if assigned - always include full_name but only email/phone for assigned riders
      if (tripData.assigned_driver_id) {
        const driverFields = tripData.status === 'assigned' && tripData.rider_id === user?.id
          ? 'id, full_name, email, driver_rating_avg, driver_rating_count, phone_number, photo_url, is_member'
          : 'id, full_name, driver_rating_avg, driver_rating_count, photo_url, is_member';
        
        const { data: driverData } = await supabase
          .from('profiles')
          .select(driverFields)
          .eq('id', tripData.assigned_driver_id)
          .single();
        setDriverProfile(driverData);
      }

      await fetchOffers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchOffers = async () => {
    try {
      // 1) Fetch offers for this trip (no joins to avoid RLS/FK issues)
      const { data: offersData, error: offersError } = await supabase
        .from('counter_offers')
        .select('*')
        .eq('ride_request_id', id)
        .order('created_at', { ascending: false});

      if (offersError) throw offersError;

      const list = offersData || [];

      // 2) Fetch profile basics for the offer makers that we are allowed to see
      const userIds = Array.from(new Set(list.map((o: any) => o.by_user_id)));
      let profilesMap: Record<string, any> = {};
      if (userIds.length > 0) {
      const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, display_name, photo_url, driver_rating_avg, driver_rating_count, is_member')
          .in('id', userIds);
        (profilesData || []).forEach((p: any) => { profilesMap[p.id] = p; });
      }

      // 3) Attach profiles where available (may be null due to RLS, which is OK)
      const enriched = list.map((o: any) => ({ ...o, profiles: profilesMap[o.by_user_id] }));
      setOffers(enriched);
    } catch (error: any) {
      console.error('Error fetching offers:', error);
    }
  };

  const handleSubmitOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!counterAmount || !currentUserId) return;

    setSubmitting(true);
    try {
      const amount = parseFloat(counterAmount);
      const message = counterMessage;

      const { data: insertData, error } = await supabase
        .from('counter_offers')
        .insert({
          ride_request_id: id,
          by_user_id: currentUserId,
          amount,
          message,
          role: 'driver'
        })
        .select('*')
        .single();

      if (error) throw error;

      // Optimistic update so it appears immediately
      setOffers((prev) => [{
        ...insertData,
        profiles: null, // will be hydrated on refetch if visible
      }, ...prev]);

      // Notify rider about the new offer via email (server resolves recipient by profile id)
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', currentUserId)
        .single();

      await supabase.functions.invoke('send-offer-notification', {
        body: {
          actionType: 'new_offer',
          recipientProfileId: request.rider_id,
          senderName: senderProfile?.full_name || 'A driver',
          offerAmount: amount,
          tripId: id,
        },
      });

      toast({
        title: "Success",
        description: "Your offer has been submitted!",
      });
      setCounterAmount("");
      setCounterMessage("");
      
      // Refresh offers data
      await fetchOffers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleOfferAction = async (offerId: string, action: 'accepted' | 'rejected', offer: any) => {
    try {
      const { error } = await supabase
        .from('counter_offers')
        .update({ status: action })
        .eq('id', offerId);

      if (error) throw error;

      // Get current user profile for notifications
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('full_name, display_name')
        .eq('id', currentUserId)
        .single();

      // If accepted, update ride request with assigned driver and send notification
      if (action === 'accepted') {
      // Use atomic accept-ride function to prevent race conditions
        const { data: acceptData, error: acceptError } = await supabase.functions.invoke('accept-ride', {
          body: {
            rideId: id,
            driverId: offer.by_user_id,
            etaMinutes: 0, // Driver will provide ETA later
            skipEtaCheck: true,
            skipActiveRideCheck: true, // Allow accepting even if driver has another active ride
            acceptedOfferId: offerId // Pass the accepted offer ID to exclude from rejection
          },
        });

        if (acceptError || !acceptData?.success) {
          throw new Error(acceptData?.error || acceptData?.message || acceptError?.message || 'Failed to accept offer');
        }

        // Send email notification to the person whose offer was accepted
        await supabase.functions.invoke('send-offer-notification', {
          body: {
            actionType: 'accepted',
            recipientProfileId: offer.by_user_id,
            senderName: senderProfile?.full_name || senderProfile?.display_name || 'A user',
            offerAmount: offer.amount,
            tripId: id
          }
        });

        toast({
          title: "Offer Accepted",
          description: "Price agreed! Contact information is now visible.",
        });
      } else {
        // Send rejection notification
        await supabase.functions.invoke('send-offer-notification', {
          body: {
            actionType: 'rejected',
            recipientProfileId: offer.by_user_id,
            senderName: senderProfile?.full_name || senderProfile?.display_name || 'A user',
            offerAmount: offer.amount,
            tripId: id
          }
        });

        toast({
          title: "Offer Rejected",
          description: "The offer has been rejected.",
        });
      }

      // Refresh all data with proper cache invalidation
      await Promise.all([fetchOffers(), fetchTripData(), checkStatus()]);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleCounterOffer = async (originalOfferId: string) => {
    if (!counterAmount) return;

    setSubmitting(true);
    try {
      // Get the original offer info for notification
      const originalOffer = offers.find(o => o.id === originalOfferId);
      
      // Reject the original offer
      await supabase
        .from('counter_offers')
        .update({ status: 'rejected' })
        .eq('id', originalOfferId);

      // Create new counter offer from rider
      const { error } = await supabase
        .from('counter_offers')
        .insert({
          ride_request_id: id,
          by_user_id: currentUserId,
          amount: parseFloat(counterAmount),
          message: counterMessage || 'Counter offer',
          role: 'rider'
        });

      if (error) throw error;

      // Send email notification to the original offer maker using profile ID lookup
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', currentUserId)
        .single();

      await supabase.functions.invoke('send-offer-notification', {
        body: {
          actionType: 'countered',
          recipientProfileId: originalOffer?.by_user_id,
          senderName: senderProfile?.full_name || 'A user',
          offerAmount: parseFloat(counterAmount),
          tripId: id
        }
      });

      toast({
        title: "Counter Offer Sent",
        description: "Your counter offer has been sent!",
      });
      setCounterAmount("");
      setCounterMessage("");
      
      // Refresh offers and trip data
      await Promise.all([fetchOffers(), fetchTripData()]);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRatingSubmit = async (rating: number, comment?: string) => {
    try {
      // Prevent rating on cancelled trips
      if (request.status === 'cancelled') {
        toast({
          title: "Cannot Rate",
          description: "You cannot rate users on cancelled trips.",
          variant: "destructive",
        });
        return;
      }

      // Determine if current user is rating as rider or driver
      const updateField = isRider ? 'rider_rating' : 'driver_rating';
      const completionField = isRider ? 'rider_completed' : 'driver_completed';
      const ratingType = isRider ? 'driver' : 'rider';
      const ratedUserId = isRider ? request.assigned_driver_id : request.rider_id;

      // Double-check in database if rating already exists
      const { data: existingTrip } = await supabase
        .from('ride_requests')
        .select(updateField)
        .eq('id', id)
        .single();

      if (existingTrip?.[updateField]) {
        toast({
          title: "Already Rated",
          description: "You have already rated this trip.",
          variant: "destructive",
        });
        setShowRatingDialog(false);
        fetchTripData();
        return;
      }

      // Update the ride request with the rating AND mark as completed by this user
      // When first rating is submitted, mark trip as 'completed' (other user can still rate within 24h)
      const updates: any = { 
        [updateField]: rating,
        [completionField]: true,
        status: 'completed' // Always mark as completed when a rating is submitted
      };

      const { error: rideError } = await supabase
        .from('ride_requests')
        .update(updates)
        .eq('id', id);

      if (rideError) throw rideError;

      // CRITICAL: Immediately update the rated user's profile for real-time reflection
      // When rider rates driver: rider_rating affects driver's driver_rating_avg
      // When driver rates rider: driver_rating affects rider's rider_rating_avg
      const { data: ratedUserProfile } = await supabase
        .from('profiles')
        .select('rider_rating_avg, rider_rating_count, driver_rating_avg, driver_rating_count')
        .eq('id', ratedUserId)
        .single();

      if (ratedUserProfile) {
        // If current user is rider, they're rating the driver -> update driver's driver_rating
        // If current user is driver, they're rating the rider -> update rider's rider_rating
        const currentAvg = isRider 
          ? (ratedUserProfile.driver_rating_avg || 0) 
          : (ratedUserProfile.rider_rating_avg || 0);
        const currentCount = isRider
          ? (ratedUserProfile.driver_rating_count || 0)
          : (ratedUserProfile.rider_rating_count || 0);
        
        // Calculate new average
        const newCount = currentCount + 1;
        const newAvg = ((currentAvg * currentCount) + rating) / newCount;
        
        // Update profile directly for immediate reflection
        const profileUpdate = isRider
          ? { driver_rating_avg: parseFloat(newAvg.toFixed(2)), driver_rating_count: newCount }
          : { rider_rating_avg: parseFloat(newAvg.toFixed(2)), rider_rating_count: newCount };
        
        await supabase
          .from('profiles')
          .update(profileUpdate)
          .eq('id', ratedUserId);
      }

      // Get current user's name for notification
      const { data: currentUserProfile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', currentUserId)
        .single();

      // Send rating notification (async, don't block)
      supabase.functions.invoke('send-rating-notification', {
        body: {
          ratedUserId,
          raterName: currentUserProfile?.display_name || 'A user',
          rating,
          rideId: id,
          ratingType
        }
      }).catch(err => console.error('Notification error:', err));

      setShowRatingDialog(false);
      
      toast({
        title: "Thanks for your rating!",
        description: `You gave ${rating} star${rating > 1 ? 's' : ''}. Trip completed.`,
      });
      
      // CRITICAL: Refresh ALL data immediately (this refetches trip + profiles)
      await Promise.all([
        checkStatus(),
        fetchTripData()
      ]);
      
      // Secondary delayed refetch for UI consistency after trigger completes
      setTimeout(async () => {
        await fetchTripData();
      }, 1000);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">Loading...</div>;
  }

  if (!request) {
    return <div className="min-h-screen bg-background flex items-center justify-center">Trip not found</div>;
  }

  return (
    <div className="min-h-screen bg-background relative">
      {/* Animated Map Background */}
      <MapBackground showAnimatedCar showRiders intensity="subtle" className="fixed inset-0 z-0" />
      
      <div className="relative z-10">
      <AppHeader />
      <div className="max-w-4xl mx-auto p-4">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Trip Details</h1>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between flex-wrap gap-2">
              <span>Trip Information</span>
              <Badge variant={request.status === 'open' ? 'default' : 'secondary'}>
                {request.status}
              </Badge>
            </CardTitle>
            <CardDescription>
              Posted {new Date(request.created_at).toLocaleDateString()} at {new Date(request.created_at).toLocaleTimeString()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Rider Info */}
            {riderProfile && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <UserChip
                  userId={riderProfile.id}
                  fullName={riderProfile.full_name}
                  photoUrl={riderProfile.photo_url}
                  role="rider"
                  ratingAvg={riderProfile.rider_rating_avg}
                  ratingCount={riderProfile.rider_rating_count}
                  size="md"
                />
                {request.status === 'assigned' && request.assigned_driver_id === currentUserId && (
                  <div className="text-xs text-muted-foreground space-y-1 mt-2">
                    {riderProfile.email && <p>Email: {riderProfile.email}</p>}
                    {riderProfile.phone_number && <p>Phone: {riderProfile.phone_number}</p>}
                  </div>
                )}
              </div>
            )}
            
            {/* Driver Info */}
            {driverProfile && request.status === 'assigned' && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <UserChip
                  userId={driverProfile.id}
                  fullName={driverProfile.full_name}
                  photoUrl={driverProfile.photo_url}
                  role="driver"
                  ratingAvg={driverProfile.driver_rating_avg}
                  ratingCount={driverProfile.driver_rating_count}
                  size="md"
                />
                {request.status === 'assigned' && request.rider_id === currentUserId && (
                  <div className="text-xs text-muted-foreground space-y-1 mt-2">
                    {driverProfile.email && <p>Email: {driverProfile.email}</p>}
                    {driverProfile.phone_number && <p>Phone: {driverProfile.phone_number}</p>}
                  </div>
                )}
              </div>
            )}

            {request.pickup_time && (
              <div className="flex items-start gap-2">
                <Clock className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">Pickup Time</p>
                  <p className="text-sm text-muted-foreground">{new Date(request.pickup_time).toLocaleString()}</p>
                </div>
              </div>
            )}
            
            {request.passenger_count && (
              <div className="flex items-start gap-2">
                <Users className="h-5 w-5 text-purple-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">Passengers</p>
                  <p className="text-sm text-muted-foreground">
                    {request.passenger_count} {request.passenger_count === 1 ? 'passenger' : 'passengers'}
                  </p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-2">
              <MapPin className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">Pickup Location</p>
                <AddressLink 
                  address={request.pickup_address}
                  lat={request.pickup_lat}
                  lng={request.pickup_lng}
                  className="text-sm"
                />
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">Dropoff Location</p>
                <AddressLink 
                  address={request.dropoff_address}
                  lat={request.dropoff_lat}
                  lng={request.dropoff_lng}
                  isDestination={true}
                  className="text-sm"
                />
              </div>
            </div>
            {request.price_offer && (
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Rider's Initial Offer</p>
                    {!isEditing ? (
                      <p className="text-2xl font-bold text-primary">${request.price_offer}</p>
                    ) : (
                      <div className="flex items-center gap-2 mt-2">
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          value={editedOffer}
                          onChange={(e) => setEditedOffer(e.target.value)}
                          className="w-32"
                          placeholder="Amount"
                        />
                      </div>
                    )}
                  </div>
                  {isRider && request.status === 'open' && (
                    <div>
                      {!isEditing ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditedOffer(request.price_offer?.toString() || "");
                            setIsEditing(true);
                          }}
                        >
                          Edit Offer
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={async () => {
                              try {
                                const newAmount = parseFloat(editedOffer);
                                if (!newAmount || newAmount < 1) {
                                  toast({
                                    title: "Invalid Amount",
                                    description: "Please enter a valid dollar amount",
                                    variant: "destructive",
                                  });
                                  return;
                                }
                                
                                const { error } = await supabase
                                  .from('ride_requests')
                                  .update({ price_offer: newAmount })
                                  .eq('id', id);

                                if (error) throw error;

                                toast({
                                  title: "Success",
                                  description: "Initial offer updated",
                                });
                                setIsEditing(false);
                                fetchTripData();
                              } catch (error: any) {
                                toast({
                                  title: "Error",
                                  description: error.message,
                                  variant: "destructive",
                                });
                              }
                            }}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setIsEditing(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            {request.rider_note && request.status === 'assigned' && (
              <div className="pt-2 border-t">
                <p className="font-medium">Contact & Emergency Info</p>
                <p className="text-sm text-muted-foreground break-words whitespace-pre-wrap">{request.rider_note}</p>
              </div>
            )}
            {request.rider_note && request.status !== 'assigned' && (
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground italic">Contact information will be visible after price agreement</p>
              </div>
            )}
            
            {/* Actions for assigned or completed trips */}
            {(request.status === 'assigned' || request.status === 'completed') && (
              <>
                <div className="flex flex-col gap-2">
                  {/* Row 1: Open Chat button (full width on mobile, disabled after rating) */}
                  {request.status === 'assigned' && (
                    <Button 
                      onClick={() => navigate(`/chat/${id}`)}
                      className="w-full"
                      disabled={(isRider && request.rider_rating) || (!isRider && request.driver_rating)}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Open Chat
                    </Button>
                  )}
                  
                  {/* Row 2: Rate button or rated confirmation (full width on mobile) */}
                  {((isRider && !request.rider_rating) || (!isRider && !request.driver_rating)) && request.status !== 'cancelled' && (
                    <Button 
                      onClick={() => setShowRatingDialog(true)}
                      variant={request.status === 'completed' ? 'default' : 'outline'}
                      className="w-full"
                    >
                      Rate {isRider ? 'Driver' : 'Rider'}
                    </Button>
                  )}
                  {((isRider && request.rider_rating) || (!isRider && request.driver_rating)) && (
                    <Button 
                      variant="outline"
                      className="w-full"
                      disabled
                    >
                      ✓ Rated
                    </Button>
                  )}
                </div>
                
                {/* Completion status */}
                {(request.rider_completed || request.driver_completed) && (
                  <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                    <p className="text-sm font-medium text-primary mb-1">Completion Status</p>
                    <div className="flex gap-4 text-xs">
                      <span className={request.rider_completed ? "text-green-600" : "text-muted-foreground"}>
                        Rider: {request.rider_completed ? "✓ Confirmed" : "Pending"}
                      </span>
                      <span className={request.driver_completed ? "text-green-600" : "text-muted-foreground"}>
                        Driver: {request.driver_completed ? "✓ Confirmed" : "Pending"}
                      </span>
                    </div>
                  </div>
                )}
                
                {/* Call and Cancel buttons - disabled after rating */}
                {request.status === 'assigned' && (
                  <div className="flex flex-col gap-2 pt-2 border-t">
                    <MaskedCallButton
                      tripId={id!}
                      userRole={isRider ? "rider" : "driver"}
                      tripStatus={request.status}
                      disabled={(isRider && request.rider_rating) || (!isRider && request.driver_rating)}
                      className="w-full"
                    />
                    <Button
                      onClick={() => {
                        setActionType("cancel");
                        setActionDialogOpen(true);
                      }}
                      variant="destructive"
                      className="w-full"
                      disabled={(isRider && request.rider_rating) || (!isRider && request.driver_rating)}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Cancel Trip
                    </Button>
                  </div>
                )}
                
                {/* Show completion message if trip is completed and user hasn't rated */}
                {request.status === 'completed' && (
                  <>
                    <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                      <p className="text-sm font-medium text-primary mb-2">Trip Completed</p>
                      <p className="text-sm text-muted-foreground">
                        {((isRider && !request.rider_rating) || (!isRider && !request.driver_rating))
                          ? `Please rate the ${isRider ? 'driver' : 'rider'} to complete your part of this trip.`
                          : 'Thank you for rating! This trip is now complete.'}
                      </p>
                    </div>
                  </>
                )}
              </>
            )}
            
            {/* Admin Actions */}
            {isAdmin && (
              <div className="pt-4 border-t space-y-2">
                <p className="text-sm font-medium text-primary">Admin Actions</p>
                {['open', 'assigned', 'pending', 'matched', 'accepted', 'in_progress'].includes(request.status) ? (
                  <div className="flex flex-col sm:flex-row gap-2">
                    {request.status === 'assigned' && (
                      <Button
                        onClick={async () => {
                          try {
                            const { error } = await supabase
                              .from('ride_requests')
                              .update({ status: 'completed' })
                              .eq('id', id);
                            
                            if (error) throw error;
                            
                            toast({
                              title: "Success",
                              description: "Trip marked as completed",
                            });
                            fetchTripData();
                          } catch (error: any) {
                            toast({
                              title: "Error",
                              description: error.message,
                              variant: "destructive",
                            });
                          }
                        }}
                        variant="default"
                        className="flex-1"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Complete Trip
                      </Button>
                    )}
                    <Button
                      onClick={() => setAdminCancelDialogOpen(true)}
                      variant="destructive"
                      className="flex-1"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Cancel Ride
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Ride already finalized ({request.status}).
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <RatingDialog
          open={showRatingDialog}
          onOpenChange={setShowRatingDialog}
          onSubmit={handleRatingSubmit}
          title={`Rate ${isRider ? 'Driver' : 'Rider'}`}
          description="Please rate your experience with this trip"
        />

        <TripActionDialog
          request={request}
          open={actionDialogOpen}
          onOpenChange={setActionDialogOpen}
          action={actionType}
          userRole={isRider ? "rider" : "driver"}
          onSuccess={async () => {
            // Refresh subscription status to update trip counter
            await checkStatus();
            fetchTripData();
            if (actionType === "complete" || actionType === "cancel") {
              navigate(isRider ? "/rider" : "/driver");
            }
          }}
        />

        {/* Admin Cancel Dialog */}
        {isAdmin && request && (
          <AdminCancelRideDialog
            request={{
              id: request.id,
              status: request.status,
              rider_id: request.rider_id,
              assigned_driver_id: request.assigned_driver_id,
            }}
            open={adminCancelDialogOpen}
            onOpenChange={setAdminCancelDialogOpen}
            onSuccess={fetchTripData}
          />
        )}

        {/* Offers Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Driver Offers</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Show initial offer status if driver accepted at that price */}
            {request.status === 'assigned' && request.price_offer && offers.filter(o => o.role === 'driver' && o.status === 'accepted').length === 0 && (
              <Card className="mb-4 border-green-200 bg-green-50">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Initial Price Accepted</p>
                      <p className="text-sm text-muted-foreground">Driver accepted your initial offer</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-primary">${request.price_offer}</p>
                      <Badge variant="default">Accepted</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {offers.filter(o => o.role === 'driver').length === 0 && request.status === 'open' ? (
              <p className="text-center text-muted-foreground py-4">No driver offers yet</p>
            ) : (
              <div className="space-y-4">
                {offers.filter(o => o.role === 'driver').map((offer) => (
                  <Card key={offer.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1">
                          {offer.profiles ? (
                            <UserChip
                              userId={offer.by_user_id}
                              displayName={offer.profiles.display_name}
                              fullName={offer.profiles.full_name}
                              photoUrl={offer.profiles.photo_url}
                              role="driver"
                              ratingAvg={offer.profiles.driver_rating_avg}
                              ratingCount={offer.profiles.driver_rating_count}
                              size="md"
                            />
                          ) : (
                            <div className="flex items-start gap-3">
                              <Avatar className="h-12 w-12">
                                <AvatarFallback>
                                  {offer.by_user_id[0].toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium">{offer.by_user_id}</p>
                              </div>
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground mt-2">
                            {new Date(offer.created_at).toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {offer.role === 'driver' ? 'Driver Offer' : 'Rider Counter Offer'}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-2xl font-bold text-primary">${offer.amount}</p>
                          {(request.status !== 'assigned' || offer.status === 'accepted') && (
                            <Badge variant={
                              offer.status === 'accepted' ? 'default' :
                              offer.status === 'rejected' ? 'destructive' : 
                              'secondary'
                            }>
                              {offer.status}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {offer.message && (
                        <p className="text-sm mb-3">
                          {/* Convert "Accepting initial offer" to past tense for completed/assigned trips */}
                          {offer.message.toLowerCase().includes('accepting initial offer') && 
                           (request.status === 'completed' || request.status === 'assigned' || offer.status === 'accepted')
                            ? 'Accepted rider\'s initial offer'
                            : offer.message}
                        </p>
                      )}
                      {offer.status === 'pending' && request.status === 'open' && (
                        <div className="flex gap-2 flex-wrap">
                          {/* Rider can accept/reject driver offers */}
                          {isRider && offer.role === 'driver' && (
                            <>
                              <Button 
                                onClick={() => handleOfferAction(offer.id, 'accepted', offer)}
                                className="flex-1 min-w-[100px]"
                                disabled={request.status !== 'open'}
                              >
                                Accept ${offer.amount}
                              </Button>
                              <Button 
                                onClick={() => handleOfferAction(offer.id, 'rejected', offer)}
                                variant="destructive"
                                className="flex-1 min-w-[100px]"
                                disabled={request.status !== 'open'}
                              >
                                Reject
                              </Button>
                              <Button 
                                onClick={() => {
                                  document.getElementById('counter-form')?.scrollIntoView({ behavior: 'smooth' });
                                }}
                                variant="outline"
                                className="flex-1 min-w-[100px]"
                                disabled={request.status !== 'open'}
                              >
                                Counter Offer
                              </Button>
                            </>
                          )}
                          {/* Driver can accept rider counter offers */}
                          {!isRider && offer.role === 'rider' && (
                            <Button 
                              onClick={() => handleOfferAction(offer.id, 'accepted', offer)}
                              className="flex-1 min-w-[100px]"
                              disabled={request.status !== 'open'}
                            >
                              Accept ${offer.amount}
                            </Button>
                          )}
                          {/* Driver can delete their own pending offers, admins can delete any */}
                          {((!isRider && offer.by_user_id === currentUserId) || isAdmin) && (
                            <Button 
                              onClick={async () => {
                                try {
                                  const { error } = await supabase
                                    .from('counter_offers')
                                    .delete()
                                    .eq('id', offer.id);
                                  
                                  if (error) throw error;
                                  
                                  toast({
                                    title: "Offer Deleted",
                                    description: offer.by_user_id === currentUserId 
                                      ? "Your offer has been removed." 
                                      : "Offer has been removed by admin.",
                                  });
                                  fetchOffers();
                                } catch (error: any) {
                                  toast({
                                    title: "Error",
                                    description: error.message,
                                    variant: "destructive",
                                  });
                                }
                              }}
                              variant="destructive"
                              className="flex-1 min-w-[100px]"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Offer
                            </Button>
                          )}
                        </div>
                      )}
                      {request.status !== 'open' && offer.status === 'pending' && (
                        <div className="mt-3 p-2 bg-muted rounded text-sm text-muted-foreground">
                          This trip is no longer open for offers
                        </div>
                      )}
                      {offer.status === 'accepted' && (
                        <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                          <p className="text-sm font-medium text-green-800 dark:text-green-200">
                            ✓ This offer was accepted - Trip is now assigned
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Make Offer Form (for drivers) - only show if trip is open */}
        {!isRider && request.status === 'open' && (
          <Card id="counter-form">
            <CardHeader>
              <CardTitle>Make an Offer</CardTitle>
              <CardDescription>
                {request.price_offer 
                  ? `Rider's initial offer: $${request.price_offer}. Accept it or make a different offer.`
                  : 'Enter your price offer for this trip'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Driver earnings calculator removed from offer stage - only shown after trip completion per product requirement */}
              
              <form onSubmit={handleSubmitOffer} className="space-y-4">
                {request.price_offer && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={async () => {
                      setSubmitting(true);
                      try {
                        // Record acceptance as a driver offer (for history/visibility)
                        await supabase
                          .from('counter_offers')
                          .insert({
                            ride_request_id: id,
                            by_user_id: currentUserId,
                            amount: request.price_offer,
                            message: 'Accepting initial offer',
                            role: 'driver'
                          });

                        // Atomically assign the ride so others can no longer see/offer
                        const { data: acceptData, error: acceptError } = await supabase.functions.invoke('accept-ride', {
                          body: {
                            rideId: id,
                            driverId: currentUserId,
                            etaMinutes: 0,
                            skipEtaCheck: true,
                            skipActiveRideCheck: true,
                          },
                        });

                        if (acceptError || !acceptData?.success) {
                          throw new Error(acceptData?.error || acceptData?.message || 'Failed to accept offer');
                        }

                        toast({
                          title: 'Offer Accepted',
                          description: 'Trip assigned to you. Contact details are now visible.',
                        });
                        setCounterAmount('');
                        await fetchTripData();
                        fetchOffers();
                      } catch (error: any) {
                        toast({
                          title: 'Error',
                          description: error.message,
                          variant: 'destructive',
                        });
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                    disabled={submitting}
                  >
                    Accept ${request.price_offer}
                  </Button>
                )}
                <div className="relative">
                  <p className="text-sm text-center text-muted-foreground mb-2">or make a different offer</p>
                </div>
                <div>
                  <Label htmlFor="amount">Your Offer Amount (in dollars)</Label>
                  <Input 
                    id="amount"
                    type="number"
                    step="1"
                    min="1"
                    placeholder="Enter amount in dollars (e.g., 50)"
                    value={counterAmount}
                    onChange={(e) => setCounterAmount(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">Enter whole dollar amount (e.g., 50 for $50)</p>
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit Offer"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Counter Offer Form (for riders) - only show if trip is open */}
        {isRider && request.status === 'open' && offers.some(o => o.status === 'pending' && o.role === 'driver') && (
          <Card id="counter-form">
            <CardHeader>
              <CardTitle>Make a Counter Offer</CardTitle>
              <CardDescription>
                Review the offers above or propose a different price
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="counter-amount">Counter Offer Amount (in dollars)</Label>
                  <Input 
                    id="counter-amount"
                    type="number"
                    step="1"
                    min="1"
                    placeholder="Enter amount in dollars (e.g., 50)"
                    value={counterAmount}
                    onChange={(e) => setCounterAmount(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Enter whole dollar amount (e.g., 50 for $50)</p>
                </div>
                <Button
                  onClick={() => {
                    const pendingOffer = offers.find(o => o.status === 'pending' && o.role === 'driver');
                    if (pendingOffer) handleCounterOffer(pendingOffer.id);
                  }}
                  className="w-full" 
                  disabled={submitting || !counterAmount || request.status !== 'open'}
                >
                  {submitting ? "Submitting..." : "Submit Counter Offer"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Admin Trip Messages Section */}
        {isAdmin && request && (
          <AdminTripMessages 
            tripId={id!} 
            riderId={request.rider_id} 
            driverId={request.assigned_driver_id}
            tripStatus={request.status}
            cancelledBy={request.cancelled_by}
            cancelledAt={request.cancelled_at}
            cancelReasonCode={request.cancel_reason_code}
          />
        )}
      </div>
      </div>
    </div>
  );
}
