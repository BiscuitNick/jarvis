import { useState, useCallback } from 'react';
import type { DragInfo, ResizeInfo } from '../types/timeline';

export function useDragAndDrop() {
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);
  const [resizeInfo, setResizeInfo] = useState<ResizeInfo | null>(null);

  const startDrag = useCallback((
    itemId: string,
    trackId: string,
    startTime: number
  ) => {
    setDragInfo({
      itemId,
      originalTrackId: trackId,
      originalStartTime: startTime,
      isDragging: true,
    });
  }, []);

  const endDrag = useCallback(() => {
    setDragInfo(null);
  }, []);

  const startResize = useCallback((
    itemId: string,
    handle: 'start' | 'end',
    startTime: number,
    duration: number
  ) => {
    setResizeInfo({
      itemId,
      handle,
      originalStartTime: startTime,
      originalDuration: duration,
      isResizing: true,
    });
  }, []);

  const endResize = useCallback(() => {
    setResizeInfo(null);
  }, []);

  return {
    dragInfo,
    resizeInfo,
    startDrag,
    endDrag,
    startResize,
    endResize,
  };
}
