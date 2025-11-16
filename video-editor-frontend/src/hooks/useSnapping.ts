import { useMemo } from 'react';
import type { Track, SnapPoint } from '../types/timeline';

interface UseSnappingProps {
  tracks: Track[];
  snapToGrid: boolean;
  snapInterval: number;
  snapThreshold?: number; // in seconds, how close to snap
}

interface SnapResult {
  snappedTime: number;
  snapPoints: SnapPoint[];
  nearestSnapPoint: SnapPoint | null;
}

/**
 * Hook for calculating snap points and snapping logic
 * 
 * Algorithm:
 * 1. Generate grid snap points based on snapInterval
 * 2. Generate item snap points from all timeline items (start and end)
 * 3. When dragging/resizing, find nearest snap point within threshold
 * 4. Apply snap if within threshold distance
 */
export function useSnapping({
  tracks,
  snapToGrid,
  snapInterval,
  snapThreshold = 0.1, // 100ms default
}: UseSnappingProps) {
  
  // Generate all snap points from timeline items
  const itemSnapPoints = useMemo<SnapPoint[]>(() => {
    const points: SnapPoint[] = [];
    
    tracks.forEach(track => {
      track.items.forEach(item => {
        // Add snap point at item start
        points.push({
          time: item.startTime,
          type: 'item-start',
          itemId: item.id,
        });
        
        // Add snap point at item end
        points.push({
          time: item.startTime + item.duration,
          type: 'item-end',
          itemId: item.id,
        });
      });
    });
    
    return points;
  }, [tracks]);

  // Calculate snap for a given time
  const calculateSnap = (time: number, excludeItemId?: string): SnapResult => {
    const snapPoints: SnapPoint[] = [];
    
    // Add grid snap points if enabled
    if (snapToGrid && snapInterval > 0) {
      const gridPoint = Math.round(time / snapInterval) * snapInterval;
      snapPoints.push({
        time: gridPoint,
        type: 'grid',
      });
    }
    
    // Add item snap points (excluding the item being dragged)
    const relevantItemPoints = itemSnapPoints.filter(
      point => point.itemId !== excludeItemId
    );
    snapPoints.push(...relevantItemPoints);
    
    // Find nearest snap point
    let nearestSnapPoint: SnapPoint | null = null;
    let minDistance = snapThreshold;
    
    for (const point of snapPoints) {
      const distance = Math.abs(point.time - time);
      if (distance < minDistance) {
        minDistance = distance;
        nearestSnapPoint = point;
      }
    }
    
    const snappedTime = nearestSnapPoint ? nearestSnapPoint.time : time;
    
    return {
      snappedTime,
      snapPoints,
      nearestSnapPoint,
    };
  };
  
  // Snap a time value to nearest snap point
  const snapTime = (time: number, excludeItemId?: string): number => {
    const result = calculateSnap(time, excludeItemId);
    return result.snappedTime;
  };
  
  // Get all snap points for visualization
  const getAllSnapPoints = (): SnapPoint[] => {
    const points: SnapPoint[] = [...itemSnapPoints];
    
    if (snapToGrid && snapInterval > 0) {
      // Generate grid points for visible timeline
      // This would typically be limited to visible range
      const maxTime = Math.max(
        ...tracks.flatMap(t => 
          t.items.map(i => i.startTime + i.duration)
        ),
        10 // minimum timeline duration
      );
      
      for (let t = 0; t <= maxTime; t += snapInterval) {
        points.push({
          time: t,
          type: 'grid',
        });
      }
    }
    
    return points;
  };

  return {
    snapTime,
    calculateSnap,
    getAllSnapPoints,
    itemSnapPoints,
  };
}
