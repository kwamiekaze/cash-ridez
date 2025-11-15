import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, MapPin, Clock, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import AppHeader from "@/components/AppHeader";
import { MapBackground } from "@/components/MapBackground";

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
      
      setLoading(false);
    };
    
    checkVerification();
  }, [user, navigate]);
  const [formData, setFormData] = useState({
    pickupAddress: "",
    dropoffAddress: "",
    pickupTime: "",
    contactInfo: "",
    emergencyName: "",
    emergencyPhone: "",
    priceOffer: "",
  });

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
      if (!currentProfile?.subscription_active && (currentProfile?.completed_trips_count ?? 0) >= 3) {
        toast.error("You have reached your free trip limit. Please subscribe to continue creating trip requests.");
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

      // 6) Create the trip
      const { data: newTrip, error } = await supabase
        .from("ride_requests")
        .insert({
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
          rider_note: formData.contactInfo ? `Contact: ${formData.contactInfo.trim()}${formData.emergencyName ? ` | Emergency: ${formData.emergencyName} - ${formData.emergencyPhone}` : ''}` : null,
          rider_note_image_url: null,
          price_offer: parseFloat(formData.priceOffer),
          search_keywords: keywords,
          status: "open",
        })
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
          <p className="text-sm text-muted-foreground mb-6">
            Post your travel plans to connect with others in the community who can help coordinate your trip.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="pickup">Pickup Address *</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-success" />
                <Input
                  id="pickup"
                  placeholder="123 Main St, New York, NY 10001"
                  className="pl-10"
                  required
                  value={formData.pickupAddress}
                  onChange={(e) => setFormData({ ...formData, pickupAddress: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dropoff">Dropoff Address *</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-destructive" />
                <Input
                  id="dropoff"
                  placeholder="456 Park Ave, New York, NY 10022"
                  className="pl-10"
                  required
                  value={formData.dropoffAddress}
                  onChange={(e) => setFormData({ ...formData, dropoffAddress: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="time">Pickup Time (Optional)</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="time"
                  type="datetime-local"
                  className="pl-10"
                  value={formData.pickupTime}
                  onChange={(e) => setFormData({ ...formData, pickupTime: e.target.value })}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Leave empty for immediate pickup request
              </p>
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

            <div className="space-y-2">
              <Label htmlFor="contact">Contact Info *</Label>
              <Input
                id="contact"
                placeholder="Phone number or preferred contact method"
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

            <Button type="submit" className="w-full bg-gradient-primary" size="lg" disabled={isSubmitting}>
              {isSubmitting ? "Creating Request..." : "Create Trip Request"}
            </Button>
            
            <p className="text-xs text-muted-foreground text-center mt-4">
              By posting, you acknowledge that CashRidez is a communication platform and all travel arrangements are made independently between users.
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default CreateRideRequest;
