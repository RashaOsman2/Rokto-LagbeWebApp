import { useState, useRef, useCallback, useEffect } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number; // Distance in pixels to trigger refresh
  maxPull?: number; // Maximum pull distance
}

interface UsePullToRefreshReturn {
  pullDistance: number;
  isRefreshing: boolean;
  isPulling: boolean;
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
}

export const usePullToRefresh = ({
  onRefresh,
  threshold = 80,
  maxPull = 120,
}: UsePullToRefreshOptions): UsePullToRefreshReturn => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  
  const startY = useRef(0);
  const currentY = useRef(0);
  const isAtTop = useRef(true);

  const checkIfAtTop = useCallback(() => {
    // Check if page is scrolled to top
    return window.scrollY <= 0;
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (isRefreshing) return;
    
    isAtTop.current = checkIfAtTop();
    if (!isAtTop.current) return;
    
    startY.current = e.touches[0].clientY;
    setIsPulling(true);
  }, [isRefreshing, checkIfAtTop]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (isRefreshing || !isAtTop.current) return;
    
    currentY.current = e.touches[0].clientY;
    const diff = currentY.current - startY.current;
    
    if (diff > 0) {
      // Apply resistance to the pull
      const resistance = 0.5;
      const newPullDistance = Math.min(diff * resistance, maxPull);
      setPullDistance(newPullDistance);
      
      // Prevent default scrolling when pulling down
      if (newPullDistance > 10) {
        e.preventDefault();
      }
    }
  }, [isRefreshing, maxPull]);

  const onTouchEnd = useCallback(async () => {
    if (isRefreshing) return;
    
    setIsPulling(false);
    
    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } catch (error) {
        console.error('Refresh failed:', error);
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
    
    startY.current = 0;
    currentY.current = 0;
  }, [isRefreshing, pullDistance, threshold, onRefresh]);

  // Reset pull distance when refresh completes
  useEffect(() => {
    if (!isRefreshing && !isPulling) {
      setPullDistance(0);
    }
  }, [isRefreshing, isPulling]);

  return {
    pullDistance,
    isRefreshing,
    isPulling,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  };
};
