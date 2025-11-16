export type ItemType = 'video' | 'image' | 'text' | 'audio';

export interface TimelineItem {
  id: string;
  type: ItemType;
  trackId: string;
  startTime: number; // in seconds
  duration: number; // in seconds
  thumbnail?: string;
  name: string;
  data?: any; // additional data specific to item type
}

export interface Track {
  id: string;
  name: string;
  items: TimelineItem[];
  height: number; // in pixels
  locked?: boolean;
  visible?: boolean;
}

export interface TimelineState {
  tracks: Track[];
  zoom: number; // pixels per second
  playheadPosition: number; // in seconds
  selectedItemId: string | null;
  snapToGrid: boolean;
  snapInterval: number; // in seconds
  totalDuration: number; // in seconds
}

export interface DragInfo {
  itemId: string;
  originalTrackId: string;
  originalStartTime: number;
  isDragging: boolean;
}

export interface ResizeInfo {
  itemId: string;
  handle: 'start' | 'end';
  originalStartTime: number;
  originalDuration: number;
  isResizing: boolean;
}

export interface SnapPoint {
  time: number;
  type: 'grid' | 'item-start' | 'item-end';
  itemId?: string;
}
