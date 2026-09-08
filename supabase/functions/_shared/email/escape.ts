/**
 * Centralised escaping helpers for the email event system.
 *
 * Every user-supplied value that reaches an HTML body, a subject line, a
 * Reply-To header or a log line must pass through one of these functions.
 * They are intentionally dependency-free so both Deno (edge functions) and
 * Node (vitest) can import them.
 */

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
  "=": "&#61;",
  "/": "&#47;",
};

/** Escape an arbitrary value for interpolation into HTML text or attributes. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"'`=/]/g, (c) => HTML_ENTITIES[c] ?? c);
}

/**
 * Escape a value for a header-ish single-line context (subject, display name).
 * Strips CR/LF (header injection), control characters and collapses spaces.
 */
export function escapeHeader(value: unknown, maxLength = 200): string {
  if (value === null || value === undefined) return "";
  const flat = String(value)
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > maxLength ? `${flat.slice(0, maxLength - 1)}…` : flat;
}

/**
 * Escape a value before it is written to a log line. Never log URLs that may
 * carry a signed token — use `redactUrl` for those.
 */
export function escapeLog(value: unknown, maxLength = 300): string {
  return escapeHeader(value, maxLength).replace(/[<>]/g, "");
}

/** Reduce a URL to scheme+host+path so signed query tokens never hit the logs. */
export function redactUrl(value: unknown): string {
  if (typeof value !== "string" || value === "") return "";
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}${url.search ? "?<redacted>" : ""}`;
  } catch {
    return "<invalid-url>";
  }
}

/**
 * Validate a value for use as a Reply-To / recipient address. Returns the
 * lower-cased address or null. Anything with whitespace, a header break or a
 * display name is rejected outright.
 */
export function safeEmailAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "" || trimmed.length > 254) return null;
  if (!/^[^\s@<>",;:]+@[^\s@<>",;:]+\.[a-z]{2,}$/.test(trimmed)) return null;
  return trimmed;
}

/** Only same-origin http(s) links may appear in an email body. */
export function safeAppLink(path: unknown, appBaseUrl: string): string {
  const base = appBaseUrl.replace(/\/+$/, "");
  if (typeof path !== "string" || path === "") return base || "";
  try {
    const url = new URL(path, `${base}/`);
    const origin = new URL(base);
    if (url.origin !== origin.origin) return base;
    if (url.protocol !== "http:" && url.protocol !== "https:") return base;
    return url.toString();
  } catch {
    return base;
  }
}
