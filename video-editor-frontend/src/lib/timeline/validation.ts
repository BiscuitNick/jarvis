import type { TimelineItem, Track, TimelineState } from '../../types';
import { doItemsOverlap, getItemEndTime } from './calculations';

/**
 * Validation functions for timeline state
 */

export interface ValidationError {
  type: 'error' | 'warning';
  message: string;
  itemId?: string;
  trackId?: string;
}

// Validate entire timeline state
export function validateTimeline(timeline: TimelineState): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate tracks
  errors.push(...validateTracks(timeline.tracks));

  // Validate items
  errors.push(...validateItems(timeline.items, timeline.tracks));

  // Validate playhead
  if (timeline.playheadPosition < 0) {
    errors.push({
      type: 'error',
      message: 'Playhead position cannot be negative',
    });
  }

  // Validate duration
  if (timeline.duration <= 0) {
    errors.push({
      type: 'error',
      message: 'Timeline duration must be greater than 0',
    });
  }

  // Validate zoom
  if (timeline.zoom <= 0) {
    errors.push({
      type: 'error',
      message: 'Zoom level must be greater than 0',
    });
  }

  return errors;
}

// Validate tracks
export function validateTracks(tracks: Track[]): ValidationError[] {
  const errors: ValidationError[] = [];

  if (tracks.length === 0) {
    errors.push({
      type: 'warning',
      message: 'No tracks in timeline',
    });
  }

  // Check for duplicate IDs
  const trackIds = new Set<string>();
  tracks.forEach((track) => {
    if (trackIds.has(track.id)) {
      errors.push({
        type: 'error',
        message: `Duplicate track ID: ${track.id}`,
        trackId: track.id,
      });
    }
    trackIds.add(track.id);
  });

  // Validate each track
  tracks.forEach((track) => {
    if (!track.id) {
      errors.push({
        type: 'error',
        message: 'Track missing ID',
      });
    }

    if (!track.name) {
      errors.push({
        type: 'warning',
        message: 'Track missing name',
        trackId: track.id,
      });
    }

    if (track.order < 0) {
      errors.push({
        type: 'error',
        message: 'Track order cannot be negative',
        trackId: track.id,
      });
    }

    if (track.height && track.height <= 0) {
      errors.push({
        type: 'error',
        message: 'Track height must be greater than 0',
        trackId: track.id,
      });
    }
  });

  return errors;
}

// Validate items
export function validateItems(items: TimelineItem[], tracks: Track[]): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check for duplicate IDs
  const itemIds = new Set<string>();
  items.forEach((item) => {
    if (itemIds.has(item.id)) {
      errors.push({
        type: 'error',
        message: `Duplicate item ID: ${item.id}`,
        itemId: item.id,
      });
    }
    itemIds.add(item.id);
  });

  // Validate each item
  items.forEach((item) => {
    errors.push(...validateItem(item, tracks));
  });

  // Check for overlaps on same track
  errors.push(...checkOverlaps(items));

  return errors;
}

// Validate single item
export function validateItem(item: TimelineItem, tracks: Track[]): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required fields
  if (!item.id) {
    errors.push({
      type: 'error',
      message: 'Item missing ID',
    });
  }

  if (!item.trackId) {
    errors.push({
      type: 'error',
      message: 'Item missing track ID',
      itemId: item.id,
    });
  } else {
    // Check if track exists
    const trackExists = tracks.some((t) => t.id === item.trackId);
    if (!trackExists) {
      errors.push({
        type: 'error',
        message: `Item references non-existent track: ${item.trackId}`,
        itemId: item.id,
        trackId: item.trackId,
      });
    }
  }

  if (!item.name) {
    errors.push({
      type: 'warning',
      message: 'Item missing name',
      itemId: item.id,
    });
  }

  // Time validation
  if (item.startTime < 0) {
    errors.push({
      type: 'error',
      message: 'Item start time cannot be negative',
      itemId: item.id,
    });
  }

  if (item.duration <= 0) {
    errors.push({
      type: 'error',
      message: 'Item duration must be greater than 0',
      itemId: item.id,
    });
  }

  // Type-specific validation
  if (item.type === 'video' || item.type === 'image') {
    if (!item.mediaUrl) {
      errors.push({
        type: 'error',
        message: 'Media item missing URL',
        itemId: item.id,
      });
    }
  }

  if (item.type === 'text') {
    if (!item.text) {
      errors.push({
        type: 'warning',
        message: 'Text item has no content',
        itemId: item.id,
      });
    }
  }

  // Volume validation
  if (item.volume !== undefined && (item.volume < 0 || item.volume > 100)) {
    errors.push({
      type: 'error',
      message: 'Volume must be between 0 and 100',
      itemId: item.id,
    });
  }

  // Opacity validation
  if (item.opacity !== undefined && (item.opacity < 0 || item.opacity > 100)) {
    errors.push({
      type: 'error',
      message: 'Opacity must be between 0 and 100',
      itemId: item.id,
    });
  }

  // Trim validation
  if (item.trimStart !== undefined && item.trimStart < 0) {
    errors.push({
      type: 'error',
      message: 'Trim start cannot be negative',
      itemId: item.id,
    });
  }

  if (item.trimEnd !== undefined && item.trimEnd < 0) {
    errors.push({
      type: 'error',
      message: 'Trim end cannot be negative',
      itemId: item.id,
    });
  }

  if (
    item.trimStart !== undefined &&
    item.trimEnd !== undefined &&
    item.trimEnd <= item.trimStart
  ) {
    errors.push({
      type: 'error',
      message: 'Trim end must be greater than trim start',
      itemId: item.id,
    });
  }

  return errors;
}

// Check for overlapping items on same track
export function checkOverlaps(items: TimelineItem[]): ValidationError[] {
  const errors: ValidationError[] = [];

  // Group items by track
  const itemsByTrack = new Map<string, TimelineItem[]>();
  items.forEach((item) => {
    const trackItems = itemsByTrack.get(item.trackId) || [];
    trackItems.push(item);
    itemsByTrack.set(item.trackId, trackItems);
  });

  // Check overlaps within each track
  itemsByTrack.forEach((trackItems, trackId) => {
    for (let i = 0; i < trackItems.length; i++) {
      for (let j = i + 1; j < trackItems.length; j++) {
        if (doItemsOverlap(trackItems[i], trackItems[j])) {
          errors.push({
            type: 'warning',
            message: `Items overlap on track ${trackId}`,
            itemId: trackItems[i].id,
            trackId,
          });
        }
      }
    }
  });

  return errors;
}

// Check if item can be placed at position
export function canPlaceItem(
  item: TimelineItem,
  startTime: number,
  trackId: string,
  existingItems: TimelineItem[],
  allowOverlap: boolean = false
): { valid: boolean; reason?: string } {
  // Check if track exists is handled by validateItem

  // Check time constraints
  if (startTime < 0) {
    return { valid: false, reason: 'Cannot place item at negative time' };
  }

  if (!allowOverlap) {
    // Check for overlaps with existing items on same track
    const trackItems = existingItems.filter(
      (i) => i.trackId === trackId && i.id !== item.id
    );

    const proposedItem = { ...item, startTime, trackId };

    for (const existingItem of trackItems) {
      if (doItemsOverlap(proposedItem, existingItem)) {
        return {
          valid: false,
          reason: `Would overlap with item: ${existingItem.name}`,
        };
      }
    }
  }

  return { valid: true };
}

// Check if items can be moved
export function canMoveItems(
  items: TimelineItem[],
  deltaTime: number,
  deltaTrack: number,
  tracks: Track[],
  allItems: TimelineItem[],
  allowOverlap: boolean = false
): { valid: boolean; reason?: string } {
  for (const item of items) {
    const newStartTime = item.startTime + deltaTime;

    // Find new track
    const currentTrack = tracks.find((t) => t.id === item.trackId);
    if (!currentTrack) continue;

    const newTrackIndex = currentTrack.order + deltaTrack;
    const newTrack = tracks.find((t) => t.order === newTrackIndex);

    if (!newTrack) {
      return { valid: false, reason: 'Target track does not exist' };
    }

    const result = canPlaceItem(
      item,
      newStartTime,
      newTrack.id,
      allItems,
      allowOverlap
    );

    if (!result.valid) {
      return result;
    }
  }

  return { valid: true };
}

// Sanitize timeline state
export function sanitizeTimeline(timeline: TimelineState): TimelineState {
  return {
    ...timeline,
    playheadPosition: Math.max(0, timeline.playheadPosition),
    duration: Math.max(1, timeline.duration),
    zoom: Math.max(10, Math.min(500, timeline.zoom)),
    tracks: timeline.tracks.map((track, index) => ({
      ...track,
      order: index, // Ensure sequential ordering
      height: Math.max(40, track.height || 120),
    })),
    items: timeline.items.map((item) => ({
      ...item,
      startTime: Math.max(0, item.startTime),
      duration: Math.max(0.1, item.duration),
      volume: item.volume !== undefined ? Math.max(0, Math.min(100, item.volume)) : undefined,
      opacity: item.opacity !== undefined ? Math.max(0, Math.min(100, item.opacity)) : undefined,
    })),
  };
}
