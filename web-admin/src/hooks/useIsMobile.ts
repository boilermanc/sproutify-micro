import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;
const DESKTOP_VIEW_STORAGE_KEY = 'sproutify_prefer_desktop_view';

/**
 * Hook to detect if the current viewport is mobile-sized.
 * Uses window.matchMedia for better performance.
 *
 * @returns Object with:
 *   - isMobile: true if viewport < 768px
 *   - prefersDesktopView: true if user has overridden to desktop view
 *   - shouldUseMobileLayout: true if mobile AND not overridden to desktop
 *   - setDesktopViewPreference: function to toggle desktop view preference
 */
export const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < MOBILE_BREAKPOINT;
  });

  const [prefersDesktopView, setPrefersDesktopView] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(DESKTOP_VIEW_STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };

    // Set initial value
    handleChange(mediaQuery);

    // Listen for changes
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  const setDesktopViewPreference = (preferDesktop: boolean) => {
    setPrefersDesktopView(preferDesktop);
    if (preferDesktop) {
      localStorage.setItem(DESKTOP_VIEW_STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(DESKTOP_VIEW_STORAGE_KEY);
    }
  };

  // User should see mobile layout if:
  // - Device is mobile AND user hasn't opted for desktop view
  const shouldUseMobileLayout = isMobile && !prefersDesktopView;

  return {
    isMobile,
    prefersDesktopView,
    shouldUseMobileLayout,
    setDesktopViewPreference,
  };
};

/**
 * Standalone function to check desktop view preference without the hook.
 * Useful for initial render decisions.
 */
export const getDesktopViewPreference = (): boolean => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(DESKTOP_VIEW_STORAGE_KEY) === 'true';
};

/**
 * Standalone function to check if device is mobile without the hook.
 * Useful for initial render decisions.
 */
export const checkIsMobile = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
};
