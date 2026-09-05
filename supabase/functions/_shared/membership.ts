/**
 * Membership price/product resolution shared by the billing edge functions.
 *
 * The effective price id comes from app_config.membership_price_id first and
 * falls back to the STRIPE_PRICE_ID secret. Either source alone is enough —
 * a missing env var is NOT an error when the DB has a value, and vice versa.
 *
 * The membership PRODUCT is derived from that price. Scoping entitlement by
 * product (never by the current price alone) keeps legacy $9.99 subscribers
 * entitled after a price change.
 */

/** Thrown when the membership product cannot be determined. Callers must treat
 * this as a RETRYABLE configuration error and never revoke access. */
export class MembershipConfigError extends Error {
  readonly retryable = true;
  constructor(message: string) {
    super(message);
    this.name = "MembershipConfigError";
  }
}

export async function resolveMembershipPriceId(supabase: any): Promise<string | null> {
  let fromDb: string | null = null;
  try {
    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "membership_price_id")
      .maybeSingle();
    if (error) {
      console.warn("[MEMBERSHIP] app_config lookup failed:", error.message);
    } else if (data?.value && String(data.value).trim() !== "") {
      fromDb = String(data.value).trim();
    }
  } catch (err) {
    console.warn("[MEMBERSHIP] app_config lookup threw:", (err as any)?.message);
  }

  const fromEnv = (Deno.env.get("STRIPE_PRICE_ID") ?? "").trim();
  return fromDb || fromEnv || null;
}

const productCache = new Map<string, string>();

/**
 * Resolve the membership product id from the effective price.
 * Throws MembershipConfigError when it cannot be determined.
 */
export async function resolveMembershipProductId(stripe: any, supabase: any): Promise<string> {
  const priceId = await resolveMembershipPriceId(supabase);
  if (!priceId) {
    throw new MembershipConfigError(
      "Membership price is not configured (app_config.membership_price_id and STRIPE_PRICE_ID are both empty)",
    );
  }

  const cached = productCache.get(priceId);
  if (cached) return cached;

  let price: any;
  try {
    price = await stripe.prices.retrieve(priceId);
  } catch (err) {
    throw new MembershipConfigError(
      `Could not load membership price ${priceId} from Stripe: ${(err as any)?.message ?? err}`,
    );
  }

  const product = typeof price?.product === "string" ? price.product : price?.product?.id;
  if (!product) {
    throw new MembershipConfigError(`Membership price ${priceId} has no product`);
  }

  productCache.set(priceId, product);
  return product;
}

/** Effective price id, throwing a retryable config error when unset. */
export async function requireMembershipPriceId(supabase: any): Promise<string> {
  const priceId = await resolveMembershipPriceId(supabase);
  if (!priceId) {
    throw new MembershipConfigError(
      "Membership price is not configured (app_config.membership_price_id and STRIPE_PRICE_ID are both empty)",
    );
  }
  return priceId;
}

/** Only same-origin app URLs may be used as checkout/portal return URLs. */
export function safeReturnUrl(candidate: unknown, origin: string, fallbackPath: string): string {
  const fallback = `${origin}${fallbackPath}`;
  if (typeof candidate !== "string" || !candidate) return fallback;
  try {
    const url = new URL(candidate, origin);
    const originUrl = new URL(origin);
    if (url.origin !== originUrl.origin) return fallback;
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}
