import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, MapPin, Clock, DollarSign, Upload } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const rideRequestSchema = z.object({
  pickupAddress: z.string().trim().min(1, "Pickup address is required").max(500, "Pickup address must be less than 500 characters"),
  dropoffAddress: z.string().trim().min(1, "Dropoff address is required").max(500, "Dropoff address must be less than 500 characters"),
  pickupTime: z.string().min(1, "Pickup time is required"),
  riderNote: z.string().max(2000, "Note must be less than 2000 characters").optional(),
  priceOffer: z.string().optional().refine((val) => {
    if (!val || val === "") return true;
    const num = parseFloat(val);
    return !isNaN(num) && num >= 0 && num <= 9999;
  }, "Price must be between $0 and $9999"),
});

const CreateRideRequest = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    pickupAddress: "",
    dropoffAddress: "",
    pickupTime: "",
    riderNote: "",
    priceOffer: "",
  });
  const [noteImage, setNoteImage] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File must be less than 5MB");
        return;
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        toast.error("Only JPG, PNG, and WebP allowed");
        return;
      }
      setNoteImage(file);
    }
  };

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
    setIsSubmitting(true);

    try {
      // Validate form data
      const validationResult = rideRequestSchema.safeParse(formData);
      if (!validationResult.success) {
        const firstError = validationResult.error.errors[0];
        toast.error(firstError.message);
        setIsSubmitting(false);
        return;
      }

      // Validate pickup time is in the future
      const pickupDate = new Date(formData.pickupTime);
      if (pickupDate <= new Date()) {
        toast.error("Pickup time must be in the future");
        setIsSubmitting(false);
        return;
      }

      // Geocode addresses
      const pickupGeo = await geocodeAddress(formData.pickupAddress.trim());
      const dropoffGeo = await geocodeAddress(formData.dropoffAddress.trim());

      let noteImageUrl = null;
      if (noteImage) {
        const fileExt = noteImage.name.split(".").pop();
        const filePath = `${user?.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("ride-notes")
          .upload(filePath, noteImage);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("ride-notes").getPublicUrl(filePath);
        noteImageUrl = publicUrl;
      }

      // Create search keywords - sanitize and filter
      const sanitizeForKeywords = (text: string) => 
        text.trim().toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((k) => k.length > 2);
      
      const keywords = [
        ...sanitizeForKeywords(formData.pickupAddress),
        ...sanitizeForKeywords(formData.dropoffAddress),
        ...(formData.riderNote ? sanitizeForKeywords(formData.riderNote) : []),
      ];

      const { error } = await supabase.from("ride_requests").insert({
        rider_id: user?.id,
        pickup_address: formData.pickupAddress.trim(),
        pickup_lat: pickupGeo.lat,
        pickup_lng: pickupGeo.lng,
        pickup_zip: pickupGeo.zip,
        dropoff_address: formData.dropoffAddress.trim(),
        dropoff_lat: dropoffGeo.lat,
        dropoff_lng: dropoffGeo.lng,
        dropoff_zip: dropoffGeo.zip,
        pickup_time: new Date(formData.pickupTime).toISOString(),
        rider_note: formData.riderNote ? formData.riderNote.trim() : null,
        rider_note_image_url: noteImageUrl,
        price_offer: formData.priceOffer ? parseFloat(formData.priceOffer) : null,
        search_keywords: keywords,
        status: "open",
      });

      if (error) throw error;

      toast.success("Trip request created!");
      navigate("/rider");
    } catch (error: any) {
      toast.error(error.message || "Failed to create trip request");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" onClick={() => navigate("/rider")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </header>

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
              <Label htmlFor="time">Pickup Time *</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="time"
                  type="datetime-local"
                  className="pl-10"
                  required
                  value={formData.pickupTime}
                  onChange={(e) => setFormData({ ...formData, pickupTime: e.target.value })}
                  min={new Date().toISOString().slice(0, 16)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="offer">Price Offer (Optional)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="offer"
                  type="number"
                  placeholder="50.00"
                  className="pl-10"
                  step="0.01"
                  min="0"
                  value={formData.priceOffer}
                  onChange={(e) => setFormData({ ...formData, priceOffer: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">Additional Notes (Optional)</Label>
              <Textarea
                id="note"
                placeholder="Any special instructions or details..."
                rows={4}
                value={formData.riderNote}
                onChange={(e) => setFormData({ ...formData, riderNote: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="image">Attach Image (Optional)</Label>
              <div className="border-2 border-dashed border-border rounded-lg p-4">
                <Label htmlFor="image" className="cursor-pointer block text-center">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {noteImage ? noteImage.name : "Click to upload (JPG, PNG, WebP, Max 5MB)"}
                  </p>
                  <Input
                    id="image"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </Label>
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
