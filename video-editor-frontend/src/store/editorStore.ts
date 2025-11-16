import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { EditorState } from '../types';

interface EditorStore extends EditorState {
  // Selection
  setSelectedItemIds: (ids: string[]) => void;
  setSelectedTrackId: (id: string | null) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  clearSelection: () => void;

  // Zoom and view
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  setViewport: (width: number, height: number) => void;

  // Snap settings
  toggleSnap: () => void;
  setSnapEnabled: (enabled: boolean) => void;
  setSnapInterval: (interval: number) => void;

  // Playback
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => void;
  setLoop: (loop: boolean) => void;
  toggleLoop: () => void;

  // View settings
  toggleGrid: () => void;
  toggleRuler: () => void;
  setGridVisible: (visible: boolean) => void;
  setRulerVisible: (visible: boolean) => void;

  // Utilities
  reset: () => void;
}

const initialState: EditorState = {
  selectedItemIds: [],
  selectedTrackId: null,
  zoom: 50, // pixels per second
  snapEnabled: true,
  snapInterval: 0.1, // 100ms
  playing: false,
  loop: false,
  viewportWidth: 1920,
  viewportHeight: 1080,
  gridVisible: true,
  rulerVisible: true,
};

export const useEditorStore = create<EditorStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Selection
      setSelectedItemIds: (ids) => {
        set({ selectedItemIds: ids });
      },

      setSelectedTrackId: (id) => {
        set({ selectedTrackId: id });
      },

      addToSelection: (id) => {
        set((state) => ({
          selectedItemIds: state.selectedItemIds.includes(id)
            ? state.selectedItemIds
            : [...state.selectedItemIds, id],
        }));
      },

      removeFromSelection: (id) => {
        set((state) => ({
          selectedItemIds: state.selectedItemIds.filter((itemId) => itemId !== id),
        }));
      },

      clearSelection: () => {
        set({ selectedItemIds: [], selectedTrackId: null });
      },

      // Zoom and view
      setZoom: (zoom) => {
        // Clamp zoom between 10 and 500 pixels per second
        const clampedZoom = Math.max(10, Math.min(500, zoom));
        set({ zoom: clampedZoom });
      },

      zoomIn: () => {
        const currentZoom = get().zoom;
        const newZoom = currentZoom * 1.2;
        get().setZoom(newZoom);
      },

      zoomOut: () => {
        const currentZoom = get().zoom;
        const newZoom = currentZoom / 1.2;
        get().setZoom(newZoom);
      },

      zoomToFit: () => {
        // This would need timeline duration and viewport width
        // Set a reasonable default zoom
        set({ zoom: 50 });
      },

      setViewport: (width, height) => {
        set({ viewportWidth: width, viewportHeight: height });
      },

      // Snap settings
      toggleSnap: () => {
        set((state) => ({ snapEnabled: !state.snapEnabled }));
      },

      setSnapEnabled: (enabled) => {
        set({ snapEnabled: enabled });
      },

      setSnapInterval: (interval) => {
        // Clamp interval between 0.01s (10ms) and 1s
        const clampedInterval = Math.max(0.01, Math.min(1, interval));
        set({ snapInterval: clampedInterval });
      },

      // Playback
      setPlaying: (playing) => {
        set({ playing });
      },

      togglePlaying: () => {
        set((state) => ({ playing: !state.playing }));
      },

      setLoop: (loop) => {
        set({ loop });
      },

      toggleLoop: () => {
        set((state) => ({ loop: !state.loop }));
      },

      // View settings
      toggleGrid: () => {
        set((state) => ({ gridVisible: !state.gridVisible }));
      },

      toggleRuler: () => {
        set((state) => ({ rulerVisible: !state.rulerVisible }));
      },

      setGridVisible: (visible) => {
        set({ gridVisible: visible });
      },

      setRulerVisible: (visible) => {
        set({ rulerVisible: visible });
      },

      // Utilities
      reset: () => {
        set(initialState);
      },
    }),
    { name: 'EditorStore' }
  )
);
