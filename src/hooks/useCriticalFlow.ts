import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

// Paths where we should NOT auto-refresh
const CRITICAL_PATHS = [
  '/trip/', // Trip in progress
  '/payment',
  '/billing',
  '/checkout',
  '/call',
];

export function useCriticalFlow(): boolean {
  const location = useLocation();

  const isInCriticalFlow = useMemo(() => {
    const currentPath = location.pathname.toLowerCase();
    return CRITICAL_PATHS.some(path => currentPath.includes(path));
  }, [location.pathname]);

  return isInCriticalFlow;
}
