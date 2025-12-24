import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Upload Voicemail Audio - Uploads a pre-recorded voicemail file to storage
 * 
 * This endpoint accepts a base64-encoded audio file and uploads it to the
 * call_center_audio bucket as 'cashridez_voicemail.mp3'
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VOICEMAIL_FILENAME = 'cashridez_voicemail.mp3';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check if this is a URL upload or base64 upload
    const body = await req.json();
    let audioBuffer: ArrayBuffer;

    if (body.url) {
      // Fetch audio from URL
      console.log('[upload-voicemail-audio] Fetching audio from URL:', body.url);
      const response = await fetch(body.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio from URL: ${response.status}`);
      }
      audioBuffer = await response.arrayBuffer();
    } else if (body.base64) {
      // Decode base64
      console.log('[upload-voicemail-audio] Decoding base64 audio');
      const binaryString = atob(body.base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      audioBuffer = bytes.buffer;
    } else {
      return new Response(JSON.stringify({ 
        error: 'Must provide either url or base64 audio data' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[upload-voicemail-audio] Audio size: ${audioBuffer.byteLength} bytes`);

    // Delete existing file first
    await supabase.storage
      .from('call_center_audio')
      .remove([VOICEMAIL_FILENAME]);

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('call_center_audio')
      .upload(VOICEMAIL_FILENAME, audioBuffer, {
        contentType: 'audio/mpeg',
        cacheControl: '0',
        upsert: true,
      });

    if (uploadError) {
      console.error('[upload-voicemail-audio] Upload error:', uploadError);
      return new Response(JSON.stringify({ 
        error: uploadError.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('call_center_audio')
      .getPublicUrl(VOICEMAIL_FILENAME);

    console.log('[upload-voicemail-audio] Successfully uploaded:', publicUrlData?.publicUrl);

    return new Response(JSON.stringify({
      success: true,
      message: 'Voicemail audio uploaded successfully',
      filename: VOICEMAIL_FILENAME,
      url: publicUrlData?.publicUrl,
      size: audioBuffer.byteLength
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[upload-voicemail-audio] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
