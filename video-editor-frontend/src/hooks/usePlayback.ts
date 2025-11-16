import { useState, useCallback, useRef, useEffect } from 'react';
import { PlaybackState } from '@/types/editor';

export interface UsePlaybackReturn {
  playbackState: PlaybackState;
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleLoop: () => void;
  reset: () => void;
}

export function usePlayback(duration: number): UsePlaybackReturn {
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    currentTime: 0,
    duration,
    loop: false,
    volume: 1,
  });

  const animationFrameRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);

  // Update duration when it changes
  useEffect(() => {
    setPlaybackState(prev => ({ ...prev, duration }));
  }, [duration]);

  // Playback loop
  useEffect(() => {
    if (!playbackState.isPlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    const animate = (timestamp: number) => {
      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp;
      }

      const deltaTime = (timestamp - lastTimeRef.current) / 1000; // Convert to seconds
      lastTimeRef.current = timestamp;

      setPlaybackState(prev => {
        let newTime = prev.currentTime + deltaTime;

        // Handle end of timeline
        if (newTime >= prev.duration) {
          if (prev.loop) {
            newTime = 0;
          } else {
            newTime = prev.duration;
            return { ...prev, currentTime: newTime, isPlaying: false };
          }
        }

        return { ...prev, currentTime: newTime };
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      lastTimeRef.current = 0;
    };
  }, [playbackState.isPlaying, playbackState.loop, playbackState.duration]);

  const play = useCallback(() => {
    setPlaybackState(prev => {
      // If at end, reset to beginning
      if (prev.currentTime >= prev.duration) {
        return { ...prev, isPlaying: true, currentTime: 0 };
      }
      return { ...prev, isPlaying: true };
    });
  }, []);

  const pause = useCallback(() => {
    setPlaybackState(prev => ({ ...prev, isPlaying: false }));
  }, []);

  const togglePlayPause = useCallback(() => {
    setPlaybackState(prev => {
      // If at end, reset to beginning when playing
      if (!prev.isPlaying && prev.currentTime >= prev.duration) {
        return { ...prev, isPlaying: true, currentTime: 0 };
      }
      return { ...prev, isPlaying: !prev.isPlaying };
    });
  }, []);

  const seek = useCallback((time: number) => {
    const clampedTime = Math.max(0, Math.min(time, playbackState.duration));
    setPlaybackState(prev => ({ ...prev, currentTime: clampedTime }));
  }, [playbackState.duration]);

  const setVolume = useCallback((volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    setPlaybackState(prev => ({ ...prev, volume: clampedVolume }));
  }, []);

  const toggleLoop = useCallback(() => {
    setPlaybackState(prev => ({ ...prev, loop: !prev.loop }));
  }, []);

  const reset = useCallback(() => {
    setPlaybackState(prev => ({
      ...prev,
      isPlaying: false,
      currentTime: 0,
    }));
  }, []);

  return {
    playbackState,
    play,
    pause,
    togglePlayPause,
    seek,
    setVolume,
    toggleLoop,
    reset,
  };
}
