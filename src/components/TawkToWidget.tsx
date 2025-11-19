import { useEffect } from 'react';

// Tawk.to widget configuration
const TAWK_PROPERTY_ID = '691d0f3c1d15ae193bc30fa5';
const TAWK_WIDGET_KEY = '1jaco71ui';

const TawkToWidget = () => {
  useEffect(() => {
    console.log('[TawkTo] Initializing with property ID:', TAWK_PROPERTY_ID);
    
    // Check if already loaded
    if (window.Tawk_API) {
      console.log('[TawkTo] Widget already loaded, skipping');
      return;
    }

    // Initialize Tawk variables FIRST (critical!)
    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();

    // Create and load script
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://embed.tawk.to/${TAWK_PROPERTY_ID}/${TAWK_WIDGET_KEY}`;
    script.charset = 'UTF-8';
    script.setAttribute('crossorigin', '*');
    
    script.onload = () => {
      console.log('[TawkTo] ✅ Script loaded successfully!');
      console.log('[TawkTo] Tawk_API state:', window.Tawk_API);
    };
    
    script.onerror = (error) => {
      console.error('[TawkTo] ❌ Failed to load script:', error);
    };

    // Insert at the beginning of body (more aggressive)
    const firstScript = document.getElementsByTagName('script')[0];
    if (firstScript && firstScript.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
      console.log('[TawkTo] Script element inserted into DOM');
    } else {
      document.body.appendChild(script);
      console.log('[TawkTo] Script element appended to body');
    }

    // Cleanup
    return () => {
      console.log('[TawkTo] Component unmounting, cleaning up...');
      const scripts = document.querySelectorAll('script[src*="tawk.to"]');
      scripts.forEach(s => s.remove());
      
      if (window.Tawk_API) {
        delete window.Tawk_API;
      }
      if (window.Tawk_LoadStart) {
        delete window.Tawk_LoadStart;
      }
    };
  }, []);

  return null;
};

export default TawkToWidget;

// TypeScript declarations
declare global {
  interface Window {
    Tawk_API?: any;
    Tawk_LoadStart?: Date;
  }
}
