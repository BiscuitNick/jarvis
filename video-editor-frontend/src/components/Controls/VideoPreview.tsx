import React, { useRef, useEffect, useState } from 'react';
import { Clip, VideoClip, ImageClip, TextClip } from '@/types/editor';

interface VideoPreviewProps {
  clips: Clip[];
  currentTime: number;
  isPlaying: boolean;
  width?: number;
  height?: number;
  className?: string;
}

export function VideoPreview({
  clips,
  currentTime,
  isPlaying,
  width = 1920,
  height = 1080,
  className = '',
}: VideoPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRefsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [loadedClips, setLoadedClips] = useState<Set<string>>(new Set());

  // Preload video elements for all video clips
  useEffect(() => {
    const videoClips = clips.filter(clip => clip.type === 'video') as VideoClip[];

    videoClips.forEach(clip => {
      if (!videoRefsRef.current.has(clip.id)) {
        const video = document.createElement('video');
        video.src = clip.src;
        video.preload = 'auto';
        video.muted = true; // Preview is visual only
        video.addEventListener('loadeddata', () => {
          setLoadedClips(prev => new Set(prev).add(clip.id));
        });
        videoRefsRef.current.set(clip.id, video);
      }
    });

    // Cleanup removed clips
    const currentClipIds = new Set(videoClips.map(c => c.id));
    for (const [id, video] of videoRefsRef.current.entries()) {
      if (!currentClipIds.has(id)) {
        video.src = '';
        videoRefsRef.current.delete(id);
        setLoadedClips(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }
  }, [clips]);

  // Render frame based on current time
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // Find active clips at current time
    const activeClips = clips.filter(clip => {
      const clipEnd = clip.startTime + clip.duration;
      return currentTime >= clip.startTime && currentTime < clipEnd;
    });

    // Sort by track (lower tracks render first, appear behind)
    activeClips.sort((a, b) => a.track - b.track);

    // Render each active clip
    activeClips.forEach(clip => {
      const relativeTime = currentTime - clip.startTime;

      switch (clip.type) {
        case 'video':
          renderVideoClip(ctx, clip as VideoClip, relativeTime, width, height, videoRefsRef.current);
          break;
        case 'image':
          renderImageClip(ctx, clip as ImageClip, width, height);
          break;
        case 'text':
          renderTextClip(ctx, clip as TextClip, width, height);
          break;
      }
    });
  }, [clips, currentTime, width, height, loadedClips]);

  return (
    <div className={`relative bg-black rounded-lg overflow-hidden ${className}`}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full h-full"
        style={{ aspectRatio: `${width}/${height}` }}
      />
      {clips.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-muted-foreground">No clips in timeline</p>
        </div>
      )}
    </div>
  );
}

// Render video clip frame
function renderVideoClip(
  ctx: CanvasRenderingContext2D,
  clip: VideoClip,
  relativeTime: number,
  width: number,
  height: number,
  videoRefs: Map<string, HTMLVideoElement>
) {
  const video = videoRefs.get(clip.id);
  if (!video || !video.readyState || video.readyState < 2) {
    return; // Video not loaded yet
  }

  // Calculate source time accounting for trim and speed
  const trimStart = clip.trim.start;
  const sourceTime = trimStart + (relativeTime * clip.speed);

  // Update video element current time if needed
  if (Math.abs(video.currentTime - sourceTime) > 0.1) {
    video.currentTime = sourceTime;
  }

  // Draw video frame
  try {
    ctx.drawImage(video, 0, 0, width, height);
  } catch (err) {
    console.error('Error drawing video frame:', err);
  }
}

// Render image clip
function renderImageClip(
  ctx: CanvasRenderingContext2D,
  clip: ImageClip,
  width: number,
  height: number
) {
  // In a real implementation, you would load and cache the image
  // For now, draw a placeholder
  ctx.fillStyle = '#333333';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#666666';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '24px sans-serif';
  ctx.fillText('Image: ' + clip.name, width / 2, height / 2);
}

// Render text clip
function renderTextClip(
  ctx: CanvasRenderingContext2D,
  clip: TextClip,
  width: number,
  height: number
) {
  // Draw background if specified
  if (clip.backgroundColor) {
    ctx.fillStyle = clip.backgroundColor;
    ctx.fillRect(0, 0, width, height);
  }

  // Draw text
  ctx.fillStyle = clip.color;
  ctx.font = `${clip.fontSize}px ${clip.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Position text (clip.position is relative, convert to canvas coordinates)
  const x = (clip.position.x / 100) * width;
  const y = (clip.position.y / 100) * height;

  ctx.fillText(clip.content, x, y);
}

// Playhead Overlay (optional - shows current time visually)
export function PlayheadOverlay({ currentTime }: { currentTime: number }) {
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="absolute top-2 left-2 bg-black/70 text-white px-3 py-1 rounded text-sm font-mono">
      {formatTime(currentTime)}
    </div>
  );
}
