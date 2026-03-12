import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MapPin, Search, Loader2, X, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LocationResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
}

interface LocationSearchProps {
  value: string;
  onChange: (value: string) => void;
  onLocationSelect: (location: { name: string; address: string; lat: number; lng: number }) => void;
  placeholder?: string;
  className?: string;
}

export const LocationSearch: React.FC<LocationSearchProps> = ({
  value,
  onChange,
  onLocationSelect,
  placeholder = "Search hospital or place...",
  className,
}) => {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<LocationResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const debounceRef = useRef<NodeJS.Timeout>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Search using Nominatim (OpenStreetMap)
  const searchLocation = async (searchQuery: string) => {
    if (searchQuery.length < 3) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    try {
      // Focus search on Bangladesh for better local results
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=bd&limit=5&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'en',
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setResults(data);
        setShowResults(data.length > 0);
      }
    } catch (error) {
      console.error('Location search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      if (query && query !== value) {
        searchLocation(query);
      }
    }, 400);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (result: LocationResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    
    // Extract a cleaner name from the display name
    const nameParts = result.display_name.split(',');
    const name = nameParts[0].trim();
    
    setQuery(result.display_name);
    onChange(name);
    setSelectedLocation({ lat, lng });
    onLocationSelect({
      name,
      address: result.display_name,
      lat,
      lng,
    });
    setShowResults(false);
    setResults([]);
  };

  const handleClear = () => {
    setQuery('');
    onChange('');
    setSelectedLocation(null);
    setResults([]);
    onLocationSelect({ name: '', address: '', lat: 0, lng: 0 });
  };

  const openInGoogleMaps = () => {
    if (selectedLocation) {
      window.open(
        `https://maps.google.com/maps?q=${selectedLocation.lat},${selectedLocation.lng}`,
        '_blank'
      );
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value) {
              handleClear();
            }
          }}
          onFocus={() => {
            if (results.length > 0) setShowResults(true);
          }}
          placeholder={placeholder}
          className="pl-10 pr-20"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isSearching && (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          )}
          {selectedLocation && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={openInGoogleMaps}
              title="View in Google Maps"
            >
              <Navigation className="w-3.5 h-3.5 text-primary" />
            </Button>
          )}
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleClear}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Search Results Dropdown */}
      {showResults && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
          {results.map((result) => (
            <button
              key={result.place_id}
              type="button"
              className="w-full px-3 py-2.5 text-left hover:bg-accent transition-colors flex items-start gap-2 border-b border-border last:border-0"
              onClick={() => handleSelect(result)}
            >
              <MapPin className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
              <span className="text-sm line-clamp-2">{result.display_name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Selected location indicator */}
      {selectedLocation && (
        <p className="text-xs text-success mt-1 flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          Location captured - donors can navigate here
        </p>
      )}
    </div>
  );
};
