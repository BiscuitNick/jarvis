/**
 * EditorExample.tsx
 *
 * This is a comprehensive example showing how to integrate all the video editor
 * control components together. Use this as a reference for building your video editor.
 */

import React, { useState } from 'react';
import { PlaybackControls } from './PlaybackControls';
import { ClipControls } from './ClipControls';
import { VideoPreview, PlayheadOverlay } from './VideoPreview';
import { TimelineZoom, useZoomKeyboardShortcuts } from './TimelineZoom';
import { ExportControls } from './ExportControls';
import { usePlayback, useClipEditor, useExport, useZoom } from '@/hooks';
import { Clip, VideoClip, ImageClip } from '@/types/editor';

export function EditorExample() {
  // Sample timeline data (replace with your actual timeline state)
  const [clips, setClips] = useState<Clip[]>([
    {
      id: '1',
      type: 'video',
      name: 'Intro.mp4',
      startTime: 0,
      duration: 5,
      track: 0,
      selected: false,
      src: '/videos/intro.mp4',
      originalDuration: 10,
      trim: { start: 0, end: 10 },
      speed: 2, // 2x speed, so 10s video plays in 5s
      volume: 0.8,
      hasAudio: true,
    } as VideoClip,
    {
      id: '2',
      type: 'image',
      name: 'Logo.png',
      startTime: 5,
      duration: 3,
      track: 1,
      selected: false,
      src: '/images/logo.png',
    } as ImageClip,
    {
      id: '3',
      type: 'video',
      name: 'Main.mp4',
      startTime: 8,
      duration: 15,
      track: 0,
      selected: false,
      src: '/videos/main.mp4',
      originalDuration: 15,
      trim: { start: 0, end: 15 },
      speed: 1,
      volume: 1,
      hasAudio: true,
    } as VideoClip,
  ]);

  // Calculate total timeline duration
  const timelineDuration = Math.max(
    ...clips.map(clip => clip.startTime + clip.duration),
    10 // Minimum duration
  );

  // Initialize hooks
  const playback = usePlayback(timelineDuration);
  const clipEditor = useClipEditor(clips, setClips);
  const exportHook = useExport();
  const zoom = useZoom(100);

  // Enable zoom keyboard shortcuts
  useZoomKeyboardShortcuts(
    zoom.zoomState,
    (newZoomState) => zoom.setZoom(newZoomState.level),
    timelineDuration,
    1000 // Container width
  );

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top Bar */}
      <header className="h-14 border-b flex items-center justify-between px-4">
        <h1 className="text-xl font-bold">Video Editor</h1>
        <div className="flex gap-2">
          <button className="px-4 py-2 text-sm">File</button>
          <button className="px-4 py-2 text-sm">Edit</button>
          <button className="px-4 py-2 text-sm">View</button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Clip Controls */}
        <aside className="w-80 border-r p-4 overflow-y-auto">
          <ClipControls clipEditor={clipEditor} />
        </aside>

        {/* Center - Preview and Timeline */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Video Preview */}
          <div className="flex-1 p-4 flex items-center justify-center bg-timeline-bg">
            <div className="relative max-w-4xl w-full">
              <VideoPreview
                clips={clips}
                currentTime={playback.playbackState.currentTime}
                isPlaying={playback.playbackState.isPlaying}
                width={1920}
                height={1080}
                className="shadow-2xl"
              />
              <PlayheadOverlay currentTime={playback.playbackState.currentTime} />
            </div>
          </div>

          {/* Timeline Area (placeholder - integrate your Timeline component here) */}
          <div className="h-64 border-t bg-timeline-track p-4">
            <div className="mb-4">
              <TimelineZoom
                zoomState={zoom.zoomState}
                onZoomChange={(newZoomState) => zoom.setZoom(newZoomState.level)}
                timelineDuration={timelineDuration}
                containerWidth={1000}
              />
            </div>
            <div className="text-center text-muted-foreground">
              Timeline Component Goes Here
              <br />
              <span className="text-xs">
                Integrate your drag-and-drop timeline with clips at {zoom.zoomState.level}% zoom
              </span>
            </div>
          </div>

          {/* Playback Controls */}
          <PlaybackControls playback={playback} />
        </main>

        {/* Right Sidebar - Export Controls */}
        <aside className="w-96 border-l p-4 overflow-y-auto">
          <ExportControls exportHook={exportHook} disabled={clips.length === 0} />
        </aside>
      </div>
    </div>
  );
}

export default EditorExample;
