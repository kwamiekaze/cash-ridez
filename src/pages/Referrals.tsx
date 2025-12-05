import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { MapBackground } from "@/components/MapBackground";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Copy, Check, Users, Link, Edit3, Save, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { motion } from "motion/react";
import { format } from "date-fns";

interface ReferredUser {
  id: string;
  display_name: string | null;
  full_name: string | null;
  photo_url: string | null;
  is_verified: boolean;
  subscription_active: boolean;
  created_at: string;
}

const Referrals = () => {
  const { user } = useAuth();
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralCodeLocked, setReferralCodeLocked] = useState(false);
  const [referredUsers, setReferredUsers] = useState<ReferredUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [saving, setSaving] = useState(false);

  const referralLink = `${window.location.origin}/auth?ref=${referralCode || ""}`;

  useEffect(() => {
    if (!user) return;
    fetchReferralData();
  }, [user]);

  const fetchReferralData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch user's referral code
      const { data: profile } = await supabase
        .from("profiles")
        .select("referral_code, referral_code_locked")
        .eq("id", user.id)
        .single();

      if (profile) {
        setReferralCode(profile.referral_code);
        setReferralCodeLocked(profile.referral_code_locked || false);
        setNewCode(profile.referral_code || "");
      }

      // Fetch referred users
      const { data: referrals } = await supabase
        .from("referrals")
        .select(`
          referred_user_id,
          created_at
        `)
        .eq("referrer_user_id", user.id)
        .order("created_at", { ascending: false });

      if (referrals && referrals.length > 0) {
        const userIds = referrals.map(r => r.referred_user_id);
        
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, full_name, photo_url, is_verified, subscription_active, created_at")
          .in("id", userIds);

        if (profiles) {
          // Map profiles with referral dates
          const mappedUsers = profiles.map(p => ({
            ...p,
            created_at: referrals.find(r => r.referred_user_id === p.id)?.created_at || p.created_at
          }));
          setReferredUsers(mappedUsers);
        }
      }
    } catch (error) {
      console.error("Error fetching referral data:", error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, type: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "code") {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }
      toast.success(type === "code" ? "Referral code copied!" : "Referral link copied!");
    } catch (error) {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleSaveCode = async () => {
    if (!user || !newCode.trim()) return;
    
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("set_referral_code", {
        p_user_id: user.id,
        p_new_code: newCode.trim()
      });

      if (error) throw error;

      const result = data as { success: boolean; message: string };
      
      if (result.success) {
        setReferralCode(newCode.toUpperCase());
        setReferralCodeLocked(true);
        setIsEditing(false);
        toast.success("Referral code updated successfully!");
      } else {
        toast.error(result.message || "Failed to update referral code");
      }
    } catch (error: any) {
      console.error("Error saving referral code:", error);
      toast.error(error.message || "Failed to save referral code");
    } finally {
      setSaving(false);
    }
  };

  const canEditCode = !referralCodeLocked && referredUsers.length === 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <MapBackground />
        <AppHeader />
        <div className="container mx-auto px-4 py-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <MapBackground />
      <AppHeader />

      <div className="container mx-auto px-4 py-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl mx-auto space-y-6"
        >
          <div className="mb-6">
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
              Referrals
            </h1>
            <p className="text-muted-foreground">
              Share your referral code and grow the CashRidez community
            </p>
          </div>

          {/* Your Referral Code Section */}
          <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/50">
            <div className="flex items-center gap-2 mb-4">
              <Link className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Your Referral Code</h2>
            </div>

            {isEditing ? (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    placeholder="Enter custom code (4-20 characters)"
                    className="font-mono text-lg"
                    maxLength={20}
                  />
                  <Button onClick={handleSaveCode} disabled={saving || newCode.length < 4}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" onClick={() => { setIsEditing(false); setNewCode(referralCode || ""); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Code must be 4-20 alphanumeric characters. Once saved, it cannot be changed.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-muted/50 rounded-lg px-4 py-3 font-mono text-xl font-bold text-primary">
                    {referralCode || "Loading..."}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => referralCode && copyToClipboard(referralCode, "code")}
                    className="h-12 w-12"
                  >
                    {copied ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5" />}
                  </Button>
                  {canEditCode && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setIsEditing(true)}
                      className="h-12 w-12"
                    >
                      <Edit3 className="h-5 w-5" />
                    </Button>
                  )}
                </div>

                {referralCodeLocked && (
                  <p className="text-xs text-muted-foreground">
                    🔒 Your referral code is locked and cannot be changed.
                  </p>
                )}

                {/* Shareable Link */}
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Shareable Link</label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={referralLink}
                      readOnly
                      className="font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(referralLink, "link")}
                    >
                      {copiedLink ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* People You've Referred Section */}
          <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/50">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">People You've Referred</h2>
              </div>
              <Badge variant="secondary" className="text-sm">
                {referredUsers.length} referral{referredUsers.length !== 1 ? "s" : ""}
              </Badge>
            </div>

            {referredUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>You haven't referred anyone yet.</p>
                <p className="text-sm mt-2">
                  Share your referral code to get started!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {referredUsers.map((referredUser) => (
                  <div
                    key={referredUser.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={referredUser.photo_url || undefined} />
                        <AvatarFallback>
                          {(referredUser.full_name || referredUser.display_name || "U")[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">
                          {referredUser.full_name || referredUser.display_name || "User"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Joined {format(new Date(referredUser.created_at), "MMM d, yyyy")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {referredUser.is_verified && (
                        <Badge variant="outline" className="border-green-500 text-green-500 text-xs">
                          Verified
                        </Badge>
                      )}
                      {referredUser.subscription_active && (
                        <Badge variant="secondary" className="text-xs bg-yellow-500/20 text-yellow-500">
                          Premium
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Referrals;
