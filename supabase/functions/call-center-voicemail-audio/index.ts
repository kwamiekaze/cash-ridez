import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Voicemail Audio Streaming Endpoint (Twilio <Play>)
 *
 * CRITICAL:
 * - Must return raw MP3 bytes (no JSON/HTML)
 * - Must set Content-Type: audio/mpeg
 * - Must not redirect or return signed URLs
 * - Must be public (verify_jwt=false)
 * - Must not break Twilio with "Invalid Content-Type" (warn 12300)
 *
 * NOTE: We intentionally return audio/mpeg even in error cases to avoid Twilio
 * failing the call with an application error.
 */

const VOICEMAIL_STORAGE_PATH = "cashridez_voicemail.mp3";
const BUCKET_NAME = "call_center_audio";

// Public URL used ONLY as a secondary fallback (not returned to Twilio as a redirect)
const PUBLIC_STORAGE_URL =
  "https://wnajjqsqmrpwyffbpgsj.supabase.co/storage/v1/object/public/call_center_audio/cashridez_voicemail.mp3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function buildAudioResponse(
  bytes: Uint8Array,
  opts: { status: number; contentRange?: string }
) {
  const headers: Record<string, string> = {
    ...corsHeaders,
    "Content-Type": "audio/mpeg",
    "Content-Disposition": 'inline; filename="cashridez_voicemail.mp3"',
    "Cache-Control": "public, max-age=60",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": String(bytes.byteLength),
  };

  if (opts.contentRange) {
    headers["Content-Range"] = opts.contentRange;
  }

  console.log(
    `[call-center-voicemail-audio] Responding status=${opts.status} bytes=${bytes.byteLength} content-type=${headers["Content-Type"]}`
  );

  return new Response(bytes, { status: opts.status, headers });
}

function parseRange(rangeHeader: string | null, totalSize: number) {
  if (!rangeHeader) return null;
  // Example: bytes=0-1023
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const startStr = match[1];
  const endStr = match[2];

  let start = startStr ? Number(startStr) : 0;
  let end = endStr ? Number(endStr) : totalSize - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0) start = 0;
  if (end >= totalSize) end = totalSize - 1;
  if (start > end) return null;

  return { start, end };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    // Twilio should only GET. Keep this strict.
    return new Response("Method not allowed", {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const rangeHeader = req.headers.get("range");
  console.log(`[call-center-voicemail-audio] GET range=${rangeHeader ?? "(none)"}`);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Primary: server-side storage download
    console.log(
      `[call-center-voicemail-audio] Downloading from storage: ${BUCKET_NAME}/${VOICEMAIL_STORAGE_PATH}`
    );

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(VOICEMAIL_STORAGE_PATH);

    let audioBytes: Uint8Array | null = null;

    if (!error && data) {
      const buf = new Uint8Array(await data.arrayBuffer());
      audioBytes = buf;
    } else {
      console.error(
        "[call-center-voicemail-audio] Storage download failed, trying public URL fallback:",
        error
      );

      // Secondary: fetch public URL (still not a redirect)
      const res = await fetch(PUBLIC_STORAGE_URL, {
        method: "GET",
        headers: { Accept: "audio/mpeg" },
      });

      if (res.ok) {
        audioBytes = new Uint8Array(await res.arrayBuffer());
      } else {
        console.error(
          `[call-center-voicemail-audio] Public URL fallback failed: status=${res.status}`
        );
      }
    }

    // If still missing, return empty MP3 body but correct headers (prevents Twilio 12300)
    if (!audioBytes) {
      console.error(
        "[call-center-voicemail-audio] No audio bytes available; returning empty audio/mpeg to avoid Twilio content-type error"
      );
      return buildAudioResponse(new Uint8Array(), { status: 200 });
    }

    const total = audioBytes.byteLength;
    const r = parseRange(rangeHeader, total);

    if (r) {
      const chunk = audioBytes.slice(r.start, r.end + 1);
      const contentRange = `bytes ${r.start}-${r.end}/${total}`;
      return buildAudioResponse(chunk, { status: 206, contentRange });
    }

    return buildAudioResponse(audioBytes, { status: 200 });
  } catch (err) {
    console.error("[call-center-voicemail-audio] Critical error:", err);
    // Return 200 audio/mpeg even on exception
    return buildAudioResponse(new Uint8Array(), { status: 200 });
  }
});

