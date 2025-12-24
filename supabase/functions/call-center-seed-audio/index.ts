import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * call-center-seed-audio
 * 
 * Utility function to pre-generate and upload the deterministic voicemail audio files
 * using ElevenLabs so they are available instantly for all future voicemail playback.
 * 
 * These files are stored in the `call_center_audio` bucket (public) so Twilio can fetch immediately.
 * 
 * Audio files generated:
 * 1. outbound_voicemail.mp3 - Used when AMD detects answering machine for outbound calls
 * 2. inbound_voicemail.mp3 - Used when inbound call is missed and goes to voicemail
 * 3. outbound_answered.mp3 - Used when human answers outbound call
 * 
 * Run this once to seed the audio, or re-run if you change the scripts or voice.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AUDIO_FILES = [
  {
    key: 'outbound_voicemail.mp3',
    script: 'Hey there, this is Cash Ridez Connect LLC. We responded on Indeed as well. Please text us back with the word CASH for the next steps. We look forward to your text, thank you.',
    description: 'Outbound voicemail (AMD detected answering machine)',
  },
  {
    key: 'inbound_voicemail.mp3',
    script: 'Thank you for calling Cash Ridez Connect LLC, sorry we missed your call. To connect with an agent please text the word AGENT to this number and an agent will return your call shortly. Please save this number for future connections.',
    description: 'Inbound missed-call voicemail',
  },
  {
    key: 'outbound_answered.mp3',
    script: 'Hey there, this is Cash Ridez Connect LLC. We responded on Indeed as well. Please text us back with the word CASH for the next steps. We look forward to your text, thank you.',
    description: 'Outbound answered (human picks up)',
  },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Allow both internal calls and admin calls
    // For simplicity, we just generate the audio without strict auth check
    // This function should only be called once to seed the audio files

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    const ELEVENLABS_AGENT_ID = Deno.env.get('ELEVENLABS_AGENT_ID');

    if (!ELEVENLABS_API_KEY || !ELEVENLABS_AGENT_ID) {
      return new Response(JSON.stringify({ error: 'ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: { key: string; url: string | null; error: string | null }[] = [];

    for (const file of AUDIO_FILES) {
      console.log(`Generating audio for ${file.key}...`);

      try {
        const response = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_AGENT_ID}`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': ELEVENLABS_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: file.script,
              model_id: 'eleven_turbo_v2_5',
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
                speed: 1.0,
              },
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`ElevenLabs error for ${file.key}:`, response.status, errorText);
          results.push({ key: file.key, url: null, error: `ElevenLabs API ${response.status}: ${errorText}` });
          continue;
        }

        const audioBuffer = await response.arrayBuffer();

        // Upload to call_center_audio bucket (public)
        const { error: uploadError } = await supabase.storage
          .from('call_center_audio')
          .upload(file.key, new Uint8Array(audioBuffer), {
            contentType: 'audio/mpeg',
            upsert: true,
          });

        if (uploadError) {
          console.error(`Upload error for ${file.key}:`, uploadError);
          results.push({ key: file.key, url: null, error: `Upload failed: ${uploadError.message}` });
          continue;
        }

        const { data: publicUrlData } = supabase.storage
          .from('call_center_audio')
          .getPublicUrl(file.key);

        results.push({ key: file.key, url: publicUrlData?.publicUrl || null, error: null });
        console.log(`SUCCESS: ${file.key} -> ${publicUrlData?.publicUrl}`);
      } catch (err) {
        console.error(`Error generating ${file.key}:`, err);
        results.push({ key: file.key, url: null, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Seed audio error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
