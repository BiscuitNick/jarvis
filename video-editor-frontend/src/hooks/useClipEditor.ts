import { useState, useCallback } from 'react';
import { Clip, VideoClip, AudioClip, TimeRange } from '@/types/editor';

export interface UseClipEditorReturn {
  selectedClip: Clip | null;
  selectClip: (clipId: string | null) => void;
  updateClipTrim: (clipId: string, trim: TimeRange) => void;
  updateClipSpeed: (clipId: string, speed: number) => void;
  updateClipDuration: (clipId: string, duration: number) => void;
  updateClipVolume: (clipId: string, volume: number) => void;
  deleteClip: (clipId: string) => void;
}

export function useClipEditor(
  clips: Clip[],
  onClipsChange: (clips: Clip[]) => void
): UseClipEditorReturn {
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  const selectedClip = clips.find(clip => clip.id === selectedClipId) || null;

  const selectClip = useCallback((clipId: string | null) => {
    setSelectedClipId(clipId);
  }, []);

  const updateClipTrim = useCallback((clipId: string, trim: TimeRange) => {
    const updatedClips = clips.map(clip => {
      if (clip.id !== clipId) return clip;
      if (clip.type !== 'video' && clip.type !== 'audio') return clip;

      const typedClip = clip as VideoClip | AudioClip;
      const trimDuration = trim.end - trim.start;
      
      // Update duration based on new trim and current speed
      const newDuration = trimDuration / typedClip.speed;

      return {
        ...clip,
        trim,
        duration: newDuration,
      } as Clip;
    });

    onClipsChange(updatedClips);
  }, [clips, onClipsChange]);

  const updateClipSpeed = useCallback((clipId: string, speed: number) => {
    const clampedSpeed = Math.max(0.25, Math.min(4, speed));
    
    const updatedClips = clips.map(clip => {
      if (clip.id !== clipId) return clip;
      if (clip.type !== 'video' && clip.type !== 'audio') return clip;

      const typedClip = clip as VideoClip | AudioClip;
      const trimDuration = typedClip.trim.end - typedClip.trim.start;
      
      // Recalculate duration based on new speed
      const newDuration = trimDuration / clampedSpeed;

      return {
        ...clip,
        speed: clampedSpeed,
        duration: newDuration,
      } as Clip;
    });

    onClipsChange(updatedClips);
  }, [clips, onClipsChange]);

  const updateClipDuration = useCallback((clipId: string, duration: number) => {
    const clampedDuration = Math.max(0.1, duration);
    
    const updatedClips = clips.map(clip => {
      if (clip.id !== clipId) return clip;
      
      // Duration is primarily for image clips, but can be used for others
      return {
        ...clip,
        duration: clampedDuration,
      } as Clip;
    });

    onClipsChange(updatedClips);
  }, [clips, onClipsChange]);

  const updateClipVolume = useCallback((clipId: string, volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    
    const updatedClips = clips.map(clip => {
      if (clip.id !== clipId) return clip;
      if (clip.type !== 'video' && clip.type !== 'audio') return clip;

      return {
        ...clip,
        volume: clampedVolume,
      } as Clip;
    });

    onClipsChange(updatedClips);
  }, [clips, onClipsChange]);

  const deleteClip = useCallback((clipId: string) => {
    const updatedClips = clips.filter(clip => clip.id !== clipId);
    onClipsChange(updatedClips);
    
    // Clear selection if deleted clip was selected
    if (selectedClipId === clipId) {
      setSelectedClipId(null);
    }
  }, [clips, onClipsChange, selectedClipId]);

  return {
    selectedClip,
    selectClip,
    updateClipTrim,
    updateClipSpeed,
    updateClipDuration,
    updateClipVolume,
    deleteClip,
  };
}
