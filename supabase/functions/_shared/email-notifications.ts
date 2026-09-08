/**
 * Single entry point for the email event system's shared helpers.
 *
 * The implementation lives in ./email/* ; this barrel exists so functions can
 * import one stable path instead of four.
 */

export * from "./email/escape.ts";
export * from "./email/recipients.ts";
export * from "./email/eligibility.ts";
export * from "./email/sender.ts";
export * from "./email/templates.ts";
