import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { ArrowLeft, MapPin, Clock, DollarSign, Users } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { format } from "date-fns";
import { toast } from "sonner";
import { z } from "zod";
import AppHeader from "@/components/AppHeader";
import { MapBackground } from "@/components/MapBackground";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { estimateFromMilesOnly, estimateCompetitorDriverEarnings } from "@/utils/fareEstimator";

// Sanitize HTML and dangerous characters to prevent XSS
const sanitizeHtml = (str: string) => 
  str.replace(/<[^>]*>/g, '').replace(/[<>"']/g, (char) => {
    const entities: Record<string, string> = { '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return entities[char] || char;
  });

const rideRequestSchema = z.object({
  pickupAddress: z.string().trim().transform(sanitizeHtml).pipe(
    z.string().min(1, "Pickup address is required").max(500, "Pickup address must be less than 500 characters")
  ),
  dropoffAddress: z.string().trim().transform(sanitizeHtml).pipe(
    z.string().min(1, "Dropoff address is required").max(500, "Dropoff address must be less than 500 characters")
  ),
  pickupTime: z.string().optional(),
  contactInfo: z.string().trim().transform(sanitizeHtml).pipe(
    z.string().min(1, "Contact info is required").max(200, "Contact info must be less than 200 characters")
  ),
  emergencyName: z.string().transform(sanitizeHtml).pipe(
    z.string().max(100, "Name must be less than 100 characters")
  ).optional(),
  emergencyPhone: z.string().trim().max(20, "Phone must be less than 20 characters").optional(),
  priceOffer: z.string().min(1, "Price offer is required").refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num > 0 && num <= 9999;
  }, "Price must be between $1 and $9999"),
});

const CreateRideRequest = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [canCreateTrip, setCanCreateTrip] = useState(false);

  const handleSaveContact = () => {
    const vCard = `BEGIN:VCARD
VERSION:3.0
FN:Cash Ridez Connect LLC
TEL;TYPE=CELL:+16789288816
END:VCARD`;
    
    const blob = new Blob([vCard], { type: 'text/vcard' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'CashRidezConnect.vcf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    toast.success("Contact file downloaded! Open it to save to your phone.");
  };

  useEffect(() => {
    const checkVerification = async () => {
      if (!user) return;
      
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      
      setProfile(profileData);
      
      // Check if user is set as driver - redirect them
      if (profileData?.active_role === 'driver') {
        toast.error("You're currently set as a driver. Access this feature from your profile settings.");
        navigate("/trips");
        return;
      }
      
      if (!profileData?.is_verified && profileData?.verification_status !== 'approved') {
        toast.error("You must be verified to post trip requests");
        navigate("/dashboard");
        return;
      }

      // Check subscription and trip limit
      const subscriptionActive = profileData?.subscription_active || false;
      const connectedTrips = profileData?.connected_trips_count || 0;
      const canCreate = subscriptionActive || connectedTrips < 3;
      setCanCreateTrip(canCreate);

      if (!canCreate) {
        toast.error("You've reached your free connected trip limit. Please subscribe to continue.");
        navigate("/subscription");
        return;
      }
      
      setLoading(false);
    };
    
    checkVerification();
  }, [user, navigate]);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [formData, setFormData] = useState({
    pickupAddress: "",
    dropoffAddress: "",
    pickupTime: "",
    contactInfo: "",
    emergencyName: "",
    emergencyPhone: "",
    priceOffer: "",
    passengerCount: "1",
    tripDetails: "",
  });
  
  // Estimate distance based on addresses (rough estimate for Georgia/Atlanta area)
  const estimatedDistance = useMemo(() => {
    if (!formData.pickupAddress || !formData.dropoffAddress) return null;
    // Rough estimate: assume 15-25 miles for typical metro trip
    // In production, use Google Maps Distance Matrix API
    const hasValidAddresses = formData.pickupAddress.length > 5 && formData.dropoffAddress.length > 5;
    if (!hasValidAddresses) return null;
    // Base estimate on address complexity - more detailed addresses suggest longer trips
    const avgLength = (formData.pickupAddress.length + formData.dropoffAddress.length) / 2;
    return Math.max(5, Math.min(50, avgLength * 0.3)); // 5-50 miles range
  }, [formData.pickupAddress, formData.dropoffAddress]);

  // Calculate fare estimates for saving to database using new range-based API
  const fareEstimates = useMemo(() => {
    if (!estimatedDistance || !formData.priceOffer) return null;
    const price = parseFloat(formData.priceOffer);
    if (isNaN(price) || price <= 0) return null;
    
    const estimate = estimateFromMilesOnly(estimatedDistance, new Date());
    const driverEarnings = estimateCompetitorDriverEarnings(estimate.midFare);
    
    return {
      min: estimate.minFare,
      max: estimate.maxFare,
      mid: estimate.midFare,
      driverEarnings,
    };
  }, [estimatedDistance, formData.priceOffer]);

  const geocodeAddress = async (address: string) => {
    // Mock geocoding - in production, use Google Maps or Mapbox API
    return {
      lat: 40.7128,
      lng: -74.006,
      zip: "10001",
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return; // Guard against double submit
    setIsSubmitting(true);

    try {
      // 1) Validate form first to avoid unnecessary network calls
      const validationResult = rideRequestSchema.safeParse(formData);
      if (!validationResult.success) {
        const firstError = validationResult.error.errors[0];
        toast.error(firstError.message);
        setIsSubmitting(false);
        return;
      }

      // 2) Validate pickup time if provided
      if (formData.pickupTime) {
        const pickupDate = new Date(formData.pickupTime);
        const now = new Date();
        if (isNaN(pickupDate.getTime())) {
          toast.error("Invalid pickup time format");
          setIsSubmitting(false);
          return;
        }
        if (pickupDate < now) {
          toast.error("Pickup time cannot be in the past");
          setIsSubmitting(false);
          return;
        }
      }

      // 3) Run trip-limit queries in parallel and use COUNT for speed
      const userId = user?.id as string;
      const openPromise = supabase
        .from("ride_requests")
        .select("id", { count: "exact", head: true })
        .eq("rider_id", userId)
        .eq("status", "open");
      const assignedPromise = supabase
        .from("ride_requests")
        .select("id", { count: "exact", head: true })
        .or(`rider_id.eq.${userId},assigned_driver_id.eq.${userId}`)
        .eq("status", "assigned");

      const [openRes, assignedRes] = await Promise.all([openPromise, assignedPromise]);
      if (openRes.error) throw openRes.error;
      if (assignedRes.error) throw assignedRes.error;

      const openCount = openRes.count ?? 0;
      const assignedCount = assignedRes.count ?? 0;

      if (openCount >= 2) {
        toast.error("You can have a maximum of 2 open trip requests at a time.");
        setIsSubmitting(false);
        return;
      }
      if (assignedCount >= 1) {
        toast.error("You already have a connected trip. Please complete or cancel it before creating a new one.");
        setIsSubmitting(false);
        return;
      }

      // 4) Check account status using already-fetched profile where possible
      let currentProfile = profile as any;
      if (!currentProfile) {
        const { data: profData, error: profileError } = await supabase
          .from("profiles")
          .select("paused, subscription_active, completed_trips_count")
          .eq("id", userId)
          .maybeSingle();
        if (profileError) throw profileError;
        currentProfile = profData;
      }

      if (currentProfile?.paused) {
        toast.error("Your account is currently paused. Please contact support to reactivate it.");
        setIsSubmitting(false);
        return;
      }
      if (!currentProfile?.subscription_active && (currentProfile?.connected_trips_count ?? 0) >= 3) {
        toast.error("You have reached your free connected trip limit. Please subscribe to continue creating trip requests.");
        setIsSubmitting(false);
        navigate("/subscription");
        return;
      }

      // 5) Geocode addresses (stubbed) and build keywords
      const pickupGeo = await geocodeAddress(formData.pickupAddress.trim());
      const dropoffGeo = await geocodeAddress(formData.dropoffAddress.trim());

      const sanitizeForKeywords = (text: string) =>
        text.trim().toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((k) => k.length > 2);
      const keywords = [
        ...sanitizeForKeywords(formData.pickupAddress),
        ...sanitizeForKeywords(formData.dropoffAddress),
        ...(formData.contactInfo ? sanitizeForKeywords(formData.contactInfo) : []),
      ];

      // 6) Create the trip with fare estimates
      const tripInsert: any = {
        rider_id: userId,
        pickup_address: formData.pickupAddress.trim(),
        pickup_lat: pickupGeo.lat,
        pickup_lng: pickupGeo.lng,
        pickup_zip: pickupGeo.zip,
        dropoff_address: formData.dropoffAddress.trim(),
        dropoff_lat: dropoffGeo.lat,
        dropoff_lng: dropoffGeo.lng,
        dropoff_zip: dropoffGeo.zip,
        pickup_time: formData.pickupTime ? new Date(formData.pickupTime).toISOString() : new Date().toISOString(),
        rider_note: [
          formData.tripDetails ? `Trip Details: ${formData.tripDetails.trim()}` : null,
          formData.contactInfo ? `Contact: ${formData.contactInfo.trim()}` : null,
          formData.emergencyName ? `Emergency: ${formData.emergencyName} - ${formData.emergencyPhone}` : null
        ].filter(Boolean).join(' | ') || null,
        rider_note_image_url: null,
        price_offer: parseFloat(formData.priceOffer),
        passenger_count: parseInt(formData.passengerCount),
        search_keywords: keywords,
        status: "open",
      };
      
      // Add fare estimates if available
      if (fareEstimates) {
        tripInsert.estimated_competitor_fare_min = fareEstimates.min;
        tripInsert.estimated_competitor_fare_max = fareEstimates.max;
        tripInsert.estimated_competitor_fare_mid = fareEstimates.mid;
        tripInsert.estimated_competitor_driver_earnings = fareEstimates.driverEarnings;
      }
      
      const { data: newTrip, error } = await supabase
        .from("ride_requests")
        .insert(tripInsert)
        .select()
        .single();
      if (error) throw error;

      // 7) Fire-and-forget notifications (non-blocking)
      if (newTrip) {
        supabase.functions
          .invoke('send-new-trip-notification', {
            body: { ride_request_id: newTrip.id, rider_id: userId, pickup_zip: pickupGeo.zip },
          })
          .then((result) => {
            console.log('✅ New trip notification response:', result);
          })
          .catch((err) => {
            console.error('❌ Error sending new trip notifications:', err);
          });
      }

      toast.success("Trip request created!");
      // Navigate immediately for snappier UX; the Rider page can refresh on mount
      navigate("/rider", { state: { refreshRequests: true, newRequestId: newTrip?.id, timestamp: Date.now() } });
    } catch (error: any) {
      const raw = typeof error?.message === 'string' ? error.message : String(error);
      if (/load failed|failed to fetch|network/i.test(raw)) {
        toast.error("Network issue while creating your trip. Please try again.");
      } else {
        toast.error(raw || "Failed to create trip request");
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative">
      {/* Animated Map Background */}
      <MapBackground showAnimatedCar showRiders intensity="subtle" className="fixed inset-0 z-0" />
      
      <div className="relative z-10">
        <AppHeader />
        
        <div className="container mx-auto px-4 py-8">
        <Card className="max-w-2xl mx-auto p-8">
          <h1 className="text-3xl font-bold mb-6">Create Trip Request</h1>
          <p className="text-sm text-muted-foreground mb-6 text-center">
            Post your travel plans to connect with drivers in the community. For easy in app calling save{' '}
            <button
              type="button"
              onClick={handleSaveContact}
              className="text-warning hover:text-warning/80 font-semibold underline decoration-warning/50 hover:decoration-warning transition-colors cursor-pointer"
            >
              +1 (678) 928-8816
            </button>
            {' '}to your contact list.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <Label className="text-sm text-muted-foreground whitespace-nowrap">Pickup Time (optional)</Label>
              {/* Date/Time Picker Button */}
              <Button
                type="button"
                variant="ghost"
                className="h-12 w-12 rounded-full hover:bg-accent/50 transition-colors p-0"
                onClick={() => setPopoverOpen(true)}
              >
                <Clock className="h-6 w-6 text-warning" />
              </Button>

              {/* Mobile: Full-screen Dialog */}
              {isMobile ? (
                <Dialog open={popoverOpen} onOpenChange={setPopoverOpen}>
                  <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-auto p-0">
                    <DialogHeader className="p-4 pb-0">
                      <DialogTitle>Select Pickup Date & Time</DialogTitle>
                    </DialogHeader>
                    <div className="p-4 space-y-4">
                      <Calendar
                        mode="single"
                        selected={formData.pickupTime ? new Date(formData.pickupTime) : undefined}
                        onSelect={(date) => {
                          if (date) {
                            const timeStr = formData.pickupTime ? formData.pickupTime.split('T')[1] : '12:00';
                            const dateStr = format(date, 'yyyy-MM-dd');
                            setFormData({ ...formData, pickupTime: `${dateStr}T${timeStr}` });
                          }
                        }}
                        disabled={(date) => date < new Date()}
                        initialFocus
                        className="pointer-events-auto rounded-md border"
                      />
                      <div className="space-y-2">
                        <Label htmlFor="time-mobile" className="text-sm text-center block">Time</Label>
                        <Input
                          id="time-mobile"
                          type="time"
                          value={formData.pickupTime ? formData.pickupTime.split('T')[1] : ''}
                          onChange={(e) => {
                            const dateStr = formData.pickupTime ? formData.pickupTime.split('T')[0] : format(new Date(), 'yyyy-MM-dd');
                            setFormData({ ...formData, pickupTime: `${dateStr}T${e.target.value}` });
                          }}
                          className="h-12 w-full text-base text-center border-0 bg-transparent focus:ring-0 focus-visible:ring-0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Button
                          type="button"
                          variant="default"
                          className="w-full h-12"
                          onClick={() => setPopoverOpen(false)}
                        >
                          Set
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full h-12"
                          onClick={() => {
                            setFormData({ ...formData, pickupTime: '' });
                            setPopoverOpen(false);
                          }}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              ) : (
                /* Desktop: Popover */
                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                  <PopoverTrigger asChild>
                    <span className="hidden" />
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background border shadow-lg z-50" side="bottom" align="center" sideOffset={8} avoidCollisions={true} collisionPadding={20}>
                    <div className="p-4 space-y-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Select Pickup Date & Time</Label>
                        <Calendar
                          mode="single"
                          selected={formData.pickupTime ? new Date(formData.pickupTime) : undefined}
                          onSelect={(date) => {
                            if (date) {
                              const timeStr = formData.pickupTime ? formData.pickupTime.split('T')[1] : '12:00';
                              const dateStr = format(date, 'yyyy-MM-dd');
                              setFormData({ ...formData, pickupTime: `${dateStr}T${timeStr}` });
                            }
                          }}
                          disabled={(date) => date < new Date()}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="time-desktop" className="text-sm text-center block">Time</Label>
                        <Input
                          id="time-desktop"
                          type="time"
                          value={formData.pickupTime ? formData.pickupTime.split('T')[1] : ''}
                          onChange={(e) => {
                            const dateStr = formData.pickupTime ? formData.pickupTime.split('T')[0] : format(new Date(), 'yyyy-MM-dd');
                            setFormData({ ...formData, pickupTime: `${dateStr}T${e.target.value}` });
                          }}
                          className="h-12 w-full text-base text-center border-0 bg-transparent focus:ring-0 focus-visible:ring-0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Button
                          type="button"
                          variant="default"
                          className="w-full h-12"
                          onClick={() => setPopoverOpen(false)}
                        >
                          Set
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full h-12"
                          onClick={() => {
                            setFormData({ ...formData, pickupTime: '' });
                            setPopoverOpen(false);
                          }}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {formData.pickupTime && (
                <p className="text-sm text-muted-foreground">
                  {format(new Date(formData.pickupTime), "MMM d, yyyy 'at' h:mm a")}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pickup">Pickup Address *</Label>
              <AddressAutocomplete
                id="pickup"
                placeholder="5380 Peachtree Blvd, Atlanta, GA 30341"
                required
                value={formData.pickupAddress}
                onChange={(value) => setFormData({ ...formData, pickupAddress: value })}
                icon="pickup"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dropoff">Dropoff Address *</Label>
              <AddressAutocomplete
                id="dropoff"
                placeholder="233 Peachtree St NE, Atlanta, GA 30303"
                required
                value={formData.dropoffAddress}
                onChange={(value) => setFormData({ ...formData, dropoffAddress: value })}
                icon="dropoff"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="passengers">Number of Passengers *</Label>
                <div className="relative">
                  <Users className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="passengers"
                    type="number"
                    placeholder="1"
                    className="pl-10"
                    min="1"
                    max="8"
                    required
                    value={formData.passengerCount}
                    onChange={(e) => setFormData({ ...formData, passengerCount: e.target.value })}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="offer">Price Offer *</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="offer"
                    type="number"
                    placeholder="50"
                    className="pl-10"
                    step="1"
                    min="1"
                    required
                    value={formData.priceOffer}
                    onChange={(e) => setFormData({ ...formData, priceOffer: e.target.value })}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Enter whole dollar amount (e.g., 50 for $50)</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tripDetails">Trip Details (Optional)</Label>
              <Textarea
                id="tripDetails"
                placeholder="Add any specific details about your trip that drivers should know..."
                className="min-h-[80px]"
                value={formData.tripDetails}
                onChange={(e) => setFormData({ ...formData, tripDetails: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Share any additional information about your trip
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact">Contact Number *</Label>
              <Input
                id="contact"
                placeholder="Contact number"
                required
                value={formData.contactInfo}
                onChange={(e) => setFormData({ ...formData, contactInfo: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="emergency-name">Emergency Contact Name (Optional)</Label>
                <Input
                  id="emergency-name"
                  placeholder="Emergency contact name"
                  value={formData.emergencyName}
                  onChange={(e) => setFormData({ ...formData, emergencyName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emergency-phone">Emergency Contact Number (Optional)</Label>
                <Input
                  id="emergency-phone"
                  type="tel"
                  placeholder="Emergency contact number"
                  value={formData.emergencyPhone}
                  onChange={(e) => setFormData({ ...formData, emergencyPhone: e.target.value })}
                />
              </div>
            </div>

            {/* Calculator removed - only shown after trip acceptance per product requirement */}

            <Button type="submit" className="w-full bg-gradient-primary text-background font-semibold hover:opacity-90 transition-opacity" size="lg" disabled={isSubmitting}>
              {isSubmitting ? "Creating Request..." : "Create Trip Request"}
            </Button>
            
            <p className="text-xs text-muted-foreground text-center mt-4">
              By posting, you acknowledge that CashRidez is a communication platform and all travel arrangements are made independently between users.
            </p>
          </form>
        </Card>
      </div>
      </div>
    </div>
  );
};

export default CreateRideRequest;
