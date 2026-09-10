import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, Car, Eye, Send } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CAMPAIGN_SENDER,
  DEFAULT_THROTTLE_SECONDS,
  DRIVER_AUDIENCE_SIZES,
  DRIVER_EMAIL_PRESETS,
  estimateCompletionSeconds,
  formatDurationShort,
} from "@/lib/emailCampaign";

interface PreviewResult {
  requested: number;
  eligible_count: number;
  sender: string;
  throttle_seconds: number;
  estimated_seconds: number;
  sample: { first_name: string | null; email_masked: string; last_active_at: string | null }[];
  example_subject: string;
  example_body: string;
}

interface Props {
  onCampaignCreated?: () => void;
}

const RecentDriversEmailTool = ({ onCampaignCreated }: Props) => {
  const [audienceSize, setAudienceSize] = useState<number>(10);
  const [presetId, setPresetId] = useState<string>(DRIVER_EMAIL_PRESETS[0].id);
  const [subject, setSubject] = useState(DRIVER_EMAIL_PRESETS[0].subject);
  const [body, setBody] = useState(DRIVER_EMAIL_PRESETS[0].body);
  const [previewing, setPreviewing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Applying a preset replaces the editable subject/body.
  useEffect(() => {
    const preset = DRIVER_EMAIL_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setSubject(preset.subject);
      setBody(preset.body);
    }
  }, [presetId]);

  const handlePreview = async () => {
    setPreviewing(true);
    setPreview(null);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-driver-email-campaign", {
        body: { limit: audienceSize, subject, body, preview: true },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Preview failed");
      setPreview(data as PreviewResult);
      setConfirmOpen(true);
    } catch (err: any) {
      toast({ title: "Preview failed", description: err.message, variant: "destructive" });
    } finally {
      setPreviewing(false);
    }
  };

  const handleStart = async () => {
    setStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-driver-email-campaign", {
        body: { limit: audienceSize, subject, body, name: `Recent Drivers (${audienceSize})` },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Could not start campaign");

      toast({
        title: "Campaign started",
        description: `Queued ${data.eligible_count} driver${data.eligible_count === 1 ? "" : "s"}.`,
      });
      setConfirmOpen(false);
      setPreview(null);
      onCampaignCreated?.();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <Card className="bg-card/80 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Car className="h-5 w-5" />
            Recent Drivers
          </CardTitle>
          <CardDescription>
            Email the most recently active verified drivers. Recipients are chosen on the server —
            one email every {DEFAULT_THROTTLE_SECONDS} seconds.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Audience size</Label>
              <Select value={String(audienceSize)} onValueChange={(v) => setAudienceSize(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DRIVER_AUDIENCE_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      Last {size} active drivers
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Message preset</Label>
              <Select value={presetId} onValueChange={setPresetId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DRIVER_EMAIL_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>{preset.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Body</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Use {"{first_name}"} for personalization (falls back to “there”).
            </p>
          </div>

          <Button
            onClick={handlePreview}
            disabled={previewing || !subject.trim() || !body.trim()}
            className="w-full"
          >
            {previewing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
            Preview &amp; confirm
          </Button>
          <p className="text-xs text-muted-foreground">
            Previewing never sends an email.
          </p>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm Recent Drivers campaign</DialogTitle>
            <DialogDescription>
              Review the summary below before any email is sent.
            </DialogDescription>
          </DialogHeader>

          {preview && (
            <ScrollArea className="max-h-[55vh] pr-3">
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-muted-foreground">Audience size selected</span>
                  <span className="text-white">{preview.requested}</span>
                  <span className="text-muted-foreground">Eligible recipients</span>
                  <span className="text-white">{preview.eligible_count}</span>
                  <span className="text-muted-foreground">Sending rate</span>
                  <span className="text-white">One email every {preview.throttle_seconds} seconds</span>
                  <span className="text-muted-foreground">Estimated completion</span>
                  <span className="text-white">
                    {formatDurationShort(
                      preview.estimated_seconds ??
                      estimateCompletionSeconds(preview.eligible_count, preview.throttle_seconds),
                    )}
                  </span>
                  <span className="text-muted-foreground">Sender</span>
                  <span className="text-white">{preview.sender || CAMPAIGN_SENDER}</span>
                </div>

                <div className="space-y-1">
                  <div className="text-muted-foreground">Subject</div>
                  <div className="rounded border border-border/60 p-2 text-white">
                    {preview.example_subject}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-muted-foreground">Preview</div>
                  <pre className="rounded border border-border/60 p-2 whitespace-pre-wrap text-xs text-white">
                    {preview.example_body}
                  </pre>
                </div>

                {preview.sample.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Sample recipients</div>
                    {preview.sample.map((s, i) => (
                      <div key={i} className="text-xs text-white">
                        {s.first_name || "there"} → {s.email_masked}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={starting}>
              Cancel
            </Button>
            <Button
              onClick={handleStart}
              disabled={starting || !preview || preview.eligible_count === 0}
            >
              {starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Start campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RecentDriversEmailTool;
