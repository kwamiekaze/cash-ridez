/**
 * Address Formatting Utility
 * Formats addresses consistently and generates navigation links for maps
 */

// US street type abbreviations
const US_ABBREVIATIONS: Record<string, string> = {
  'highway': 'Hwy',
  'street': 'St',
  'road': 'Rd',
  'avenue': 'Ave',
  'boulevard': 'Blvd',
  'drive': 'Dr',
  'lane': 'Ln',
  'court': 'Ct',
  'place': 'Pl',
  'circle': 'Cir',
  'parkway': 'Pkwy',
  'terrace': 'Ter',
  'way': 'Way',
  'northeast': 'NE',
  'northwest': 'NW',
  'southeast': 'SE',
  'southwest': 'SW',
};

// State name to abbreviation mapping
const STATE_ABBREVIATIONS: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC',
};

/**
 * Apply US-style abbreviations to street names
 */
function applyAbbreviations(text: string): string {
  let result = text;
  Object.entries(US_ABBREVIATIONS).forEach(([full, abbr]) => {
    // Match word boundaries, case insensitive
    const regex = new RegExp(`\\b${full}\\b`, 'gi');
    result = result.replace(regex, abbr);
  });
  return result;
}

/**
 * Abbreviate state names to 2-letter codes
 */
function abbreviateState(state: string): string {
  const lowerState = state.toLowerCase().trim();
  return STATE_ABBREVIATIONS[lowerState] || state;
}

/**
 * Extract ZIP code from address string
 */
function extractZipCode(address: string): string | null {
  // Match 5-digit US ZIP code
  const zipMatch = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return zipMatch ? zipMatch[1] : null;
}

/**
 * Parse and extract city from address
 * Handles cases where county is present instead of city
 */
function extractCity(address: string): string | null {
  const parts = address.split(',').map(p => p.trim());
  
  // Look for a part that looks like a city (not a county, state, country, or street number)
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    // Skip if it's a county
    if (part.toLowerCase().includes('county')) continue;
    // Skip if it's a state name or abbreviation
    if (STATE_ABBREVIATIONS[part.toLowerCase()] || Object.values(STATE_ABBREVIATIONS).includes(part.toUpperCase())) continue;
    // Skip if it's a country
    if (part.toLowerCase() === 'united states' || part.toLowerCase() === 'usa' || part.toLowerCase() === 'us') continue;
    // Skip if it's a ZIP code
    if (/^\d{5}(-\d{4})?$/.test(part)) continue;
    // Skip if it's clearly a street (has numbers at start)
    if (/^\d+\s/.test(part)) continue;
    
    return part;
  }
  
  return null;
}

/**
 * Extract state from address
 */
function extractState(address: string): string | null {
  const parts = address.split(',').map(p => p.trim());
  
  for (const part of parts) {
    const lowerPart = part.toLowerCase();
    // Check for full state name
    if (STATE_ABBREVIATIONS[lowerPart]) {
      return STATE_ABBREVIATIONS[lowerPart];
    }
    // Check for state abbreviation
    if (Object.values(STATE_ABBREVIATIONS).includes(part.toUpperCase())) {
      return part.toUpperCase();
    }
  }
  
  return null;
}

/**
 * Check if address is in United States
 */
function isUSAddress(address: string): boolean {
  const lowerAddress = address.toLowerCase();
  return lowerAddress.includes('united states') || 
         lowerAddress.includes(', usa') || 
         lowerAddress.includes(', us') ||
         // Has a US state
         Object.keys(STATE_ABBREVIATIONS).some(state => lowerAddress.includes(state)) ||
         // Has a 5-digit ZIP
         /\b\d{5}\b/.test(address);
}

/**
 * Format an address to be compact and consistent
 * Output format: "123 Main St, City, GA, 30301, United States"
 */
export function formatAddress(address: string | null | undefined): string {
  if (!address) return '';
  
  // If it's a very short address (like "South" or "Here"), just return as-is
  if (address.length < 10 || !address.includes(',')) {
    return address;
  }

  const parts = address.split(',').map(p => p.trim()).filter(p => p);
  
  // Detect if this is a US address to apply abbreviations
  const isUS = isUSAddress(address);
  
  // Try to identify components
  const street = parts[0] || '';
  const city = extractCity(address);
  const state = extractState(address);
  const zip = extractZipCode(address);
  const hasCountry = address.toLowerCase().includes('united states');
  
  // Build formatted address
  const formattedParts: string[] = [];
  
  // Street (with abbreviations for US)
  if (street) {
    formattedParts.push(isUS ? applyAbbreviations(street) : street);
  }
  
  // City (skip county-style names)
  if (city && !city.toLowerCase().includes('county')) {
    formattedParts.push(city);
  }
  
  // State (abbreviated)
  if (state) {
    formattedParts.push(state);
  }
  
  // ZIP code
  if (zip) {
    formattedParts.push(zip);
  }
  
  // Country (only for US addresses with explicit country)
  if (hasCountry) {
    formattedParts.push('United States');
  }
  
  // If we couldn't parse properly, fall back to cleaned original
  if (formattedParts.length < 2) {
    // At minimum, remove "County" parts and apply abbreviations
    const cleaned = parts
      .filter(p => !p.toLowerCase().includes('county'))
      .join(', ');
    return isUS ? applyAbbreviations(cleaned) : cleaned;
  }
  
  return formattedParts.join(', ');
}

/**
 * Detect if running on iOS
 */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Detect if running on Android
 */
function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

export interface NavigationLinkOptions {
  lat?: number;
  lng?: number;
  address: string;
  isDestination?: boolean; // If true, will use navigation/directions mode
}

/**
 * Generate a navigation URL that opens in the user's preferred maps app
 */
export function getNavigationUrl(options: NavigationLinkOptions): string {
  const { lat, lng, address, isDestination = false } = options;
  
  // Prefer coordinates when available for accuracy
  const hasCoords = typeof lat === 'number' && typeof lng === 'number' && 
                    lat !== 0 && lng !== 0 && 
                    // Check for the default coordinates that indicate no real location
                    !(lat === 40.7128 && lng === -74.006);
  
  const encodedAddress = encodeURIComponent(address);
  
  if (isIOS()) {
    // Apple Maps deep link
    if (isDestination) {
      return hasCoords 
        ? `https://maps.apple.com/?daddr=${lat},${lng}`
        : `https://maps.apple.com/?daddr=${encodedAddress}`;
    }
    return hasCoords
      ? `https://maps.apple.com/?q=${lat},${lng}`
      : `https://maps.apple.com/?q=${encodedAddress}`;
  }
  
  // Google Maps for Android and desktop
  if (isDestination) {
    return hasCoords
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`;
  }
  
  return hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
}

/**
 * Open navigation to a location
 * Handles popup blockers with fallback
 */
export function openNavigation(options: NavigationLinkOptions): void {
  const url = getNavigationUrl(options);
  
  // Try to open in new tab/window
  const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
  
  // If blocked by popup blocker, redirect current page
  if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
    window.location.href = url;
  }
}
