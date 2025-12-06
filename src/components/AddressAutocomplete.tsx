import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2, Edit3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: "pickup" | "dropoff";
  className?: string;
  id?: string;
  required?: boolean;
}

interface Suggestion {
  display_name: string;
  place_id: string;
  isCustomOption?: boolean;
}

// List of US states and their abbreviations (excluding Georgia)
const NON_GA_STATE_PATTERNS = [
  // State abbreviations (2 letters)
  /\bAL\b/i, /\bAK\b/i, /\bAZ\b/i, /\bAR\b/i, /\bCA\b/i, /\bCO\b/i, /\bCT\b/i, /\bDE\b/i,
  /\bFL\b/i, /\bHI\b/i, /\bID\b/i, /\bIL\b/i, /\bIN\b/i, /\bIA\b/i, /\bKS\b/i, /\bKY\b/i,
  /\bLA\b/i, /\bME\b/i, /\bMD\b/i, /\bMA\b/i, /\bMI\b/i, /\bMN\b/i, /\bMS\b/i, /\bMO\b/i,
  /\bMT\b/i, /\bNE\b/i, /\bNV\b/i, /\bNH\b/i, /\bNJ\b/i, /\bNM\b/i, /\bNY\b/i, /\bNC\b/i,
  /\bND\b/i, /\bOH\b/i, /\bOK\b/i, /\bOR\b/i, /\bPA\b/i, /\bRI\b/i, /\bSC\b/i, /\bSD\b/i,
  /\bTN\b/i, /\bTX\b/i, /\bUT\b/i, /\bVT\b/i, /\bVA\b/i, /\bWA\b/i, /\bWV\b/i, /\bWI\b/i, /\bWY\b/i,
  /\bDC\b/i,
  // Full state names
  /alabama/i, /alaska/i, /arizona/i, /arkansas/i, /california/i, /colorado/i, /connecticut/i,
  /delaware/i, /florida/i, /hawaii/i, /idaho/i, /illinois/i, /indiana/i, /iowa/i, /kansas/i,
  /kentucky/i, /louisiana/i, /maine/i, /maryland/i, /massachusetts/i, /michigan/i, /minnesota/i,
  /mississippi/i, /missouri/i, /montana/i, /nebraska/i, /nevada/i, /new hampshire/i, /new jersey/i,
  /new mexico/i, /new york/i, /north carolina/i, /north dakota/i, /ohio/i, /oklahoma/i, /oregon/i,
  /pennsylvania/i, /rhode island/i, /south carolina/i, /south dakota/i, /tennessee/i, /texas/i,
  /utah/i, /vermont/i, /virginia/i, /washington/i, /west virginia/i, /wisconsin/i, /wyoming/i,
];

// Georgia ZIP code prefixes (30xxx, 31xxx, 398xx, 399xx)
const GA_ZIP_PREFIXES = ['30', '31', '398', '399'];

/**
 * Check if query explicitly mentions a non-Georgia state
 */
function isNonGeorgiaQuery(query: string): boolean {
  // Check for non-GA state patterns
  for (const pattern of NON_GA_STATE_PATTERNS) {
    if (pattern.test(query)) {
      return true;
    }
  }
  
  // Check for ZIP codes that are clearly not in Georgia
  const zipMatch = query.match(/\b(\d{5})\b/);
  if (zipMatch) {
    const zip = zipMatch[1];
    const isGaZip = GA_ZIP_PREFIXES.some(prefix => zip.startsWith(prefix));
    if (!isGaZip) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if an address result is in Georgia
 */
function isGeorgiaAddress(address: any): boolean {
  if (!address) return false;
  
  // Check state field
  const state = address.state || address['ISO3166-2-lvl4'] || '';
  if (state.toLowerCase().includes('georgia') || state.toUpperCase() === 'GA') {
    return true;
  }
  
  // Check if display_name contains Georgia
  const displayName = address.display_name || '';
  if (/\bGeorgia\b/i.test(displayName) || /\bGA\b/.test(displayName)) {
    return true;
  }
  
  return false;
}

/**
 * Format address to: number + street, city, county, state, country
 * Removes neighborhood names, building names, complex names
 */
function formatCleanAddress(rawAddress: string, addressDetails?: any): string {
  if (!rawAddress) return rawAddress;
  
  // If we have address details from API, construct clean address
  if (addressDetails) {
    const parts: string[] = [];
    
    // House number + street
    if (addressDetails.house_number && addressDetails.road) {
      parts.push(`${addressDetails.house_number} ${addressDetails.road}`);
    } else if (addressDetails.road) {
      parts.push(addressDetails.road);
    }
    
    // City (prefer city over town/village)
    const city = addressDetails.city || addressDetails.town || addressDetails.village || addressDetails.municipality;
    if (city) parts.push(city);
    
    // County (if available)
    if (addressDetails.county) parts.push(addressDetails.county);
    
    // State
    if (addressDetails.state) parts.push(addressDetails.state);
    
    // Country
    if (addressDetails.country) parts.push(addressDetails.country);
    
    if (parts.length > 0) {
      return parts.join(', ');
    }
  }
  
  // Fallback: clean up raw address string by removing common neighborhood patterns
  let cleaned = rawAddress;
  return cleaned.replace(/,\s*,/g, ',').replace(/^\s*,\s*/, '').replace(/\s*,\s*$/, '').trim();
}

export function AddressAutocomplete({
  value,
  onChange,
  placeholder = "Enter address",
  icon = "pickup",
  className,
  id,
  required,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [currentQuery, setCurrentQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchAddresses = async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    setCurrentQuery(query);
    setLoading(true);
    
    // Determine if we should restrict to Georgia
    const restrictToGeorgia = !isNonGeorgiaQuery(query);
    
    try {
      // Build the search query - add Georgia context for local searches
      let searchQuery = query;
      let viewbox = '';
      let bounded = '';
      
      if (restrictToGeorgia) {
        // Add Georgia to query if not already present
        if (!/georgia/i.test(query) && !/\bGA\b/.test(query)) {
          searchQuery = `${query}, Georgia`;
        }
        // Georgia bounding box (approximate)
        // SW corner: 30.35, -85.60 | NE corner: 35.00, -80.75
        viewbox = '&viewbox=-85.60,30.35,-80.75,35.00';
        bounded = '&bounded=1';
      }
      
      // Use Nominatim (OpenStreetMap) free geocoding API
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&q=${encodeURIComponent(searchQuery)}&limit=8&addressdetails=1${viewbox}${bounded}`,
        {
          headers: {
            'User-Agent': 'CashRidez/1.0'
          }
        }
      );
      
      if (response.ok) {
        let data = await response.json();
        
        // Filter results to Georgia only if we're in restricted mode
        if (restrictToGeorgia) {
          data = data.filter((item: any) => {
            const addr = item.address || {};
            const state = addr.state || '';
            return state.toLowerCase().includes('georgia') || 
                   state.toUpperCase() === 'GA' ||
                   /\bGeorgia\b/i.test(item.display_name);
          });
        }
        
        const formattedSuggestions: Suggestion[] = data
          .slice(0, 5) // Limit to 5 results
          .map((item: any) => ({
            display_name: formatCleanAddress(item.display_name, item.address),
            place_id: item.place_id?.toString() || item.osm_id?.toString(),
          }));
        
        // Add "Address not shown" option at the end
        const customOption: Suggestion = {
          display_name: `Use "${query}" as entered`,
          place_id: 'custom-address',
          isCustomOption: true,
        };
        
        setSuggestions([...formattedSuggestions, customOption]);
        setIsOpen(true);
      }
    } catch (error) {
      console.error("Address search error:", error);
      // Fallback to local suggestions if API fails + custom option
      const localSuggestions = getLocalSuggestions(query);
      const customOption: Suggestion = {
        display_name: `Use "${query}" as entered`,
        place_id: 'custom-address',
        isCustomOption: true,
      };
      setSuggestions([...localSuggestions, customOption]);
      setIsOpen(true);
    } finally {
      setLoading(false);
    }
  };

  // Fallback local suggestions for common Georgia locations
  const getLocalSuggestions = (query: string): Suggestion[] => {
    const commonLocations = [
      "Atlanta, Fulton County, Georgia, USA",
      "Hartsfield-Jackson Atlanta International Airport, Atlanta, Georgia, USA",
      "Mercedes-Benz Stadium, Atlanta, Georgia, USA",
      "Georgia State Capitol, Atlanta, Georgia, USA",
      "Emory University, Atlanta, Georgia, USA",
      "Georgia Tech, Atlanta, Georgia, USA",
      "Piedmont Park, Atlanta, Georgia, USA",
      "Lenox Square Mall, Atlanta, Georgia, USA",
      "Buckhead, Atlanta, Georgia, USA",
      "Midtown, Atlanta, Georgia, USA",
      "Decatur, DeKalb County, Georgia, USA",
      "Marietta, Cobb County, Georgia, USA",
      "Sandy Springs, Fulton County, Georgia, USA",
      "Alpharetta, Fulton County, Georgia, USA",
      "Dunwoody, DeKalb County, Georgia, USA",
      "Roswell, Fulton County, Georgia, USA",
      "Johns Creek, Fulton County, Georgia, USA",
      "Brookhaven, DeKalb County, Georgia, USA",
      "Chamblee, DeKalb County, Georgia, USA",
      "Doraville, DeKalb County, Georgia, USA",
      "Newnan, Coweta County, Georgia, USA",
      "Fairburn, Fulton County, Georgia, USA",
      "Fayetteville, Fayette County, Georgia, USA",
      "Peachtree City, Fayette County, Georgia, USA",
      "Stockbridge, Henry County, Georgia, USA",
      "McDonough, Henry County, Georgia, USA",
      "Lawrenceville, Gwinnett County, Georgia, USA",
      "Duluth, Gwinnett County, Georgia, USA",
      "Suwanee, Gwinnett County, Georgia, USA",
      "Snellville, Gwinnett County, Georgia, USA",
    ];

    const lowerQuery = query.toLowerCase();
    return commonLocations
      .filter(loc => loc.toLowerCase().includes(lowerQuery))
      .slice(0, 4) // Limit to 4 to leave room for custom option
      .map((loc, idx) => ({
        display_name: loc,
        place_id: `local-${idx}`,
      }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setSelectedIndex(-1);

    // Debounce API calls
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      searchAddresses(newValue);
    }, 300);
  };

  const handleSelect = (suggestion: Suggestion) => {
    if (suggestion.isCustomOption) {
      // Use the raw typed text, keeping what user entered
      onChange(currentQuery || value);
    } else {
      onChange(suggestion.display_name);
    }
    setSuggestions([]);
    setIsOpen(false);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[selectedIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setSelectedIndex(-1);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MapPin className={cn(
          "absolute left-3 top-3 h-4 w-4",
          icon === "pickup" ? "text-success" : "text-destructive"
        )} />
        <Input
          id={id}
          placeholder={placeholder}
          className={cn("pl-10", className)}
          required={required}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-60 overflow-auto">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.place_id}
              type="button"
              className={cn(
                "w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors",
                index === selectedIndex && "bg-accent",
                suggestion.isCustomOption && "border-t border-border bg-muted/50"
              )}
              onClick={() => handleSelect(suggestion)}
            >
              <div className="flex items-start gap-2">
                {suggestion.isCustomOption ? (
                  <Edit3 className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                ) : (
                  <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                )}
                <span className={cn(
                  "line-clamp-2",
                  suggestion.isCustomOption && "text-warning font-medium"
                )}>
                  {suggestion.isCustomOption ? "Address not shown – use what I typed" : suggestion.display_name}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
