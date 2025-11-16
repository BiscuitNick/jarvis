import { useState, useCallback } from 'react';
import { ZoomState } from '@/types/editor';

export interface UseZoomReturn {
  zoomState: ZoomState;
  setZoom: (level: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  fitToWindow: (duration: number, containerWidth: number) => void;
}

const DEFAULT_ZOOM_LEVEL = 100;
const DEFAULT_PIXELS_PER_SECOND = 50;
const MIN_ZOOM = 25;
const MAX_ZOOM = 400;

export function useZoom(initialZoom: number = DEFAULT_ZOOM_LEVEL): UseZoomReturn {
  const [zoomState, setZoomState] = useState<ZoomState>({
    level: initialZoom,
    pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND * (initialZoom / 100),
  });

  const setZoom = useCallback((level: number) => {
    const clampedLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level));
    const pixelsPerSecond = DEFAULT_PIXELS_PER_SECOND * (clampedLevel / 100);

    setZoomState({
      level: clampedLevel,
      pixelsPerSecond,
    });
  }, []);

  const zoomIn = useCallback(() => {
    setZoomState(prev => {
      const newLevel = Math.min(MAX_ZOOM, prev.level + 25);
      const pixelsPerSecond = DEFAULT_PIXELS_PER_SECOND * (newLevel / 100);

      return {
        level: newLevel,
        pixelsPerSecond,
      };
    });
  }, []);

  const zoomOut = useCallback(() => {
    setZoomState(prev => {
      const newLevel = Math.max(MIN_ZOOM, prev.level - 25);
      const pixelsPerSecond = DEFAULT_PIXELS_PER_SECOND * (newLevel / 100);

      return {
        level: newLevel,
        pixelsPerSecond,
      };
    });
  }, []);

  const resetZoom = useCallback(() => {
    setZoomState({
      level: DEFAULT_ZOOM_LEVEL,
      pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND,
    });
  }, []);

  const fitToWindow = useCallback((duration: number, containerWidth: number) => {
    // Calculate zoom level that would fit the entire timeline
    if (duration <= 0 || containerWidth <= 0) {
      resetZoom();
      return;
    }

    const requiredPixelsPerSecond = containerWidth / duration;
    const fitLevel = (requiredPixelsPerSecond / DEFAULT_PIXELS_PER_SECOND) * 100;
    const clampedLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitLevel));

    setZoomState({
      level: clampedLevel,
      pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND * (clampedLevel / 100),
    });
  }, []);

  return {
    zoomState,
    setZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    fitToWindow,
  };
}
