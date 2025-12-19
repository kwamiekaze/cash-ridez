/**
 * Phone number parsing utilities
 * Handles various formats: +1 470 444 7481, (470) 444-7481, 470-444-7481, etc.
 */

export interface ParsedContact {
  rawLine: string;
  firstName: string | null;
  phoneRaw: string | null;
  phoneE164: string | null;
  valid: boolean;
  skipReason?: string;
}

/**
 * Normalize a phone number to E.164 format
 * Handles spaces, dashes, parentheses, and various formats
 */
export function normalizePhoneToE164(phone: string): string | null {
  if (!phone) return null;
  
  // Remove all non-digit characters except leading +
  const hasPlus = phone.trim().startsWith('+');
  const digits = phone.replace(/\D/g, '');
  
  if (digits.length === 0) return null;
  
  // US 10-digit number (no country code)
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  
  // US 11-digit number starting with 1
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  
  // Already has + prefix and reasonable length
  if (hasPlus && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  
  // International number without + but with country code (12+ digits)
  if (digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }
  
  return null;
}

/**
 * Extract phone number from a line of text
 * Returns the phone segment and remaining text
 */
function extractPhoneFromText(text: string): { phone: string; remainder: string } | null {
  // Pattern to match phone numbers with optional country code, spaces, dashes, parentheses
  // Matches: +1 470 444 7481, +1(470)444-7481, (470) 444-7481, 470-444-7481, 4704447481
  const phonePatterns = [
    // International format with + first
    /(\+\d[\d\s\-().]{8,20}\d)/,
    // US format starting with (
    /(\([2-9]\d{2}\)\s*[\d\s\-().]{6,15}\d)/,
    // US format starting with digit, with separators
    /\b([2-9]\d{2}[\s\-.]?\d{3}[\s\-.]?\d{4})\b/,
    // Just digits (10-11 digits)
    /\b(\d{10,11})\b/,
  ];
  
  for (const pattern of phonePatterns) {
    const match = text.match(pattern);
    if (match) {
      const phone = match[1];
      const remainder = text.replace(phone, '').trim();
      return { phone, remainder };
    }
  }
  
  return null;
}

/**
 * Parse a single line to extract phone and first name
 */
export function parseContactLine(line: string): ParsedContact {
  const trimmed = line.trim();
  if (!trimmed) {
    return {
      rawLine: line,
      firstName: null,
      phoneRaw: null,
      phoneE164: null,
      valid: false,
      skipReason: 'Empty line'
    };
  }
  
  let firstName: string | null = null;
  let phoneRaw: string | null = null;
  
  // Try CSV format first: "Name,Phone" or "Phone,Name"
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
    
    // Check which part is the phone
    for (let i = 0; i < parts.length; i++) {
      const normalized = normalizePhoneToE164(parts[i]);
      if (normalized) {
        phoneRaw = parts[i];
        // First name is the other non-phone part
        for (let j = 0; j < parts.length; j++) {
          if (j !== i && parts[j] && !normalizePhoneToE164(parts[j])) {
            firstName = parts[j];
            break;
          }
        }
        break;
      }
    }
  }
  
  // Try to extract phone from text format
  if (!phoneRaw) {
    const extracted = extractPhoneFromText(trimmed);
    if (extracted) {
      phoneRaw = extracted.phone;
      // Get first word of remainder as first name
      const words = extracted.remainder.split(/\s+/).filter(w => w.length > 0);
      if (words.length > 0) {
        // Filter out words that look like phone number parts
        const nameWords = words.filter(w => !/^\d+$/.test(w) && !/^[\-().]+$/.test(w));
        if (nameWords.length > 0) {
          firstName = nameWords[0];
        }
      }
    }
  }
  
  const phoneE164 = phoneRaw ? normalizePhoneToE164(phoneRaw) : null;
  
  return {
    rawLine: trimmed,
    firstName,
    phoneRaw,
    phoneE164,
    valid: !!phoneE164,
    skipReason: !phoneE164 ? 'Invalid phone format' : undefined
  };
}

/**
 * Parse multiple lines of contacts from text
 * Deduplicates by phone number
 */
export function parseContactsFromText(text: string): ParsedContact[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const parsed: ParsedContact[] = [];
  const seenPhones = new Set<string>();
  
  for (const line of lines) {
    const contact = parseContactLine(line);
    
    // Check for duplicates
    if (contact.phoneE164) {
      if (seenPhones.has(contact.phoneE164)) {
        parsed.push({
          ...contact,
          valid: false,
          skipReason: 'Duplicate'
        });
      } else {
        seenPhones.add(contact.phoneE164);
        parsed.push(contact);
      }
    } else {
      parsed.push(contact);
    }
  }
  
  return parsed;
}

/**
 * Parse CSV file with header detection
 */
export function parseContactsFromCSV(text: string): ParsedContact[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  
  const [headerLine, ...dataLines] = lines;
  const headers = headerLine.toLowerCase().split(',').map(h => h.trim());
  
  const phoneIdx = headers.findIndex(h => 
    ['phone', 'phone_number', 'mobile', 'phonenumber', 'cell', 'number'].includes(h)
  );
  const nameIdx = headers.findIndex(h => 
    ['first_name', 'firstname', 'name', 'first'].includes(h)
  );
  
  // If no phone column found, try parsing each line
  if (phoneIdx === -1) {
    return parseContactsFromText(dataLines.join('\n'));
  }
  
  const parsed: ParsedContact[] = [];
  const seenPhones = new Set<string>();
  
  for (const line of dataLines) {
    const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    const phoneRaw = cols[phoneIdx] || '';
    const firstName = nameIdx >= 0 ? cols[nameIdx] || null : null;
    const phoneE164 = normalizePhoneToE164(phoneRaw);
    
    let valid = !!phoneE164;
    let skipReason: string | undefined;
    
    if (phoneE164 && seenPhones.has(phoneE164)) {
      valid = false;
      skipReason = 'Duplicate';
    } else if (phoneE164) {
      seenPhones.add(phoneE164);
    } else if (phoneRaw) {
      skipReason = 'Invalid phone format';
    } else {
      skipReason = 'Missing phone';
    }
    
    parsed.push({
      rawLine: line,
      firstName,
      phoneRaw: phoneRaw || null,
      phoneE164,
      valid,
      skipReason
    });
  }
  
  return parsed;
}
