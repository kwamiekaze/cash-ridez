import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, MapPin, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

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

        toast({
          title: "Offer Accepted",
          description: "Opening chat...",
        });
        
        // Navigate to chat
        navigate(`/chat/${id}`);
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
            <CardTitle className="flex items-center justify-between">
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
            <div className="flex items-start gap-2">
              <MapPin className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Pickup Location</p>
                <p className="text-sm text-muted-foreground">{request.pickup_address}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Dropoff Location</p>
                <p className="text-sm text-muted-foreground">{request.dropoff_address}</p>
              </div>
            </div>
            <div className="pt-2 border-t">
              <p className="font-medium">Offered Price</p>
              <p className="text-2xl font-bold text-primary">${request.price_offer}</p>
            </div>
            {request.rider_note && (
              <div className="pt-2 border-t">
                <p className="font-medium">Additional Notes</p>
                <p className="text-sm text-muted-foreground">{request.rider_note}</p>
              </div>
            )}
            {request.status === 'assigned' && (
              <Button 
                onClick={() => navigate(`/chat/${id}`)}
                className="w-full"
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Open Chat
              </Button>
            )}
          </CardContent>
        </Card>

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
                          <p className="font-medium">{offer.profiles?.display_name || offer.profiles?.email}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(offer.created_at).toLocaleString()}
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

        {/* Make Offer Form (for drivers) or Counter Offer (for riders) */}
        {!isRider && request.status === 'open' && (
          <Card id="counter-form">
            <CardHeader>
              <CardTitle>Make an Offer</CardTitle>
              <CardDescription>Submit your price to complete this trip</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitOffer} className="space-y-4">
                <div>
                  <Label htmlFor="amount">Your Offer Amount ($)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Enter your offer"
                    value={counterAmount}
                    onChange={(e) => setCounterAmount(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="message">Message (Optional)</Label>
                  <Textarea
                    id="message"
                    placeholder="Add a message to your offer"
                    value={counterMessage}
                    onChange={(e) => setCounterMessage(e.target.value)}
                    rows={3}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit Offer"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {isRider && offers.some(o => o.status === 'pending') && (
          <Card id="counter-form">
            <CardHeader>
              <CardTitle>Make a Counter Offer</CardTitle>
              <CardDescription>Propose a different price</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="counter-amount">Counter Offer Amount ($)</Label>
                  <Input
                    id="counter-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Enter counter offer"
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
