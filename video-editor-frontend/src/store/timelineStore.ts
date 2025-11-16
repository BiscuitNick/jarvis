import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { Track, TimelineItem, TimelineState } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface TimelineStore extends TimelineState {
  // Track management
  addTrack: (type: Track['type'], name?: string) => void;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<Track>) => void;
  reorderTracks: (trackIds: string[]) => void;

  // Item management
  addItem: (item: Omit<TimelineItem, 'id'>) => void;
  removeItem: (itemId: string) => void;
  updateItem: (itemId: string, updates: Partial<TimelineItem>) => void;
  moveItem: (itemId: string, trackId: string, startTime: number) => void;
  duplicateItem: (itemId: string) => void;

  // Bulk operations
  removeItems: (itemIds: string[]) => void;
  updateItems: (updates: Array<{ id: string; changes: Partial<TimelineItem> }>) => void;

  // Playhead
  setPlayheadPosition: (position: number) => void;
  movePlayhead: (delta: number) => void;

  // Selection
  selectItem: (itemId: string, addToSelection?: boolean) => void;
  selectItems: (itemIds: string[]) => void;
  clearSelection: () => void;

  // Timeline properties
  setZoom: (zoom: number) => void;
  setDuration: (duration: number) => void;

  // Utilities
  getItemById: (itemId: string) => TimelineItem | undefined;
  getTrackById: (trackId: string) => Track | undefined;
  getItemsOnTrack: (trackId: string) => TimelineItem[];
  getItemsAtTime: (time: number) => TimelineItem[];
  calculateTotalDuration: () => number;

  // State management
  reset: () => void;
  loadState: (state: Partial<TimelineState>) => void;
}

const initialState: TimelineState = {
  tracks: [
    { id: 'track-video-1', name: 'Video 1', type: 'video', order: 0, height: 120 },
    { id: 'track-audio-1', name: 'Audio 1', type: 'audio', order: 1, height: 80 },
  ],
  items: [],
  playheadPosition: 0,
  duration: 60, // 1 minute default
  zoom: 50, // 50 pixels per second
  selectedItemIds: [],
};

export const useTimelineStore = create<TimelineStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        // Track management
        addTrack: (type, name) => {
          const tracks = get().tracks;
          const newTrack: Track = {
            id: uuidv4(),
            name: name || `${type.charAt(0).toUpperCase() + type.slice(1)} ${tracks.length + 1}`,
            type,
            order: tracks.length,
            height: type === 'video' ? 120 : 80,
          };
          set({ tracks: [...tracks, newTrack] });
        },

        removeTrack: (trackId) => {
          set((state) => ({
            tracks: state.tracks.filter((t) => t.id !== trackId),
            items: state.items.filter((i) => i.trackId !== trackId),
          }));
        },

        updateTrack: (trackId, updates) => {
          set((state) => ({
            tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, ...updates } : t)),
          }));
        },

        reorderTracks: (trackIds) => {
          set((state) => {
            const trackMap = new Map(state.tracks.map((t) => [t.id, t]));
            return {
              tracks: trackIds
                .map((id, index) => {
                  const track = trackMap.get(id);
                  return track ? { ...track, order: index } : null;
                })
                .filter((t): t is Track => t !== null),
            };
          });
        },

        // Item management
        addItem: (item) => {
          const newItem: TimelineItem = {
            ...item,
            id: uuidv4(),
          };
          set((state) => ({
            items: [...state.items, newItem],
            duration: Math.max(state.duration, newItem.startTime + newItem.duration),
          }));
        },

        removeItem: (itemId) => {
          set((state) => ({
            items: state.items.filter((i) => i.id !== itemId),
            selectedItemIds: state.selectedItemIds.filter((id) => id !== itemId),
          }));
        },

        updateItem: (itemId, updates) => {
          set((state) => {
            const items = state.items.map((i) => {
              if (i.id !== itemId) return i;
              const updated = { ...i, ...updates };
              return updated;
            });

            // Recalculate duration if item end time changed
            const maxEndTime = Math.max(
              ...items.map((i) => i.startTime + i.duration),
              state.duration
            );

            return {
              items,
              duration: maxEndTime,
            };
          });
        },

        moveItem: (itemId, trackId, startTime) => {
          get().updateItem(itemId, { trackId, startTime });
        },

        duplicateItem: (itemId) => {
          const item = get().getItemById(itemId);
          if (!item) return;

          const { id, ...itemData } = item;
          const newItem: TimelineItem = {
            ...itemData,
            id: uuidv4(),
            name: `${item.name} (copy)`,
            startTime: item.startTime + item.duration, // Place right after original
          };

          set((state) => ({
            items: [...state.items, newItem],
          }));
        },

        // Bulk operations
        removeItems: (itemIds) => {
          set((state) => ({
            items: state.items.filter((i) => !itemIds.includes(i.id)),
            selectedItemIds: state.selectedItemIds.filter((id) => !itemIds.includes(id)),
          }));
        },

        updateItems: (updates) => {
          set((state) => {
            const updateMap = new Map(updates.map((u) => [u.id, u.changes]));
            return {
              items: state.items.map((item) => {
                const changes = updateMap.get(item.id);
                return changes ? { ...item, ...changes } : item;
              }),
            };
          });
        },

        // Playhead
        setPlayheadPosition: (position) => {
          set({ playheadPosition: Math.max(0, position) });
        },

        movePlayhead: (delta) => {
          set((state) => ({
            playheadPosition: Math.max(0, state.playheadPosition + delta),
          }));
        },

        // Selection
        selectItem: (itemId, addToSelection = false) => {
          set((state) => {
            if (addToSelection) {
              return {
                selectedItemIds: state.selectedItemIds.includes(itemId)
                  ? state.selectedItemIds.filter((id) => id !== itemId)
                  : [...state.selectedItemIds, itemId],
              };
            }
            return { selectedItemIds: [itemId] };
          });
        },

        selectItems: (itemIds) => {
          set({ selectedItemIds: itemIds });
        },

        clearSelection: () => {
          set({ selectedItemIds: [] });
        },

        // Timeline properties
        setZoom: (zoom) => {
          set({ zoom: Math.max(10, Math.min(500, zoom)) });
        },

        setDuration: (duration) => {
          set({ duration: Math.max(1, duration) });
        },

        // Utilities
        getItemById: (itemId) => {
          return get().items.find((i) => i.id === itemId);
        },

        getTrackById: (trackId) => {
          return get().tracks.find((t) => t.id === trackId);
        },

        getItemsOnTrack: (trackId) => {
          return get().items.filter((i) => i.trackId === trackId);
        },

        getItemsAtTime: (time) => {
          return get().items.filter((i) => i.startTime <= time && i.startTime + i.duration >= time);
        },

        calculateTotalDuration: () => {
          const items = get().items;
          if (items.length === 0) return 60; // Default 1 minute

          const maxEndTime = Math.max(...items.map((i) => i.startTime + i.duration));
          return Math.max(maxEndTime, 1);
        },

        // State management
        reset: () => {
          set(initialState);
        },

        loadState: (state) => {
          set((current) => ({
            ...current,
            ...state,
          }));
        },
      }),
      {
        name: 'timeline-storage',
        partialize: (state) => ({
          tracks: state.tracks,
          items: state.items,
          duration: state.duration,
          zoom: state.zoom,
        }),
      }
    ),
    { name: 'TimelineStore' }
  )
);
