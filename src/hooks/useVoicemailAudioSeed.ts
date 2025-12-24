import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const VOICEMAIL_SEED_KEY = "cr_voicemail_seeded_vm2_v2";
const VOICEMAIL_SOURCE_PATH = "/audio/cashridez_voicemail_source.mp3";

/**
 * Ensures the backend voicemail audio file exists as a public, stable URL.
 *
 * It uploads the bundled voicemail recording (served from this app) into
 * backend file storage as `call_center_audio/cashridez_voicemail.mp3` by
 * invoking the existing `upload-voicemail-audio` backend function.
 */
export function useVoicemailAudioSeed() {
  useEffect(() => {
    const run = async () => {
      try {
        if (typeof window === "undefined") return;
        if (localStorage.getItem(VOICEMAIL_SEED_KEY) === "1") return;

        const sourceUrl = new URL(VOICEMAIL_SOURCE_PATH, window.location.origin).toString();

        const { error } = await supabase.functions.invoke("upload-voicemail-audio", {
          body: { url: sourceUrl },
        });

        if (error) throw error;

        localStorage.setItem(VOICEMAIL_SEED_KEY, "1");
      } catch (e) {
        // Silent fail; we'll retry on next load until it succeeds.
        console.warn("[voicemail-seed] failed", e);
      }
    };

    run();
  }, []);
}
