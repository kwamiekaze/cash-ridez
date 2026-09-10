/**
 * Thin re-export of the shared email-campaign helpers so the admin UI and the
 * edge functions always agree on audience sizes, presets and throttling.
 */
export {
  CAMPAIGN_SENDER,
  DEFAULT_THROTTLE_SECONDS,
  DRIVER_AUDIENCE_SIZES,
  DRIVER_EMAIL_PRESETS,
  MAX_RECIPIENTS_PER_RUN,
  PRESET_FOOTER,
  estimateCompletionSeconds,
  formatDurationShort,
  isValidAudienceSize,
  renderTemplate,
  validateTemplates,
} from "../../supabase/functions/_shared/email-campaign-core";
export type {
  DriverAudienceSize,
  EmailPreset,
} from "../../supabase/functions/_shared/email-campaign-core";
