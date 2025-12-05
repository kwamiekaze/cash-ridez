import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2 } from "lucide-react";
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

    setLoading(true);
    try {
      // Use Nominatim (OpenStreetMap) free geocoding API
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'CashRidez/1.0'
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        const formattedSuggestions = data.map((item: any) => ({
          display_name: item.display_name,
          place_id: item.place_id?.toString() || item.osm_id?.toString(),
        }));
        setSuggestions(formattedSuggestions);
        setIsOpen(formattedSuggestions.length > 0);
      }
    } catch (error) {
      console.error("Address search error:", error);
      // Fallback to local suggestions if API fails
      const localSuggestions = getLocalSuggestions(query);
      setSuggestions(localSuggestions);
      setIsOpen(localSuggestions.length > 0);
    } finally {
      setLoading(false);
    }
  };

  // Fallback local suggestions for common Georgia locations
  const getLocalSuggestions = (query: string): Suggestion[] => {
    const commonLocations = [
      "Atlanta, GA, USA",
      "Hartsfield-Jackson Atlanta International Airport, Atlanta, GA, USA",
      "Mercedes-Benz Stadium, Atlanta, GA, USA",
      "Georgia State Capitol, Atlanta, GA, USA",
      "Emory University, Atlanta, GA, USA",
      "Georgia Tech, Atlanta, GA, USA",
      "Piedmont Park, Atlanta, GA, USA",
      "Lenox Square Mall, Atlanta, GA, USA",
      "Buckhead, Atlanta, GA, USA",
      "Midtown Atlanta, GA, USA",
      "Decatur, GA, USA",
      "Marietta, GA, USA",
      "Sandy Springs, GA, USA",
      "Alpharetta, GA, USA",
      "Dunwoody, GA, USA",
      "Roswell, GA, USA",
      "Johns Creek, GA, USA",
      "Brookhaven, GA, USA",
      "Chamblee, GA, USA",
      "Doraville, GA, USA",
    ];

    const lowerQuery = query.toLowerCase();
    return commonLocations
      .filter(loc => loc.toLowerCase().includes(lowerQuery))
      .slice(0, 5)
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
    onChange(suggestion.display_name);
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
                index === selectedIndex && "bg-accent"
              )}
              onClick={() => handleSelect(suggestion)}
            >
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <span className="line-clamp-2">{suggestion.display_name}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
