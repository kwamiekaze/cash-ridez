import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Voicemail Audio Streaming Endpoint
 * 
 * Returns the raw MP3 bytes of the pre-recorded voicemail.
 * This endpoint is called directly by Twilio's <Play> verb.
 * 
 * CRITICAL:
 * - NO authentication required (Twilio cannot pass Supabase auth)
 * - Returns audio/mpeg content type
 * - No redirects to signed URLs - streams the file directly
 * - Returns HTTP 200 with the MP3 body
 */

const VOICEMAIL_STORAGE_PATH = 'cashridez_voicemail.mp3';
const BUCKET_NAME = 'call_center_audio';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
    });
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    console.log(`[call-center-voicemail-audio] Invalid method: ${req.method}`);
    return new Response('Method not allowed', { status: 405 });
  }

  console.log('[call-center-voicemail-audio] Streaming voicemail audio file...');

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Download the file from storage using service role (server-side)
    console.log(`[call-center-voicemail-audio] Fetching from bucket: ${BUCKET_NAME}/${VOICEMAIL_STORAGE_PATH}`);
    
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(VOICEMAIL_STORAGE_PATH);

    if (error) {
      console.error('[call-center-voicemail-audio] Storage download error:', error);
      console.error(`[call-center-voicemail-audio] Error details: ${JSON.stringify(error)}`);
      return new Response('Audio file not found', { 
        status: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/plain',
        }
      });
    }

    if (!data) {
      console.error('[call-center-voicemail-audio] File data is null');
      return new Response('Audio file empty', { 
        status: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/plain',
        }
      });
    }

    // Convert Blob to ArrayBuffer
    const arrayBuffer = await data.arrayBuffer();
    const fileSize = arrayBuffer.byteLength;

    console.log(`[call-center-voicemail-audio] Successfully loaded audio file, size: ${fileSize} bytes`);

    // Return the raw MP3 bytes with proper headers
    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': fileSize.toString(),
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
      },
    });

  } catch (error) {
    console.error('[call-center-voicemail-audio] Critical error:', error);
    console.error(`[call-center-voicemail-audio] Error stack: ${error instanceof Error ? error.stack : 'N/A'}`);
    
    return new Response('Internal server error', { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain',
      }
    });
  }
});
