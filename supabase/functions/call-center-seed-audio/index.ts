import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Audio Seed Function - Generates and stores pre-generated ElevenLabs audio files
 * 
 * This ensures the SAME male voice is used for:
 * 1. Answered outbound calls
 * 2. Outbound voicemail (AMD detected machine)
 * 3. Inbound missed call voicemail
 * 
 * ALL scenarios now use the INBOUND VOICEMAIL script as specified by the user.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// THE ONE VOICEMAIL SCRIPT for ALL voicemail scenarios (user specification)
const VOICEMAIL_SCRIPT = "Thank you for calling Cash Ridez Connect LLC, sorry we missed your call. To connect with an agent please text the word AGENT to this number and an agent will return your call shortly. Please save this number for future connections. We look forward to your text, thank you.";

// Answered call script (separate from voicemail)
const ANSWERED_SCRIPT = "Hey there, this is Cash Ridez Connect LLC. We responded on Indeed as well. Please text us back with the word CASH for the next steps. We look forward to your text, thank you.";

// Audio files to generate
const AUDIO_FILES = [
  {
    path: 'inbound_voicemail.mp3',
    script: VOICEMAIL_SCRIPT,
    description: 'Inbound missed call voicemail AND outbound voicemail'
  },
  {
    path: 'outbound_answered.mp3', 
    script: ANSWERED_SCRIPT,
    description: 'Outbound call - human answered'
  }
];

// ElevenLabs voice ID for a natural male voice
// Roger voice: CwhRBWXzGAHq8TQ4Fs17 (recommended male voice)
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

    for (const audioFile of AUDIO_FILES) {
      console.log(`[call-center-seed-audio] Generating: ${audioFile.path}`);
      console.log(`[call-center-seed-audio] Script: "${audioFile.script.substring(0, 50)}..."`);

      try {
        // Check if file already exists
        const { data: existingFile } = await supabase.storage
          .from('call_center_audio')
          .list('', { search: audioFile.path });

        const fileExists = existingFile && existingFile.some(f => f.name === audioFile.path);

        if (fileExists) {
          // Get public URL
          const { data: publicUrlData } = supabase.storage
            .from('call_center_audio')
            .getPublicUrl(audioFile.path);

          results.push({
            path: audioFile.path,
            status: 'exists',
            url: publicUrlData?.publicUrl,
            description: audioFile.description
          });
          console.log(`[call-center-seed-audio] File already exists: ${audioFile.path}`);
          continue;
        }

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
              text: audioFile.script,
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
          console.error(`[call-center-seed-audio] ElevenLabs error for ${audioFile.path}:`, errorText);
          results.push({
            path: audioFile.path,
            status: 'error',
            error: `ElevenLabs API error: ${ttsResponse.status}`,
            description: audioFile.description
          });
          continue;
        }

        const audioBuffer = await ttsResponse.arrayBuffer();
        console.log(`[call-center-seed-audio] Generated ${audioBuffer.byteLength} bytes for ${audioFile.path}`);

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('call_center_audio')
          .upload(audioFile.path, audioBuffer, {
            contentType: 'audio/mpeg',
            upsert: true
          });

        if (uploadError) {
          console.error(`[call-center-seed-audio] Upload error for ${audioFile.path}:`, uploadError);
          results.push({
            path: audioFile.path,
            status: 'error',
            error: uploadError.message,
            description: audioFile.description
          });
          continue;
        }

        // Get public URL
        const { data: publicUrlData } = supabase.storage
          .from('call_center_audio')
          .getPublicUrl(audioFile.path);

        results.push({
          path: audioFile.path,
          status: 'created',
          url: publicUrlData?.publicUrl,
          description: audioFile.description
        });
        console.log(`[call-center-seed-audio] Successfully created: ${audioFile.path}`);

      } catch (fileError) {
        console.error(`[call-center-seed-audio] Error processing ${audioFile.path}:`, fileError);
        results.push({
          path: audioFile.path,
          status: 'error',
          error: fileError instanceof Error ? fileError.message : 'Unknown error',
          description: audioFile.description
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Audio seeding complete',
      results,
      voicemailScript: VOICEMAIL_SCRIPT,
      answeredScript: ANSWERED_SCRIPT
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
