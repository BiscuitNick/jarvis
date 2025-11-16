import React from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { UsePlaybackReturn } from '@/hooks/usePlayback';

interface PlaybackControlsProps {
  playback: UsePlaybackReturn;
}

export function PlaybackControls({ playback }: PlaybackControlsProps) {
  const { playbackState, togglePlayPause, seek, setVolume, toggleLoop } = playback;

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (value: number[]) => {
    seek(value[0]);
  };

  const handleVolumeChange = (value: number[]) => {
    setVolume(value[0] / 100);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlayPause();
    }
  };

  return (
    <div
      className="flex flex-col gap-4 p-4 bg-card border-t border-border"
      onKeyDown={handleKeyPress}
      tabIndex={0}
    >
      {/* Timeline Scrubber */}
      <div className="space-y-2">
        <Slider
          value={[playbackState.currentTime]}
          min={0}
          max={playbackState.duration}
          step={0.01}
          onValueChange={handleSeek}
          className="w-full cursor-pointer"
        />

        {/* Time Display */}
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{formatTime(playbackState.currentTime)}</span>
          <span>{formatTime(playbackState.duration)}</span>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex items-center gap-4">
        {/* Play/Pause Button */}
        <Button
          variant="default"
          size="icon"
          onClick={togglePlayPause}
          className="h-12 w-12"
        >
          {playbackState.isPlaying ? (
            <PauseIcon className="h-6 w-6" />
          ) : (
            <PlayIcon className="h-6 w-6" />
          )}
        </Button>

        {/* Loop Button */}
        <Button
          variant={playbackState.loop ? "default" : "outline"}
          size="icon"
          onClick={toggleLoop}
          title="Toggle Loop"
        >
          <LoopIcon className="h-5 w-5" />
        </Button>

        {/* Volume Control */}
        <div className="flex items-center gap-2 flex-1 max-w-xs">
          <VolumeIcon className="h-5 w-5 text-muted-foreground" />
          <Slider
            value={[playbackState.volume * 100]}
            min={0}
            max={100}
            step={1}
            onValueChange={handleVolumeChange}
            className="w-full"
          />
          <span className="text-sm text-muted-foreground w-12 text-right">
            {Math.round(playbackState.volume * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}

// Simple SVG Icons
function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
    </svg>
  );
}

function LoopIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  );
}

function VolumeIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}
