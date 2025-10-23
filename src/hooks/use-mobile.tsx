import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const hasMatchMedia = typeof window.matchMedia === "function";
    const mql = hasMatchMedia
      ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
      : null;

    const onChange = () => {
      const matches = mql ? mql.matches : window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(matches);
    };

    if (mql) {
      // Safari <14 fallback: addListener/removeListener
      if (typeof mql.addEventListener === "function") {
        mql.addEventListener("change", onChange);
      } else if (typeof (mql as any).addListener === "function") {
        (mql as any).addListener(onChange);
      }
    } else {
      // Fallback for very old browsers without matchMedia
      window.addEventListener("resize", onChange);
    }

    // Initialize state immediately
    onChange();

    return () => {
      if (mql) {
        if (typeof mql.removeEventListener === "function") {
          mql.removeEventListener("change", onChange);
        } else if (typeof (mql as any).removeListener === "function") {
          (mql as any).removeListener(onChange);
        }
      } else {
        window.removeEventListener("resize", onChange);
      }
    };
  }, []);
  return !!isMobile;
}