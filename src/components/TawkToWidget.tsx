import { useEffect } from 'react';

const TawkToWidget = () => {
  useEffect(() => {
    // Only load if not already loaded
    if (window.Tawk_API) {
      return;
    }

    // Load Tawk.to script
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://embed.tawk.to/691d0f3c1d15ae193bc30fa5/default';
    script.charset = 'UTF-8';
    script.setAttribute('crossorigin', '*');
    
    script.onload = () => {
      console.log('[TawkTo] Widget loaded successfully');
    };
    
    script.onerror = () => {
      console.error('[TawkTo] Failed to load widget');
    };

    document.body.appendChild(script);

    // Cleanup
    return () => {
      // Remove script on unmount
      const scripts = document.querySelectorAll('script[src*="tawk.to"]');
      scripts.forEach(s => s.remove());
      
      // Clean up Tawk_API
      if (window.Tawk_API) {
        delete window.Tawk_API;
      }
    };
  }, []);

  return null;
};

export default TawkToWidget;

// TypeScript declaration
declare global {
  interface Window {
    Tawk_API?: any;
    Tawk_LoadStart?: Date;
  }
}
