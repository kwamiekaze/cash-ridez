import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Voicemail Audio Test + Seeder (internal diagnostics)
 *
 * NOT used by Twilio.
 *
 * GET /functions/v1/call-center-voicemail-audio-test
 *
 * Query params:
 * - seed=1  -> force re-upload from the frontend-hosted file into Storage
 *
 * How seeding works:
 * - This endpoint expects the voicemail MP3 to be available at:
 *     {Origin}/audio/cashridez_voicemail.mp3
 *   (we keep that file in the repo at public/audio/cashridez_voicemail.mp3)
 * - When seed=1 (or if the storage file is missing), it fetches that file
 *   and uploads it to Storage as:
 *     call_center_audio/cashridez_voicemail.mp3
 *   with Content-Type audio/mpeg.
 */

const VOICEMAIL_STORAGE_PATH = "cashridez_voicemail.mp3";
const BUCKET_NAME = "call_center_audio";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AUDIO_ENDPOINT_URL =
  "https://wnajjqsqmrpwyffbpgsj.supabase.co/functions/v1/call-center-voicemail-audio";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const forceSeed = url.searchParams.get("seed") === "1";

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Ensure bucket exists (safe to call; if it exists, we'll just ignore errors)
    try {
      // @ts-ignore - typings vary in edge runtime
      const { error: bucketErr } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
      });
      if (bucketErr) {
        console.log("[call-center-voicemail-audio-test] createBucket result:", bucketErr);
      }
    } catch (e) {
      console.log("[call-center-voicemail-audio-test] createBucket not available/failed:", e);
    }

    // Check file exists
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(BUCKET_NAME)
      .download(VOICEMAIL_STORAGE_PATH);

    let fileExists = false;
    let fileSize = 0;
    let storageErrorMessage: string | null = null;

    if (downloadError) {
      storageErrorMessage = downloadError.message || "Unknown storage error";
    } else if (fileData) {
      fileExists = true;
      fileSize = (await fileData.arrayBuffer()).byteLength;
    }

    let seeded = false;
    let seedError: string | null = null;

    if (forceSeed || !fileExists) {
      const origin = req.headers.get("origin") || "";
      const seedSourceUrl = origin
        ? `${origin}/audio/cashridez_voicemail.mp3`
        : null;

      if (!seedSourceUrl) {
        seedError = "No Origin header available; call this from a browser to seed.";
      } else {
        console.log("[call-center-voicemail-audio-test] Seeding from:", seedSourceUrl);

        const seedRes = await fetch(seedSourceUrl, {
          method: "GET",
          headers: { Accept: "audio/mpeg" },
        });

        if (!seedRes.ok) {
          seedError = `Failed to fetch seed file: HTTP ${seedRes.status}`;
        } else {
          const audioBuffer = await seedRes.arrayBuffer();

          // Re-upload with explicit content-type
          const { error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(VOICEMAIL_STORAGE_PATH, audioBuffer, {
              contentType: "audio/mpeg",
              cacheControl: "public, max-age=60",
              upsert: true,
            });

          if (uploadError) {
            seedError = uploadError.message;
          } else {
            seeded = true;

            // Re-check size
            const { data: postUpload } = await supabase.storage
              .from(BUCKET_NAME)
              .download(VOICEMAIL_STORAGE_PATH);
            if (postUpload) {
              fileExists = true;
              fileSize = (await postUpload.arrayBuffer()).byteLength;
              storageErrorMessage = null;
            }
          }
        }
      }
    }

    // Test audio endpoint fetch (public, no auth)
    let fetchStatusCode: number | null = null;
    let fetchContentType: string | null = null;
    let firstBytesLength: number | null = null;
    let fetchError: string | null = null;

    try {
      const fetchResponse = await fetch(AUDIO_ENDPOINT_URL, {
        method: "GET",
        headers: { Accept: "audio/mpeg" },
      });
      fetchStatusCode = fetchResponse.status;
      fetchContentType = fetchResponse.headers.get("content-type");
      const buf = new Uint8Array(await fetchResponse.arrayBuffer());
      firstBytesLength = buf.slice(0, 32).byteLength;
    } catch (e) {
      fetchError = e instanceof Error ? e.message : "Unknown fetch error";
    }

    const diagnostics = {
      timestamp: new Date().toISOString(),
      audio_endpoint_url: AUDIO_ENDPOINT_URL,
      storage: {
        bucket: BUCKET_NAME,
        path: VOICEMAIL_STORAGE_PATH,
        file_exists: fileExists,
        file_size_bytes: fileSize,
        error: storageErrorMessage,
      },
      seeding: {
        attempted: forceSeed || !fileExists,
        seeded,
        error: seedError,
        note:
          "To seed, call this endpoint from the browser so Origin is present; it will upload from /audio/cashridez_voicemail.mp3",
      },
      audio_fetch_test: {
        status_code: fetchStatusCode,
        content_type: fetchContentType,
        first_32_bytes_length: firstBytesLength,
        error: fetchError,
      },
    };

    return new Response(JSON.stringify(diagnostics, null, 2), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Diagnostic test failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

