import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Voicemail Audio Test Endpoint
 * 
 * Returns JSON with diagnostic information about the voicemail audio file.
 * Used for admin debugging only - NOT called by Twilio.
 */

const VOICEMAIL_STORAGE_PATH = 'cashridez_voicemail.mp3';
const BUCKET_NAME = 'call_center_audio';

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[call-center-voicemail-audio-test] Running diagnostics...');

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    
    // Build the audio stream URL
    const audioStreamUrl = `${supabaseUrl}/functions/v1/call-center-voicemail-audio`;

    // Check if file exists in storage
    console.log(`[call-center-voicemail-audio-test] Checking bucket: ${BUCKET_NAME}/${VOICEMAIL_STORAGE_PATH}`);
    
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(BUCKET_NAME)
      .download(VOICEMAIL_STORAGE_PATH);

    let fileExists = false;
    let fileSize = 0;
    let downloadErrorMessage: string | null = null;

    if (downloadError) {
      console.error('[call-center-voicemail-audio-test] Storage error:', downloadError);
      downloadErrorMessage = downloadError.message || 'Unknown storage error';
    } else if (fileData) {
      fileExists = true;
      const arrayBuffer = await fileData.arrayBuffer();
      fileSize = arrayBuffer.byteLength;
      console.log(`[call-center-voicemail-audio-test] File found, size: ${fileSize} bytes`);
    }

    // Test if the audio endpoint is publicly fetchable
    let isPublicFetchable = false;
    let fetchStatusCode: number | null = null;
    let fetchError: string | null = null;
    let fetchContentType: string | null = null;
    let fetchResponseSize: number | null = null;

    try {
      console.log(`[call-center-voicemail-audio-test] Testing fetch to: ${audioStreamUrl}`);
      const fetchResponse = await fetch(audioStreamUrl, {
        method: 'GET',
        headers: {
          'Accept': 'audio/mpeg',
        },
      });
      
      fetchStatusCode = fetchResponse.status;
      fetchContentType = fetchResponse.headers.get('content-type');
      
      if (fetchResponse.ok) {
        const responseBuffer = await fetchResponse.arrayBuffer();
        fetchResponseSize = responseBuffer.byteLength;
        isPublicFetchable = fetchStatusCode === 200 && fetchResponseSize > 0;
        console.log(`[call-center-voicemail-audio-test] Fetch successful, received ${fetchResponseSize} bytes`);
      } else {
        const errorText = await fetchResponse.text();
        fetchError = `HTTP ${fetchStatusCode}: ${errorText}`;
        console.error(`[call-center-voicemail-audio-test] Fetch failed: ${fetchError}`);
      }
    } catch (e) {
      fetchError = e instanceof Error ? e.message : 'Unknown fetch error';
      console.error('[call-center-voicemail-audio-test] Fetch exception:', e);
    }

    // Get public URL for comparison
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(VOICEMAIL_STORAGE_PATH);

    const diagnostics = {
      timestamp: new Date().toISOString(),
      audio_stream_url: audioStreamUrl,
      public_storage_url: publicUrlData?.publicUrl || null,
      storage: {
        bucket: BUCKET_NAME,
        path: VOICEMAIL_STORAGE_PATH,
        file_exists: fileExists,
        file_size_bytes: fileSize,
        error: downloadErrorMessage,
      },
      fetch_test: {
        is_public_fetchable: isPublicFetchable,
        status_code: fetchStatusCode,
        content_type: fetchContentType,
        response_size_bytes: fetchResponseSize,
        error: fetchError,
      },
      recommendation: isPublicFetchable 
        ? 'Audio endpoint is working correctly. Use audio_stream_url in TwiML <Play>.' 
        : fileExists 
          ? 'File exists but fetch failed. Check edge function deployment.' 
          : 'File missing from storage. Re-upload the voicemail audio.',
    };

    console.log('[call-center-voicemail-audio-test] Diagnostics complete:', JSON.stringify(diagnostics, null, 2));

    return new Response(JSON.stringify(diagnostics, null, 2), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });

  } catch (error) {
    console.error('[call-center-voicemail-audio-test] Critical error:', error);
    
    return new Response(JSON.stringify({
      error: 'Diagnostic test failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
});
