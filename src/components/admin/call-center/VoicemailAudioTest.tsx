import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Volume2, CheckCircle2, XCircle, Loader2, ExternalLink } from "lucide-react";

// Direct public storage URL for voicemail audio
const SUPABASE_URL = "https://wnajjqsqmrpwyffbpgsj.supabase.co";
const PUBLIC_VOICEMAIL_URL = `${SUPABASE_URL}/storage/v1/object/public/call_center_audio/cashridez_voicemail.mp3`;

interface TestResult {
  status: number | null;
  contentType: string | null;
  contentLength: number | null;
  ok: boolean;
  error?: string;
}

const VoicemailAudioTest = () => {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const testAudio = async () => {
    setTesting(true);
    setResult(null);

    try {
      // First try HEAD request
      const headResponse = await fetch(PUBLIC_VOICEMAIL_URL, { method: 'HEAD' });
      
      const testResult: TestResult = {
        status: headResponse.status,
        contentType: headResponse.headers.get('content-type'),
        contentLength: parseInt(headResponse.headers.get('content-length') || '0', 10),
        ok: headResponse.ok && headResponse.headers.get('content-type')?.includes('audio') === true,
      };

      // If HEAD failed, try GET
      if (!headResponse.ok) {
        const getResponse = await fetch(PUBLIC_VOICEMAIL_URL, { method: 'GET' });
        testResult.status = getResponse.status;
        testResult.contentType = getResponse.headers.get('content-type');
        testResult.ok = getResponse.ok && getResponse.headers.get('content-type')?.includes('audio') === true;
        
        if (getResponse.ok) {
          const blob = await getResponse.blob();
          testResult.contentLength = blob.size;
        }
      }

      setResult(testResult);
    } catch (err) {
      setResult({
        status: null,
        contentType: null,
        contentLength: null,
        ok: false,
        error: err instanceof Error ? err.message : 'Network error',
      });
    } finally {
      setTesting(false);
    }
  };

  const openInNewTab = () => {
    window.open(PUBLIC_VOICEMAIL_URL, '_blank');
  };

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Volume2 className="w-4 h-4" />
          Voicemail Audio Test
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground break-all">
          <strong>Public URL:</strong> {PUBLIC_VOICEMAIL_URL}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={testAudio}
            disabled={testing}
          >
            {testing ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Volume2 className="w-4 h-4 mr-2" />
            )}
            Test Audio URL
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={openInNewTab}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Open in Browser
          </Button>
        </div>

        {result && (
          <div className={`p-3 rounded-md text-sm ${result.ok ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
            <div className="flex items-center gap-2 mb-2">
              {result.ok ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500" />
              )}
              <span className="font-medium">
                {result.ok ? 'Audio URL is accessible!' : 'Audio URL test failed'}
              </span>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              {result.status !== null && (
                <p><strong>HTTP Status:</strong> {result.status}</p>
              )}
              {result.contentType && (
                <p><strong>Content-Type:</strong> {result.contentType}</p>
              )}
              {result.contentLength !== null && result.contentLength > 0 && (
                <p><strong>File Size:</strong> {(result.contentLength / 1024).toFixed(1)} KB</p>
              )}
              {result.error && (
                <p className="text-red-500"><strong>Error:</strong> {result.error}</p>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          For Twilio to play voicemail correctly, this URL must return HTTP 200 with Content-Type: audio/mpeg
        </p>
      </CardContent>
    </Card>
  );
};

export default VoicemailAudioTest;
