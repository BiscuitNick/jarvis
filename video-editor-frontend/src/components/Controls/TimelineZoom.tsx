import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ZoomState } from '@/types/editor';

interface TimelineZoomProps {
  zoomState: ZoomState;
  onZoomChange: (zoomState: ZoomState) => void;
  timelineDuration: number;
  containerWidth?: number;
}

export function TimelineZoom({
  zoomState,
  onZoomChange,
  timelineDuration,
  containerWidth = 1000,
}: TimelineZoomProps) {
  const { level, pixelsPerSecond } = zoomState;

  // Zoom levels: 25%, 50%, 75%, 100%, 150%, 200%, 300%, 400%
  const MIN_ZOOM = 25;
  const MAX_ZOOM = 400;
  const DEFAULT_ZOOM = 100;

  const handleZoomIn = useCallback(() => {
    const newLevel = Math.min(MAX_ZOOM, level + 25);
    const newPixelsPerSecond = calculatePixelsPerSecond(newLevel, timelineDuration, containerWidth);
    onZoomChange({ level: newLevel, pixelsPerSecond: newPixelsPerSecond });
  }, [level, timelineDuration, containerWidth, onZoomChange]);

  const handleZoomOut = useCallback(() => {
    const newLevel = Math.max(MIN_ZOOM, level - 25);
    const newPixelsPerSecond = calculatePixelsPerSecond(newLevel, timelineDuration, containerWidth);
    onZoomChange({ level: newLevel, pixelsPerSecond: newPixelsPerSecond });
  }, [level, timelineDuration, containerWidth, onZoomChange]);

  const handleFitToWindow = useCallback(() => {
    // Calculate zoom level that fits entire timeline in the container
    const basePixelsPerSecond = containerWidth / Math.max(timelineDuration, 1);
    const fitLevel = DEFAULT_ZOOM;
    const newPixelsPerSecond = calculatePixelsPerSecond(fitLevel, timelineDuration, containerWidth);
    onZoomChange({ level: fitLevel, pixelsPerSecond: newPixelsPerSecond });
  }, [timelineDuration, containerWidth, onZoomChange]);

  const handleZoomSliderChange = useCallback((value: number[]) => {
    const newLevel = value[0];
    const newPixelsPerSecond = calculatePixelsPerSecond(newLevel, timelineDuration, containerWidth);
    onZoomChange({ level: newLevel, pixelsPerSecond: newPixelsPerSecond });
  }, [timelineDuration, containerWidth, onZoomChange]);

  const handleResetZoom = useCallback(() => {
    const newPixelsPerSecond = calculatePixelsPerSecond(DEFAULT_ZOOM, timelineDuration, containerWidth);
    onZoomChange({ level: DEFAULT_ZOOM, pixelsPerSecond: newPixelsPerSecond });
  }, [timelineDuration, containerWidth, onZoomChange]);

  return (
    <div className="flex items-center gap-3 p-3 bg-card border rounded-lg">
      {/* Zoom Out Button */}
      <Button
        variant="outline"
        size="icon"
        onClick={handleZoomOut}
        disabled={level <= MIN_ZOOM}
        title="Zoom Out (Ctrl + -)"
      >
        <ZoomOutIcon className="h-4 w-4" />
      </Button>

      {/* Zoom Slider */}
      <div className="flex items-center gap-2 flex-1 min-w-[150px] max-w-[250px]">
        <Slider
          value={[level]}
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={5}
          onValueChange={handleZoomSliderChange}
          className="flex-1"
        />
        <span className="text-sm font-mono w-12 text-right">
          {level}%
        </span>
      </div>

      {/* Zoom In Button */}
      <Button
        variant="outline"
        size="icon"
        onClick={handleZoomIn}
        disabled={level >= MAX_ZOOM}
        title="Zoom In (Ctrl + +)"
      >
        <ZoomInIcon className="h-4 w-4" />
      </Button>

      {/* Divider */}
      <div className="h-6 w-px bg-border" />

      {/* Fit to Window Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleFitToWindow}
        title="Fit Timeline to Window (Ctrl + 0)"
      >
        <FitIcon className="h-4 w-4 mr-2" />
        Fit
      </Button>

      {/* Reset Zoom Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleResetZoom}
        title="Reset Zoom to 100%"
      >
        Reset
      </Button>

      {/* Timeline Info */}
      <div className="ml-auto text-sm text-muted-foreground">
        {pixelsPerSecond.toFixed(1)} px/s
      </div>
    </div>
  );
}

// Calculate pixels per second based on zoom level
function calculatePixelsPerSecond(
  zoomLevel: number,
  duration: number,
  containerWidth: number
): number {
  // Base pixels per second when zoom is 100%
  const basePixelsPerSecond = 50; // 50 pixels per second at 100% zoom

  // Apply zoom multiplier
  return basePixelsPerSecond * (zoomLevel / 100);
}

// Hook for keyboard shortcuts
export function useZoomKeyboardShortcuts(
  zoomState: ZoomState,
  onZoomChange: (zoomState: ZoomState) => void,
  timelineDuration: number,
  containerWidth: number
) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl/Cmd key
      if (!e.ctrlKey && !e.metaKey) return;

      const { level } = zoomState;

      switch (e.key) {
        case '+':
        case '=':
          e.preventDefault();
          const newLevelIn = Math.min(400, level + 25);
          onZoomChange({
            level: newLevelIn,
            pixelsPerSecond: calculatePixelsPerSecond(newLevelIn, timelineDuration, containerWidth),
          });
          break;

        case '-':
        case '_':
          e.preventDefault();
          const newLevelOut = Math.max(25, level - 25);
          onZoomChange({
            level: newLevelOut,
            pixelsPerSecond: calculatePixelsPerSecond(newLevelOut, timelineDuration, containerWidth),
          });
          break;

        case '0':
          e.preventDefault();
          onZoomChange({
            level: 100,
            pixelsPerSecond: calculatePixelsPerSecond(100, timelineDuration, containerWidth),
          });
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomState, onZoomChange, timelineDuration, containerWidth]);
}

// Icons
function ZoomInIcon({ className }: { className?: string }) {
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
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

function ZoomOutIcon({ className }: { className?: string }) {
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
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

function FitIcon({ className }: { className?: string }) {
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
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}
