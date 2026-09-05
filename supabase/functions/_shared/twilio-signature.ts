/**
 * Twilio request signature verification (X-Twilio-Signature).
 *
 * Algorithm: base64(HMAC-SHA1(authToken, url + sortedFormParamsConcatenated)).
 * The URL must be the EXACT externally visible URL Twilio requested, including
 * query string, so callbacks cannot be forged by replaying against a different
 * path.
 *
 * Uses Web Crypto only, so it runs in Deno and in test runners alike.
 */

/** Build the canonical string Twilio signs. */
export function buildSignaturePayload(url: string, params: Record<string, string>): string {
  const keys = Object.keys(params).sort();
  let payload = url;
  for (const key of keys) {
    payload += key + params[key];
  }
  return payload;
}

/**
 * Reconstruct the externally visible URL for a request behind a proxy.
 * Supabase Edge Functions sit behind a proxy that sets x-forwarded-* headers;
 * `req.url` may carry an internal host, which would break verification.
 */
export function externalRequestUrl(rawUrl: string, headers: Headers): string {
  const url = new URL(rawUrl);
  const forwardedHost = headers.get("x-forwarded-host") || headers.get("host");
  const forwardedProto = headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) {
    url.host = forwardedHost;
    url.protocol = `${forwardedProto}:`;
  }
  return url.toString();
}

function base64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}

/** Compute the expected signature for a url + params pair. */
export async function computeTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(buildSignaturePayload(url, params)),
  );
  return base64(signature);
}

/** Constant-time-ish string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verify a Twilio webhook signature. Returns false on any mismatch. */
export async function verifyTwilioSignature(opts: {
  authToken: string | undefined;
  signature: string | null;
  url: string;
  params: Record<string, string>;
}): Promise<boolean> {
  if (!opts.authToken || !opts.signature) return false;
  try {
    const expected = await computeTwilioSignature(opts.authToken, opts.url, opts.params);
    return safeEqual(expected, opts.signature);
  } catch {
    return false;
  }
}

/** Read an x-www-form-urlencoded body into a plain params object. */
export function formDataToParams(form: FormData): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") params[key] = value;
  }
  return params;
}
