import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MapPin } from "lucide-react";

interface RiderZipEditorProps {
  onZipSaved?: (zip: string) => void;
  variant?: "card" | "inline";
}

export const RiderZipEditor = ({ onZipSaved, variant = "card" }: RiderZipEditorProps) => {
  const { user } = useAuth();
  const [zip, setZip] = useState("");
  const [saving, setSaving] = useState(false);
  const [currentZip, setCurrentZip] = useState<string | null>(null);

  useEffect(() => {
    loadCurrentZip();
  }, [user]);

  const loadCurrentZip = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from("profiles")
      .select("profile_zip")
      .eq("id", user.id)
      .single();
    
    if (data?.profile_zip) {
      setCurrentZip(data.profile_zip);
      setZip(data.profile_zip);
    }
  };

  const normalizeZip = (input: string): string => {
    // Remove all non-digits
    const digits = input.replace(/\D/g, "");
    // Take first 5 digits
    return digits.slice(0, 5);
  };

  const validateZip = (input: string): boolean => {
    return /^\d{5}$/.test(input);
  };

  const handleZipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const normalized = normalizeZip(e.target.value);
    setZip(normalized);
  };

  const handleSave = async () => {
    if (!user) return;

    if (!validateZip(zip)) {
      toast.error("Enter a valid ZIP (5 digits, e.g., 30117)");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          profile_zip: zip,
          profile_zip_updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      setCurrentZip(zip);
      toast.success(`ZIP saved. We'll show drivers near ${zip}.`);
      onZipSaved?.(zip);
    } catch (error: any) {
      console.error("Error saving ZIP:", error);
      toast.error("Failed to save ZIP");
    } finally {
      setSaving(false);
    }
  };

  if (variant === "inline") {
    return (
      <div className="space-y-4 p-6 border border-border rounded-lg bg-card">
        <div className="space-y-2">
          <h3 className="font-semibold flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Set Your ZIP to See Available Drivers
          </h3>
          <p className="text-sm text-muted-foreground">
            Enter your ZIP code to find drivers in your area
          </p>
        </div>
        <div className="space-y-3">
          <Input
            type="text"
            inputMode="numeric"
            placeholder="Enter 5-digit ZIP (e.g., 30117)"
            value={zip}
            onChange={handleZipChange}
            maxLength={5}
          />
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={saving || !validateZip(zip)}
              className="flex-1"
            >
              {saving ? "Saving..." : "Save ZIP"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Your ZIP Code
        </CardTitle>
        <CardDescription>
          Set your ZIP code to see available drivers in your area
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="rider-zip">ZIP Code</Label>
          <Input
            id="rider-zip"
            type="text"
            inputMode="numeric"
            placeholder="Enter 5-digit ZIP (e.g., 30117)"
            value={zip}
            onChange={handleZipChange}
            maxLength={5}
          />
          <p className="text-xs text-muted-foreground">
            {currentZip 
              ? `Current ZIP: ${currentZip}. Update to change your location.`
              : "We'll show you drivers available in your ZIP code"}
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || !validateZip(zip) || zip === currentZip}
          className="w-full"
        >
          {saving ? "Saving..." : currentZip ? "Update ZIP" : "Save ZIP"}
        </Button>
      </CardContent>
    </Card>
  );
};
