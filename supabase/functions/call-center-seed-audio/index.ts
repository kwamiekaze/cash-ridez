import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Audio Seed Function - For the ANSWERED call path only (outbound human-answered).
 * 
 * The voicemail audio (cashridez_voicemail.mp3) is uploaded separately via upload-voicemail-audio.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Answered call script (separate from voicemail)
const ANSWERED_SCRIPT = "Hey there, this is Cash Ridez Connect LLC. We responded on Indeed as well. Please text us back with the word CASH for the next steps. We look forward to your text, thank you.";

// ElevenLabs voice ID for a natural male voice (Roger)
const ELEVENLABS_VOICE_ID = 'CwhRBWXzGAHq8TQ4Fs17';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    
    if (!ELEVENLABS_API_KEY) {
      return new Response(JSON.stringify({ 
        error: 'ELEVENLABS_API_KEY not configured' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const results: any[] = [];

    // Only generate answered call audio - voicemail is uploaded separately
    const audioPath = 'outbound_answered.mp3';
    
    console.log(`[call-center-seed-audio] Generating answered call audio: ${audioPath}`);

    // Check if file already exists
    const { data: existingFile } = await supabase.storage
      .from('call_center_audio')
      .list('', { search: audioPath });

    const fileExists = existingFile && existingFile.some(f => f.name === audioPath);

    if (fileExists) {
      const { data: publicUrlData } = supabase.storage
        .from('call_center_audio')
        .getPublicUrl(audioPath);

      results.push({
        path: audioPath,
        status: 'exists',
        url: publicUrlData?.publicUrl
      });
    } else {
      // Generate audio with ElevenLabs
      const ttsResponse = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
        {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': ELEVENLABS_API_KEY,
          },
          body: JSON.stringify({
            text: ANSWERED_SCRIPT,
            model_id: 'eleven_monolingual_v1',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            }
          }),
        }
      );

      if (!ttsResponse.ok) {
        const errorText = await ttsResponse.text();
        console.error(`[call-center-seed-audio] ElevenLabs error:`, errorText);
        results.push({
          path: audioPath,
          status: 'error',
          error: `ElevenLabs API error: ${ttsResponse.status}`
        });
      } else {
        const audioBuffer = await ttsResponse.arrayBuffer();
        console.log(`[call-center-seed-audio] Generated ${audioBuffer.byteLength} bytes`);

        const { error: uploadError } = await supabase.storage
          .from('call_center_audio')
          .upload(audioPath, audioBuffer, {
            contentType: 'audio/mpeg',
            upsert: true
          });

        if (uploadError) {
          results.push({
            path: audioPath,
            status: 'error',
            error: uploadError.message
          });
        } else {
          const { data: publicUrlData } = supabase.storage
            .from('call_center_audio')
            .getPublicUrl(audioPath);

          results.push({
            path: audioPath,
            status: 'created',
            url: publicUrlData?.publicUrl
          });
        }
      }
    }

    // Check voicemail file exists
    const { data: vmFile } = await supabase.storage
      .from('call_center_audio')
      .list('', { search: 'cashridez_voicemail.mp3' });

    const vmExists = vmFile && vmFile.some(f => f.name === 'cashridez_voicemail.mp3');
    
    if (vmExists) {
      const { data: vmUrl } = supabase.storage
        .from('call_center_audio')
        .getPublicUrl('cashridez_voicemail.mp3');
      results.push({
        path: 'cashridez_voicemail.mp3',
        status: 'exists (pre-recorded)',
        url: vmUrl?.publicUrl
      });
    } else {
      results.push({
        path: 'cashridez_voicemail.mp3',
        status: 'MISSING - must be uploaded via upload-voicemail-audio endpoint',
        url: null
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Audio seeding complete',
      results,
      note: 'Voicemail audio (cashridez_voicemail.mp3) must be uploaded separately'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[call-center-seed-audio] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
