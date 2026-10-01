import { describe, expect, it } from "vitest";
import { extractZip5, isGeorgiaZip, manualAddressFallback } from "../addressResolution";

describe("manual address fallback", () => {
  it("preserves a full rider-entered Georgia address without fake coordinates", () => {
    expect(manualAddressFallback("123 New Street, Atlanta, GA 30303")).toEqual({
      lat: null,
      lng: null,
      zip: "30303",
      verified: false,
    });
  });

  it("supports Georgia ZIP+4 addresses", () => {
    expect(extractZip5("5380 Peachtree Blvd, Chamblee, GA 30341-2790")).toBe("30341");
    expect(manualAddressFallback("5380 Peachtree Blvd, Chamblee, GA 30341-2790")?.zip).toBe("30341");
  });

  it("does not bypass the Georgia service area or accept incomplete text", () => {
    expect(isGeorgiaZip("30303")).toBe(true);
    expect(isGeorgiaZip("10001")).toBe(false);
    expect(manualAddressFallback("123 Main St, New York, NY 10001")).toBeNull();
    expect(manualAddressFallback("Atlanta, GA")).toBeNull();
  });
});
