import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, MapPin, MessageSquare, Clock, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { RatingDisplay } from "@/components/RatingDisplay";
import { RatingDialog } from "@/components/RatingDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import TripActionDialog from "@/components/TripActionDialog";

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
  const [calculatedPrice, setCalculatedPrice] = useState<number>(0);
  const [priceAgreed, setPriceAgreed] = useState(false);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<"complete" | "cancel">("complete");

  useEffect(() => {
    fetchTripData();
    getCurrentUser();

    // Subscribe to realtime updates for offers
    const channel = supabase
      .channel('counter-offers-changes')
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || null);
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 3959; // Earth radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const calculatePrice = (tripData: any) => {
    const distance = calculateDistance(
      tripData.pickup_lat,
      tripData.pickup_lng,
      tripData.dropoff_lat,
      tripData.dropoff_lng
    );
    const baseFare = 5;
    const ratePerMile = 2;
    return Math.round((baseFare + (distance * ratePerMile)) * 100) / 100;
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

      // Calculate estimated price
      const estimated = calculatePrice(tripData);
      setCalculatedPrice(estimated);

      // Check if price is agreed (status is assigned means offer was accepted)
      setPriceAgreed(tripData.status === 'assigned');

      const { data: { user } } = await supabase.auth.getUser();
      setIsRider(tripData.rider_id === user?.id);

      // Fetch rider profile - limited info if not assigned
      const riderFields = tripData.status === 'assigned' && tripData.assigned_driver_id === user?.id
        ? 'display_name, full_name, email, rider_rating_avg, rider_rating_count, phone_number, photo_url'
        : 'display_name, full_name, rider_rating_avg, rider_rating_count, photo_url';
      
      const { data: riderData } = await supabase
        .from('profiles')
        .select(riderFields)
        .eq('id', tripData.rider_id)
        .single();
      setRiderProfile(riderData);

      // Fetch driver profile if assigned
      if (tripData.assigned_driver_id) {
        const driverFields = tripData.status === 'assigned' && tripData.rider_id === user?.id
          ? 'display_name, full_name, email, driver_rating_avg, driver_rating_count, phone_number, photo_url'
          : 'display_name, full_name, driver_rating_avg, driver_rating_count, photo_url';
        
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
      const { data, error } = await supabase
        .from('counter_offers')
        .select(`
          *,
          profiles:by_user_id (display_name, email)
        `)
        .eq('ride_request_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOffers(data || []);
    } catch (error: any) {
      console.error('Error fetching offers:', error);
    }
  };

  const handleSubmitOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!counterAmount || !currentUserId) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('counter_offers')
        .insert({
          ride_request_id: id,
          by_user_id: currentUserId,
          amount: parseFloat(counterAmount),
          message: counterMessage,
          role: 'driver'
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Your offer has been submitted!",
      });
      setCounterAmount("");
      setCounterMessage("");
      fetchOffers();
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

      // If accepted, update ride request with assigned driver
      if (action === 'accepted') {
        const { error: rideError } = await supabase
          .from('ride_requests')
          .update({ 
            assigned_driver_id: offer.by_user_id,
            status: 'assigned'
          })
          .eq('id', id);

        if (rideError) throw rideError;

        setPriceAgreed(true);

        toast({
          title: "Offer Accepted",
          description: "Price agreed! Contact information is now visible.",
        });
      } else {
        toast({
          title: "Offer Rejected",
          description: "The offer has been rejected.",
        });
      }

      fetchOffers();
      fetchTripData();
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

      toast({
        title: "Counter Offer Sent",
        description: "Your counter offer has been sent!",
      });
      setCounterAmount("");
      setCounterMessage("");
      fetchOffers();
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
      // Determine if current user is rating as rider or driver
      const updateField = isRider ? 'rider_rating' : 'driver_rating';
      const otherUserId = isRider ? request.assigned_driver_id : request.rider_id;
      const profileField = isRider ? 'driver_rating_avg' : 'rider_rating_avg';
      const countField = isRider ? 'driver_rating_count' : 'rider_rating_count';

      // Update the ride request with the rating
      const { error: rideError } = await supabase
        .from('ride_requests')
        .update({ [updateField]: rating })
        .eq('id', id);

      if (rideError) throw rideError;

      // Fetch current profile stats
      const { data: profileData, error: fetchError } = await supabase
        .from('profiles')
        .select(profileField + ', ' + countField)
        .eq('id', otherUserId)
        .single();

      if (fetchError) throw fetchError;

      // Calculate new average
      const currentAvg = profileData?.[profileField] || 0;
      const currentCount = profileData?.[countField] || 0;
      const newCount = currentCount + 1;
      const newAvg = ((currentAvg * currentCount) + rating) / newCount;

      // Update profile with new rating
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          [profileField]: newAvg,
          [countField]: newCount
        })
        .eq('id', otherUserId);

      if (profileError) throw profileError;

      toast({
        title: "Rating Submitted",
        description: "Thank you for your feedback!",
      });

      fetchTripData();
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
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
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
            {/* Calculated Price Banner */}
            <div className="p-4 bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg border border-primary/20">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Calculated Trip Price</p>
                  <p className="text-3xl font-bold text-primary">${calculatedPrice.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Based on distance and base fare</p>
                </div>
                {priceAgreed && (
                  <Badge variant="default" className="bg-green-500">Price Agreed ✓</Badge>
                )}
              </div>
            </div>

            {/* Rider Info */}
            {riderProfile && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3 mb-2">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={riderProfile.photo_url} />
                    <AvatarFallback>
                      {(riderProfile.full_name || riderProfile.display_name || 'R')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">
                      Rider: {riderProfile.full_name || riderProfile.display_name || 'Anonymous'}
                    </p>
                    {riderProfile.rider_rating_count > 0 && (
                      <RatingDisplay 
                        rating={riderProfile.rider_rating_avg} 
                        count={riderProfile.rider_rating_count}
                        size="sm"
                      />
                    )}
                  </div>
                </div>
                {priceAgreed && request.assigned_driver_id === currentUserId && riderProfile.email && (
                  <p className="text-xs text-muted-foreground">Contact: {riderProfile.email}</p>
                )}
              </div>
            )}
            
            {/* Driver Info */}
            {driverProfile && request.status === 'assigned' && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3 mb-2">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={driverProfile.photo_url} />
                    <AvatarFallback>
                      {(driverProfile.full_name || driverProfile.display_name || 'D')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">
                      Driver: {driverProfile.full_name || driverProfile.display_name || 'Anonymous'}
                    </p>
                    {driverProfile.driver_rating_count > 0 && (
                      <RatingDisplay 
                        rating={driverProfile.driver_rating_avg} 
                        count={driverProfile.driver_rating_count}
                        size="sm"
                      />
                    )}
                  </div>
                </div>
                {priceAgreed && request.rider_id === currentUserId && driverProfile.email && (
                  <p className="text-xs text-muted-foreground">Contact: {driverProfile.email}</p>
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
            <div className="flex items-start gap-2">
              <MapPin className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">Pickup Location</p>
                <p className="text-sm text-muted-foreground break-words">{request.pickup_address}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">Dropoff Location</p>
                <p className="text-sm text-muted-foreground break-words">{request.dropoff_address}</p>
              </div>
            </div>
            {request.price_offer && (
              <div className="pt-2 border-t">
                <p className="font-medium">Rider's Initial Offer</p>
                <p className="text-2xl font-bold text-primary">${request.price_offer}</p>
              </div>
            )}
            {request.rider_note && priceAgreed && (
              <div className="pt-2 border-t">
                <p className="font-medium">Contact & Emergency Info</p>
                <p className="text-sm text-muted-foreground break-words whitespace-pre-wrap">{request.rider_note}</p>
              </div>
            )}
            {request.rider_note && !priceAgreed && (
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground italic">Contact information will be visible after price agreement</p>
              </div>
            )}
            
            {/* Actions for assigned trips */}
            {request.status === 'assigned' && priceAgreed && (
              <>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button 
                    onClick={() => navigate(`/chat/${id}`)}
                    className="flex-1"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Open Chat
                  </Button>
                  {((isRider && !request.rider_rating) || (!isRider && !request.driver_rating)) && (
                    <Button 
                      onClick={() => setShowRatingDialog(true)}
                      variant="outline"
                      className="flex-1"
                    >
                      Rate {isRider ? 'Driver' : 'Rider'}
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
                
                {/* Complete/Cancel buttons */}
                <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
                  <Button
                    onClick={() => {
                      setActionType("complete");
                      setActionDialogOpen(true);
                    }}
                    variant="default"
                    className="flex-1 bg-gradient-primary"
                    disabled={
                      (isRider && request.rider_completed) || 
                      (!isRider && request.driver_completed)
                    }
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {(isRider && request.rider_completed) || (!isRider && request.driver_completed) 
                      ? "Marked Complete" 
                      : "Mark Complete"}
                  </Button>
                  <Button
                    onClick={() => {
                      setActionType("cancel");
                      setActionDialogOpen(true);
                    }}
                    variant="destructive"
                    className="flex-1"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancel Trip
                  </Button>
                </div>
              </>
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
          onSuccess={() => {
            fetchTripData();
            if (actionType === "complete" || actionType === "cancel") {
              navigate(isRider ? "/rider" : "/driver");
            }
          }}
        />

        {/* Offers Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Offers ({offers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {offers.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No offers yet</p>
            ) : (
              <div className="space-y-4">
                {offers.map((offer) => (
                  <Card key={offer.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-medium">{offer.profiles?.display_name || 'User'}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(offer.created_at).toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Role: {offer.role === 'driver' ? 'Driver Offer' : 'Rider Counter'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-primary">${offer.amount}</p>
                          <Badge variant={
                            offer.status === 'accepted' ? 'default' :
                            offer.status === 'rejected' ? 'destructive' : 
                            'secondary'
                          }>
                            {offer.status}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-1">
                            {offer.amount > calculatedPrice ? `+$${(offer.amount - calculatedPrice).toFixed(2)}` : 
                             offer.amount < calculatedPrice ? `-$${(calculatedPrice - offer.amount).toFixed(2)}` : 
                             'Matches calculated'}
                          </p>
                        </div>
                      </div>
                      {offer.message && (
                        <p className="text-sm mb-3">{offer.message}</p>
                      )}
                      {isRider && offer.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button 
                            onClick={() => handleOfferAction(offer.id, 'accepted', offer)}
                            className="flex-1"
                          >
                            Accept
                          </Button>
                          <Button 
                            onClick={() => handleOfferAction(offer.id, 'rejected', offer)}
                            variant="destructive"
                            className="flex-1"
                          >
                            Reject
                          </Button>
                          <Button 
                            onClick={() => {
                              // Show counter offer form
                              document.getElementById('counter-form')?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            variant="outline"
                            className="flex-1"
                          >
                            Counter
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Make Offer Form (for drivers) */}
        {!isRider && request.status === 'open' && (
          <Card id="counter-form">
            <CardHeader>
              <CardTitle>Make an Offer</CardTitle>
              <CardDescription>
                Calculated price: ${calculatedPrice.toFixed(2)} - You can accept this or make a different offer
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitOffer} className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCounterAmount(calculatedPrice.toString());
                      setCounterMessage("Accepting the calculated price");
                    }}
                  >
                    Accept ${calculatedPrice.toFixed(2)}
                  </Button>
                </div>
                <div>
                  <Label htmlFor="amount">Your Offer Amount ($)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder={calculatedPrice.toFixed(2)}
                    value={counterAmount}
                    onChange={(e) => setCounterAmount(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="message">Message (Optional)</Label>
                  <Textarea
                    id="message"
                    placeholder="Add a message to your offer..."
                    value={counterMessage}
                    onChange={(e) => setCounterMessage(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit Offer"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Counter Offer Form (for riders) */}
        {isRider && offers.some(o => o.status === 'pending') && (
          <Card id="counter-form">
            <CardHeader>
              <CardTitle>Make a Counter Offer</CardTitle>
              <CardDescription>
                Calculated price: ${calculatedPrice.toFixed(2)} - Propose a different price or accept a driver's offer above
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCounterAmount(calculatedPrice.toString());
                      setCounterMessage("Accepting the calculated price");
                    }}
                  >
                    Use Calculated ${calculatedPrice.toFixed(2)}
                  </Button>
                </div>
                <div>
                  <Label htmlFor="counter-amount">Counter Offer Amount ($)</Label>
                  <Input
                    id="counter-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={calculatedPrice.toFixed(2)}
                    value={counterAmount}
                    onChange={(e) => setCounterAmount(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="counter-message">Message (Optional)</Label>
                  <Textarea
                    id="counter-message"
                    placeholder="Explain your counter offer"
                    value={counterMessage}
                    onChange={(e) => setCounterMessage(e.target.value)}
                    rows={3}
                  />
                </div>
                <Button 
                  onClick={() => {
                    const pendingOffer = offers.find(o => o.status === 'pending');
                    if (pendingOffer) handleCounterOffer(pendingOffer.id);
                  }}
                  className="w-full" 
                  disabled={submitting || !counterAmount}
                >
                  {submitting ? "Submitting..." : "Submit Counter Offer"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
