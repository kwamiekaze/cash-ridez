// Haversine formula for calculating distance between two GPS coordinates
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  unit: 'miles' | 'km' = 'miles'
): number => {
  const R = unit === 'miles' ? 3959 : 6371; // Earth's radius in miles or km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance * 10) / 10; // Round to 1 decimal place
};

const toRad = (degrees: number): number => {
  return degrees * (Math.PI / 180);
};

// Get user's current location using HTML5 Geolocation API
export const getCurrentLocation = (): Promise<{ lat: number; lng: number }> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        // Provide specific error messages based on error code
        let message = 'Unable to get your location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = 'Location access denied. Please enable location permissions in your browser settings.';
            break;
          case error.POSITION_UNAVAILABLE:
            message = 'Location information unavailable. Please check your device settings.';
            break;
          case error.TIMEOUT:
            message = 'Location request timed out. Please try again.';
            break;
        }
        reject(new Error(message));
      },
      {
        enableHighAccuracy: false, // Changed to false for faster response
        timeout: 15000, // Increased timeout to 15 seconds
        maximumAge: 60000, // Cache for 1 minute (reduced for more accurate location)
      }
    );
  });
};

// Calculate trip distance (pickup to dropoff)
export const calculateTripDistance = (
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
  unit: 'miles' | 'km' = 'miles'
): number => {
  return calculateDistance(pickupLat, pickupLng, dropoffLat, dropoffLng, unit);
};
