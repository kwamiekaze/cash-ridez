export type EdgeFunctionErrorInfo = {
  status?: number;
  message: string;
  raw?: string;
};

function tryParseJson(raw: string): any | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function formatEdgeFunctionError(err: any): Promise<EdgeFunctionErrorInfo> {
  const response = err?.context?.response;
  const statusCandidate = response?.status ?? err?.status;
  const status = typeof statusCandidate === "number" ? statusCandidate : undefined;

  // Prefer reading the raw body from the underlying Response (most accurate)
  if (response && typeof response.text === "function") {
    try {
      const raw = await response.text();
      const parsed = raw ? tryParseJson(raw) : null;
      const message =
        parsed?.error ||
        parsed?.message ||
        parsed?.details ||
        err?.message ||
        raw ||
        "Unknown error";

      return { status, message: String(message), raw };
    } catch {
      // fall through
    }
  }

  const message = err?.message || "Unknown error";
  return { status, message: String(message) };
}
