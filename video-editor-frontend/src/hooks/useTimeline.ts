import { useState, useCallback, useMemo } from 'react';
import { TimelineState, Track, TimelineItem } from '../types/timeline';

const INITIAL_ZOOM = 100; // 100 pixels per second
const MIN_ZOOM = 20;
const MAX_ZOOM = 500;
const SNAP_INTERVAL = 0.5; // 500ms

export function useTimeline() {
  const [state, setState] = useState<TimelineState>({
    tracks: [
      {
        id: 'track-1',
        name: 'Track 1',
        items: [],
        height: 80,
      },
    ],
    zoom: INITIAL_ZOOM,
    playheadPosition: 0,
    selectedItemId: null,
    snapToGrid: true,
    snapInterval: SNAP_INTERVAL,
    totalDuration: 30,
  });

  const addTrack = useCallback(() => {
    setState(prev => {
      const newTrack: Track = {
        id: 'track-' + Date.now(),
        name: 'Track ' + (prev.tracks.length + 1),
        items: [],
        height: 80,
      };
      return {
        ...prev,
        tracks: [...prev.tracks, newTrack],
      };
    });
  }, []);

  const removeTrack = useCallback((trackId: string) => {
    setState(prev => {
      if (prev.tracks.length <= 1) {
        return prev;
      }
      return {
        ...prev,
        tracks: prev.tracks.filter(t => t.id !== trackId),
      };
    });
  }, []);

  const updateTrack = useCallback((trackId: string, updates: Partial<Track>) => {
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(track =>
        track.id === trackId ? { ...track, ...updates } : track
      ),
    }));
  }, []);

  const addItem = useCallback((trackId: string, item: TimelineItem) => {
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(track =>
        track.id === trackId
          ? { ...track, items: [...track.items, item] }
          : track
      ),
    }));
  }, []);

  const updateItem = useCallback((itemId: string, updates: Partial<TimelineItem>) => {
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(track => ({
        ...track,
        items: track.items.map(item =>
          item.id === itemId ? { ...item, ...updates } : item
        ),
      })),
    }));
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(track => ({
        ...track,
        items: track.items.filter(item => item.id !== itemId),
      })),
      selectedItemId: prev.selectedItemId === itemId ? null : prev.selectedItemId,
    }));
  }, []);

  const moveItem = useCallback((itemId: string, targetTrackId: string, newStartTime: number) => {
    setState(prev => {
      let itemToMove: TimelineItem | null = null;
      
      const tracksWithoutItem = prev.tracks.map(track => ({
        ...track,
        items: track.items.filter(item => {
          if (item.id === itemId) {
            itemToMove = item;
            return false;
          }
          return true;
        }),
      }));
      
      if (!itemToMove) return prev;
      
      const updatedItem = { ...itemToMove, trackId: targetTrackId, startTime: newStartTime };
      const finalTracks = tracksWithoutItem.map(track =>
        track.id === targetTrackId
          ? { ...track, items: [...track.items, updatedItem] }
          : track
      );
      
      return {
        ...prev,
        tracks: finalTracks,
      };
    });
  }, []);

  const setPlayheadPosition = useCallback((position: number) => {
    setState(prev => ({
      ...prev,
      playheadPosition: Math.max(0, position),
    }));
  }, []);

  const setZoom = useCallback((zoom: number) => {
    setState(prev => ({
      ...prev,
      zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)),
    }));
  }, []);

  const zoomIn = useCallback(() => {
    setState(prev => ({
      ...prev,
      zoom: Math.min(MAX_ZOOM, prev.zoom * 1.2),
    }));
  }, []);

  const zoomOut = useCallback(() => {
    setState(prev => ({
      ...prev,
      zoom: Math.max(MIN_ZOOM, prev.zoom / 1.2),
    }));
  }, []);

  const selectItem = useCallback((itemId: string | null) => {
    setState(prev => ({
      ...prev,
      selectedItemId: itemId,
    }));
  }, []);

  const toggleSnapToGrid = useCallback(() => {
    setState(prev => ({
      ...prev,
      snapToGrid: !prev.snapToGrid,
    }));
  }, []);

  const setSnapInterval = useCallback((interval: number) => {
    setState(prev => ({
      ...prev,
      snapInterval: interval,
    }));
  }, []);

  const totalDuration = useMemo(() => {
    const maxTime = state.tracks.reduce((max, track) => {
      const trackMax = track.items.reduce((tMax, item) => {
        return Math.max(tMax, item.startTime + item.duration);
      }, 0);
      return Math.max(max, trackMax);
    }, 30);
    
    return Math.max(maxTime, state.totalDuration);
  }, [state.tracks, state.totalDuration]);

  return {
    state: { ...state, totalDuration },
    addTrack,
    removeTrack,
    updateTrack,
    addItem,
    updateItem,
    removeItem,
    moveItem,
    setPlayheadPosition,
    setZoom,
    zoomIn,
    zoomOut,
    selectItem,
    toggleSnapToGrid,
    setSnapInterval,
  };
}
