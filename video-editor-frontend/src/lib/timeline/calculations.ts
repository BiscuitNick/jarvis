import type { TimelineItem, Track } from '../../types';

/**
 * Time calculations for timeline operations
 */

// Convert pixels to seconds based on zoom level
export function pixelsToSeconds(pixels: number, zoom: number): number {
  return pixels / zoom;
}

// Convert seconds to pixels based on zoom level
export function secondsToPixels(seconds: number, zoom: number): number {
  return seconds * zoom;
}

// Snap time to grid
export function snapToGrid(time: number, snapInterval: number, snapEnabled: boolean): number {
  if (!snapEnabled || snapInterval <= 0) {
    return time;
  }

  return Math.round(time / snapInterval) * snapInterval;
}

// Find nearest snap point
export function findNearestSnapPoint(
  time: number,
  snapInterval: number,
  threshold: number = 0.1
): number | null {
  const snappedTime = Math.round(time / snapInterval) * snapInterval;
  const distance = Math.abs(time - snappedTime);

  if (distance <= threshold) {
    return snappedTime;
  }

  return null;
}

// Calculate item end time
export function getItemEndTime(item: TimelineItem): number {
  return item.startTime + item.duration;
}

// Check if items overlap
export function doItemsOverlap(item1: TimelineItem, item2: TimelineItem): boolean {
  const item1End = getItemEndTime(item1);
  const item2End = getItemEndTime(item2);

  return item1.startTime < item2End && item2.startTime < item1End;
}

// Get overlap duration between two items
export function getOverlapDuration(item1: TimelineItem, item2: TimelineItem): number {
  if (!doItemsOverlap(item1, item2)) {
    return 0;
  }

  const overlapStart = Math.max(item1.startTime, item2.startTime);
  const overlapEnd = Math.min(getItemEndTime(item1), getItemEndTime(item2));

  return overlapEnd - overlapStart;
}

// Check if item is at time position
export function isItemAtTime(item: TimelineItem, time: number): boolean {
  return item.startTime <= time && getItemEndTime(item) >= time;
}

// Find items at specific time
export function findItemsAtTime(items: TimelineItem[], time: number): TimelineItem[] {
  return items.filter((item) => isItemAtTime(item, time));
}

// Find items in time range
export function findItemsInRange(
  items: TimelineItem[],
  startTime: number,
  endTime: number
): TimelineItem[] {
  return items.filter((item) => {
    const itemEnd = getItemEndTime(item);
    return item.startTime < endTime && itemEnd > startTime;
  });
}

// Calculate total timeline duration
export function calculateTimelineDuration(items: TimelineItem[]): number {
  if (items.length === 0) return 0;

  return Math.max(...items.map(getItemEndTime));
}

// Calculate visible time range based on viewport
export function calculateVisibleTimeRange(
  scrollLeft: number,
  viewportWidth: number,
  zoom: number
): { start: number; end: number } {
  const start = pixelsToSeconds(scrollLeft, zoom);
  const end = pixelsToSeconds(scrollLeft + viewportWidth, zoom);

  return { start, end };
}

// Find gaps in timeline
export function findGaps(
  items: TimelineItem[],
  trackId?: string
): Array<{ start: number; end: number; duration: number }> {
  let filteredItems = [...items];

  if (trackId) {
    filteredItems = filteredItems.filter((item) => item.trackId === trackId);
  }

  if (filteredItems.length === 0) return [];

  // Sort by start time
  filteredItems.sort((a, b) => a.startTime - b.startTime);

  const gaps: Array<{ start: number; end: number; duration: number }> = [];

  for (let i = 0; i < filteredItems.length - 1; i++) {
    const currentEnd = getItemEndTime(filteredItems[i]);
    const nextStart = filteredItems[i + 1].startTime;

    if (nextStart > currentEnd) {
      gaps.push({
        start: currentEnd,
        end: nextStart,
        duration: nextStart - currentEnd,
      });
    }
  }

  return gaps;
}

// Calculate item position in pixels
export function calculateItemPosition(
  item: TimelineItem,
  zoom: number,
  trackHeight: number,
  tracks: Track[]
): { x: number; y: number; width: number; height: number } {
  const x = secondsToPixels(item.startTime, zoom);
  const width = secondsToPixels(item.duration, zoom);

  // Find track index
  const track = tracks.find((t) => t.id === item.trackId);
  const trackIndex = track ? track.order : 0;
  const y = trackIndex * trackHeight;
  const height = track?.height || trackHeight;

  return { x, y, width, height };
}

// Calculate playhead position in pixels
export function calculatePlayheadPosition(time: number, zoom: number): number {
  return secondsToPixels(time, zoom);
}

// Calculate time from mouse position
export function calculateTimeFromMousePosition(
  mouseX: number,
  scrollLeft: number,
  zoom: number,
  snapEnabled: boolean,
  snapInterval: number
): number {
  const pixelPosition = mouseX + scrollLeft;
  const time = pixelsToSeconds(pixelPosition, zoom);

  return snapToGrid(time, snapInterval, snapEnabled);
}

// Calculate track from mouse position
export function calculateTrackFromMousePosition(
  mouseY: number,
  scrollTop: number,
  tracks: Track[],
  defaultTrackHeight: number
): Track | null {
  const pixelPosition = mouseY + scrollTop;

  let currentY = 0;
  for (const track of tracks) {
    const trackHeight = track.height || defaultTrackHeight;
    if (pixelPosition >= currentY && pixelPosition < currentY + trackHeight) {
      return track;
    }
    currentY += trackHeight;
  }

  return null;
}

// Calculate frame number from time
export function timeToFrame(time: number, framerate: number): number {
  return Math.floor(time * framerate);
}

// Calculate time from frame number
export function frameToTime(frame: number, framerate: number): number {
  return frame / framerate;
}

// Round time to nearest frame
export function roundToFrame(time: number, framerate: number): number {
  const frame = Math.round(time * framerate);
  return frame / framerate;
}

// Get snap points for item (start/end of other items)
export function getSnapPoints(
  items: TimelineItem[],
  excludeItemId?: string,
  includeZero: boolean = true
): number[] {
  const points: number[] = [];

  if (includeZero) {
    points.push(0);
  }

  items.forEach((item) => {
    if (item.id !== excludeItemId) {
      points.push(item.startTime);
      points.push(getItemEndTime(item));
    }
  });

  // Remove duplicates and sort
  return Array.from(new Set(points)).sort((a, b) => a - b);
}

// Find closest snap point
export function findClosestSnapPoint(
  time: number,
  snapPoints: number[],
  threshold: number
): number | null {
  let closestPoint: number | null = null;
  let minDistance = threshold;

  snapPoints.forEach((point) => {
    const distance = Math.abs(time - point);
    if (distance < minDistance) {
      minDistance = distance;
      closestPoint = point;
    }
  });

  return closestPoint;
}
