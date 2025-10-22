import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Filter, X, Clock, Navigation, DollarSign, Ruler, Star, MapPin, Calendar } from 'lucide-react';

export type FilterOption = 
  | 'newest'
  | 'oldest'
  | 'closest-pickup'
  | 'closest-gps'
  | 'highest-paying'
  | 'shortest-distance'
  | 'longest-distance'
  | 'highest-rated'
  | 'local-only'
  | 'recently-updated';

interface TripFiltersProps {
  selectedFilters: FilterOption[];
  onFiltersChange: (filters: FilterOption[]) => void;
  onRequestLocation?: () => void;
  hasUserLocation: boolean;
}

const filterOptions: { value: FilterOption; label: string; icon: any; description: string }[] = [
  { value: 'newest', label: 'Newest First', icon: Clock, description: 'Most recently created trips' },
  { value: 'oldest', label: 'Oldest First', icon: Clock, description: 'Earliest created trips' },
  { value: 'closest-pickup', label: 'Closest Pickup Time', icon: Calendar, description: 'Soonest pickup time' },
  { value: 'closest-gps', label: 'Closest to Me (GPS)', icon: Navigation, description: 'Nearest pickup location' },
  { value: 'highest-paying', label: 'Highest Paying', icon: DollarSign, description: 'Highest payout first' },
  { value: 'shortest-distance', label: 'Shortest Distance', icon: Ruler, description: 'Shortest trip length' },
  { value: 'longest-distance', label: 'Longest Distance', icon: Ruler, description: 'Longest trip length' },
  { value: 'highest-rated', label: 'Highest Rated Riders', icon: Star, description: 'Best rated riders' },
  { value: 'local-only', label: 'Local Trips Only', icon: MapPin, description: 'Same city/county' },
  { value: 'recently-updated', label: 'Recently Updated', icon: Clock, description: 'Most recently modified' },
];

export default function TripFilters({ 
  selectedFilters, 
  onFiltersChange, 
  onRequestLocation,
  hasUserLocation 
}: TripFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleFilter = (filter: FilterOption) => {
    const newFilters = selectedFilters.includes(filter)
      ? selectedFilters.filter(f => f !== filter)
      : [...selectedFilters, filter];
    onFiltersChange(newFilters);
  };

  const clearAllFilters = () => {
    onFiltersChange([]);
  };

  const removeFilter = (filter: FilterOption) => {
    onFiltersChange(selectedFilters.filter(f => f !== filter));
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Filter className="w-4 h-4" />
                  Advanced Filters
                  {selectedFilters.length > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {selectedFilters.length}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-80">
                <div className="p-2 space-y-1">
                  {filterOptions.map((option) => {
                    const Icon = option.icon;
                    const isDisabled = option.value === 'closest-gps' && !hasUserLocation;
                    
                    return (
                      <div
                        key={option.value}
                        className={`flex items-start space-x-3 p-2 rounded-md hover:bg-accent cursor-pointer ${
                          isDisabled ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        onClick={() => {
                          if (option.value === 'closest-gps' && !hasUserLocation && onRequestLocation) {
                            onRequestLocation();
                          } else if (!isDisabled) {
                            toggleFilter(option.value);
                          }
                        }}
                      >
                        <Checkbox
                          id={option.value}
                          checked={selectedFilters.includes(option.value)}
                          disabled={isDisabled}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <Label
                            htmlFor={option.value}
                            className="flex items-center gap-2 font-medium cursor-pointer"
                          >
                            <Icon className="w-4 h-4" />
                            {option.label}
                          </Label>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {option.description}
                            {isDisabled && ' (Enable location access)'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {selectedFilters.length > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearAllFilters}
                className="text-muted-foreground"
              >
                Reset Filters
              </Button>
            )}
          </div>

          {!hasUserLocation && onRequestLocation && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={onRequestLocation}
              className="gap-2"
            >
              <Navigation className="w-4 h-4" />
              Enable Location
            </Button>
          )}
        </div>

        {/* Active Filters Display */}
        {selectedFilters.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedFilters.map((filter) => {
              const option = filterOptions.find(o => o.value === filter);
              if (!option) return null;
              const Icon = option.icon;
              
              return (
                <Badge 
                  key={filter} 
                  variant="secondary" 
                  className="gap-1.5 pr-1 py-1"
                >
                  <Icon className="w-3 h-3" />
                  {option.label}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 hover:bg-transparent"
                    onClick={() => removeFilter(filter)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </Badge>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
