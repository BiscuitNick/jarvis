import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { UseClipEditorReturn } from '@/hooks/useClipEditor';
import { VideoClip, AudioClip } from '@/types/editor';

interface ClipControlsProps {
  clipEditor: UseClipEditorReturn;
}

export function ClipControls({ clipEditor }: ClipControlsProps) {
  const { selectedClip, updateClipTrim, updateClipSpeed, updateClipDuration, updateClipVolume, deleteClip } = clipEditor;

  if (!selectedClip) {
    return (
      <div className="p-4 bg-card border rounded-lg">
        <p className="text-sm text-muted-foreground text-center">
          Select a clip to edit
        </p>
      </div>
    );
  }

  const isVideoOrAudio = selectedClip.type === 'video' || selectedClip.type === 'audio';
  const isImage = selectedClip.type === 'image';
  const hasVolume = selectedClip.type === 'video' || selectedClip.type === 'audio';

  return (
    <div className="p-4 bg-card border rounded-lg space-y-6">
      {/* Clip Info */}
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">{selectedClip.name}</h3>
        <p className="text-sm text-muted-foreground capitalize">{selectedClip.type} Clip</p>
      </div>

      {/* Trim Controls (for video/audio) */}
      {isVideoOrAudio && (
        <TrimControls
          clip={selectedClip as VideoClip | AudioClip}
          onTrimChange={(trim) => updateClipTrim(selectedClip.id, trim)}
        />
      )}

      {/* Speed Controls (for video/audio) */}
      {isVideoOrAudio && (
        <SpeedControls
          clip={selectedClip as VideoClip | AudioClip}
          onSpeedChange={(speed) => updateClipSpeed(selectedClip.id, speed)}
        />
      )}

      {/* Duration Controls (for images) */}
      {isImage && (
        <DurationControls
          duration={selectedClip.duration}
          onDurationChange={(duration) => updateClipDuration(selectedClip.id, duration)}
        />
      )}

      {/* Volume Controls */}
      {hasVolume && (
        <VolumeControls
          volume={(selectedClip as VideoClip | AudioClip).volume}
          onVolumeChange={(volume) => updateClipVolume(selectedClip.id, volume)}
        />
      )}

      {/* Delete Button */}
      <div className="pt-4 border-t">
        <Button
          variant="destructive"
          onClick={() => {
            if (confirm(`Delete "${selectedClip.name}"?`)) {
              deleteClip(selectedClip.id);
            }
          }}
          className="w-full"
        >
          <TrashIcon className="h-4 w-4 mr-2" />
          Delete Clip
        </Button>
      </div>
    </div>
  );
}

// Trim Controls Component
function TrimControls({
  clip,
  onTrimChange,
}: {
  clip: VideoClip | AudioClip;
  onTrimChange: (trim: { start: number; end: number }) => void;
}) {
  const [trimStart, setTrimStart] = useState(clip.trim.start);
  const [trimEnd, setTrimEnd] = useState(clip.trim.end);

  const handleStartChange = (value: string) => {
    const newStart = parseFloat(value) || 0;
    const clampedStart = Math.max(0, Math.min(newStart, trimEnd - 0.1));
    setTrimStart(clampedStart);
    onTrimChange({ start: clampedStart, end: trimEnd });
  };

  const handleEndChange = (value: string) => {
    const newEnd = parseFloat(value) || 0;
    const clampedEnd = Math.min(clip.originalDuration, Math.max(newEnd, trimStart + 0.1));
    setTrimEnd(clampedEnd);
    onTrimChange({ start: trimStart, end: clampedEnd });
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-semibold">Trim</Label>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="trim-start" className="text-xs text-muted-foreground">
            Start (s)
          </Label>
          <Input
            id="trim-start"
            type="number"
            min={0}
            max={trimEnd - 0.1}
            step={0.1}
            value={trimStart.toFixed(1)}
            onChange={(e) => handleStartChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="trim-end" className="text-xs text-muted-foreground">
            End (s)
          </Label>
          <Input
            id="trim-end"
            type="number"
            min={trimStart + 0.1}
            max={clip.originalDuration}
            step={0.1}
            value={trimEnd.toFixed(1)}
            onChange={(e) => handleEndChange(e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Duration: {(trimEnd - trimStart).toFixed(1)}s
      </p>
    </div>
  );
}

// Speed Controls Component
function SpeedControls({
  clip,
  onSpeedChange,
}: {
  clip: VideoClip | AudioClip;
  onSpeedChange: (speed: number) => void;
}) {
  const [speed, setSpeed] = useState(clip.speed);

  const handleSpeedSliderChange = (value: number[]) => {
    const newSpeed = value[0];
    setSpeed(newSpeed);
    onSpeedChange(newSpeed);
  };

  const handlePresetClick = (preset: number) => {
    setSpeed(preset);
    onSpeedChange(preset);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Speed</Label>
        <span className="text-sm font-mono">{speed.toFixed(2)}x</span>
      </div>

      {/* Speed Slider */}
      <Slider
        value={[speed]}
        min={0.25}
        max={4}
        step={0.05}
        onValueChange={handleSpeedSliderChange}
      />

      {/* Speed Presets */}
      <div className="flex gap-2">
        {[0.5, 1, 2].map((preset) => (
          <Button
            key={preset}
            variant={speed === preset ? "default" : "outline"}
            size="sm"
            onClick={() => handlePresetClick(preset)}
            className="flex-1"
          >
            {preset}x
          </Button>
        ))}
      </div>
    </div>
  );
}

// Duration Controls Component (for images)
function DurationControls({
  duration,
  onDurationChange,
}: {
  duration: number;
  onDurationChange: (duration: number) => void;
}) {
  const [localDuration, setLocalDuration] = useState(duration);

  const handleDurationChange = (value: string) => {
    const newDuration = parseFloat(value) || 0.1;
    const clampedDuration = Math.max(0.1, Math.min(newDuration, 3600));
    setLocalDuration(clampedDuration);
    onDurationChange(clampedDuration);
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-semibold">Duration</Label>
      <div className="flex gap-2">
        <Input
          type="number"
          min={0.1}
          max={3600}
          step={0.1}
          value={localDuration.toFixed(1)}
          onChange={(e) => handleDurationChange(e.target.value)}
        />
        <span className="flex items-center text-sm text-muted-foreground">seconds</span>
      </div>
    </div>
  );
}

// Volume Controls Component
function VolumeControls({
  volume,
  onVolumeChange,
}: {
  volume: number;
  onVolumeChange: (volume: number) => void;
}) {
  const handleVolumeChange = (value: number[]) => {
    onVolumeChange(value[0]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Volume</Label>
        <span className="text-sm">{Math.round(volume * 100)}%</span>
      </div>
      <Slider
        value={[volume]}
        min={0}
        max={1}
        step={0.01}
        onValueChange={handleVolumeChange}
      />
    </div>
  );
}

// Trash Icon
function TrashIcon({ className }: { className?: string }) {
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
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}
