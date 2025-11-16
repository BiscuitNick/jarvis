# Video Editor Controls

This directory contains all the playback and editing control components for the video editor.

## Components

### 1. PlaybackControls

The main playback control panel with play/pause, timeline scrubber, time display, and volume control.

**Features:**
- Play/Pause button with keyboard shortcut (Space)
- Timeline scrubber for seeking
- Current time / Total duration display
- Loop toggle
- Master volume control

**Usage:**
```tsx
import { PlaybackControls } from '@/components/Controls';
import { usePlayback } from '@/hooks';

const playback = usePlayback(timelineDuration);

<PlaybackControls playback={playback} />
```

### 2. ClipControls

Advanced clip editing controls that appear when a clip is selected.

**Features:**
- **Trim Controls**: Set precise start/end times for video/audio clips
- **Speed Controls**: Adjust playback speed (0.25x - 4x) with slider and presets
- **Duration Controls**: Set duration for image clips (0.1s increments)
- **Volume Controls**: Adjust clip-specific volume
- **Delete Button**: Remove clip with confirmation

**Usage:**
```tsx
import { ClipControls } from '@/components/Controls';
import { useClipEditor } from '@/hooks';

const clipEditor = useClipEditor(clips, setClips);

<ClipControls clipEditor={clipEditor} />
```

### 3. VideoPreview

Canvas-based preview player that renders the assembled timeline in real-time.

**Features:**
- Renders video, image, and text clips
- Syncs with timeline playhead position
- Supports multiple tracks/layers
- Handles clip trimming and speed adjustments
- Preloads video elements for smooth playback

**Synchronization Approach:**
The VideoPreview component uses a canvas-based rendering system:

1. **Video Elements**: Preloaded `<video>` elements stored in a Map, keyed by clip ID
2. **Frame Rendering**: On each playback tick (via `usePlayback`), the canvas is cleared and redrawn
3. **Time Calculation**:
   - For each clip, calculate relative time: `relativeTime = currentTime - clip.startTime`
   - Account for speed: `sourceTime = trim.start + (relativeTime * speed)`
   - Update video element's currentTime to match
4. **Layer Compositing**: Clips are sorted by track number and rendered in order

**Usage:**
```tsx
import { VideoPreview, PlayheadOverlay } from '@/components/Controls';

<div className="relative">
  <VideoPreview
    clips={clips}
    currentTime={playback.playbackState.currentTime}
    isPlaying={playback.playbackState.isPlaying}
    width={1920}
    height={1080}
  />
  <PlayheadOverlay currentTime={playback.playbackState.currentTime} />
</div>
```

### 4. TimelineZoom

Zoom controls for the timeline view with keyboard shortcuts.

**Features:**
- Zoom in/out buttons
- Zoom slider (25% - 400%)
- Fit to window button
- Reset to 100% button
- Zoom percentage display
- Pixels per second calculation
- Keyboard shortcuts (Ctrl/Cmd + +/-, Ctrl/Cmd + 0)

**Usage:**
```tsx
import { TimelineZoom, useZoomKeyboardShortcuts } from '@/components/Controls';
import { useZoom } from '@/hooks';

const zoom = useZoom(100);

useZoomKeyboardShortcuts(
  zoom.zoomState,
  (newZoomState) => zoom.setZoom(newZoomState.level),
  timelineDuration,
  containerWidth
);

<TimelineZoom
  zoomState={zoom.zoomState}
  onZoomChange={(newZoomState) => zoom.setZoom(newZoomState.level)}
  timelineDuration={timelineDuration}
  containerWidth={1000}
/>
```

### 5. ExportControls

Export settings and progress indicator.

**Features:**
- **Format Selection**: MP4, WebM, MOV
- **Resolution**: 360p - 4K
- **Quality**: Low, Medium, High, Ultra
- **Frame Rate**: 24, 25, 30, 60, 120 fps
- **Audio Toggle**: Include/exclude audio
- **Progress Bar**: Real-time export progress
- **Error Handling**: Display export errors
- **File Size Estimation**: Approximate output file size

**Usage:**
```tsx
import { ExportControls } from '@/components/Controls';
import { useExport } from '@/hooks';

const exportHook = useExport();

<ExportControls exportHook={exportHook} disabled={clips.length === 0} />
```

## Hooks

### usePlayback

Manages playback state and provides playback controls.

**Returns:**
- `playbackState`: Current playback state (isPlaying, currentTime, duration, loop, volume)
- `play()`: Start playback
- `pause()`: Pause playback
- `togglePlayPause()`: Toggle play/pause
- `seek(time)`: Seek to specific time
- `setVolume(volume)`: Set master volume (0-1)
- `toggleLoop()`: Toggle loop mode
- `reset()`: Reset playback to beginning

**Implementation Details:**
Uses `requestAnimationFrame` for smooth playback animation. Automatically handles:
- Delta time calculation for consistent playback speed
- Loop behavior when reaching end of timeline
- Auto-pause at timeline end if loop is disabled

### useClipEditor

Manages clip selection and editing operations.

**Returns:**
- `selectedClip`: Currently selected clip or null
- `selectClip(id)`: Select a clip
- `updateClipTrim(id, trim)`: Update clip trim points
- `updateClipSpeed(id, speed)`: Update clip speed (auto-recalculates duration)
- `updateClipDuration(id, duration)`: Set clip duration (for images)
- `updateClipVolume(id, volume)`: Update clip volume
- `deleteClip(id)`: Remove clip from timeline

**Speed & Duration Relationship:**
When speed changes, duration is automatically recalculated:
```
newDuration = trimDuration / speed
```

Example: A 10s clip with 2x speed will have a 5s duration on the timeline.

### useExport

Manages export settings and process.

**Returns:**
- `exportSettings`: Current export settings
- `exportProgress`: Export progress state
- `updateExportSettings(settings)`: Update export settings
- `startExport()`: Begin export process
- `cancelExport()`: Cancel ongoing export

**Note:** The current implementation simulates the export process. In production, you would:
1. Process timeline clips into a render queue
2. Use WebCodecs API or server-side rendering for actual video encoding
3. Stream progress updates to the UI
4. Generate downloadable file blob

### useZoom

Manages timeline zoom state.

**Returns:**
- `zoomState`: Current zoom state (level, pixelsPerSecond)
- `setZoom(level)`: Set zoom to specific level
- `zoomIn()`: Increase zoom by 25%
- `zoomOut()`: Decrease zoom by 25%
- `resetZoom()`: Reset to 100%
- `fitToWindow(duration, width)`: Calculate zoom to fit timeline

## Playback Synchronization Approach

The video editor uses a **canvas-based rendering** approach for accurate frame-by-frame synchronization:

### Architecture

```
Timeline (clips data)
    “
usePlayback (manages currentTime)
    “
VideoPreview (renders frame at currentTime)
    “
Canvas 2D Context (composites layers)
```

### Synchronization Flow

1. **Playback Loop** (`usePlayback` hook):
   - Uses `requestAnimationFrame` for smooth 60fps updates
   - Calculates delta time between frames
   - Updates `currentTime` state
   - Handles loop behavior and timeline boundaries

2. **Frame Rendering** (`VideoPreview` component):
   - Triggers on `currentTime` change via `useEffect`
   - Clears canvas
   - Finds active clips at current time
   - Sorts clips by track (z-index)
   - Renders each clip type appropriately

3. **Video Synchronization**:
   ```typescript
   // Calculate source time accounting for trim and speed
   const trimStart = clip.trim.start;
   const relativeTime = currentTime - clip.startTime;
   const sourceTime = trimStart + (relativeTime * clip.speed);

   // Sync video element
   if (Math.abs(video.currentTime - sourceTime) > 0.1) {
     video.currentTime = sourceTime;
   }

   // Draw current frame
   ctx.drawImage(video, 0, 0, width, height);
   ```

4. **Performance Optimizations**:
   - Video elements are preloaded and cached in a Map
   - Only seek if time difference > 0.1s (prevents excessive seeking)
   - Canvas only re-renders when `currentTime` changes
   - Clips outside current time range are skipped

### Handling Edge Cases

**Speed Adjustments:**
- Source time is multiplied by speed factor
- Duration on timeline is inversely proportional to speed
- Audio pitch can optionally be preserved (requires Web Audio API)

**Trim Points:**
- Only the trimmed portion is used for time calculation
- Start trim is added as offset to source time
- End trim is handled by clip duration

**Multi-track Compositing:**
- Clips are sorted by track number (lower tracks render first)
- Each clip is drawn to the canvas in order
- Later tracks appear "on top" of earlier ones

**Transitions (Future Enhancement):**
- Can be implemented using `ctx.globalAlpha` for crossfades
- Blend modes via `ctx.globalCompositeOperation`
- Advanced effects using WebGL shaders

## Integration Example

See `EditorExample.tsx` for a complete integration example showing:
- State management for timeline clips
- Hook initialization and wiring
- Layout with preview, timeline, and controls
- Keyboard shortcuts integration

## Type Definitions

All TypeScript types are defined in `/src/types/editor.ts`:

- `Clip`: Base clip interface and type union
- `VideoClip`, `AudioClip`, `ImageClip`, `TextClip`: Specific clip types
- `Timeline`: Timeline structure
- `PlaybackState`: Playback state
- `ZoomState`: Zoom state
- `ExportSettings`, `ExportProgress`: Export types
- `EditorState`: Complete editor state

## Styling

All components use:
- **Tailwind CSS** for styling
- **shadcn/ui** components for consistent UI
- **CSS Variables** from `index.css` for theming
- **Timeline-specific colors** defined in `tailwind.config.js`

## Future Enhancements

1. **Audio Waveform Display**: Visual audio representation in clips
2. **Transitions**: Crossfades, wipes, and other effects between clips
3. **Effects**: Color grading, filters, transforms
4. **Keyframes**: Animate clip properties over time
5. **Multi-camera Editing**: Sync and switch between multiple video angles
6. **Real-time Rendering**: Hardware-accelerated preview using WebGL
7. **Cloud Export**: Server-side rendering for high-quality exports
8. **Collaboration**: Real-time collaborative editing

## Performance Considerations

- **Video Preloading**: Videos are preloaded to ensure smooth playback
- **Canvas Rendering**: More efficient than DOM-based rendering for video composition
- **RAF Loop**: `requestAnimationFrame` ensures smooth 60fps updates
- **Seek Throttling**: Only seek video elements when time difference > 0.1s
- **Memory Management**: Old video elements are cleaned up when clips are removed

## Browser Compatibility

- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari**: Full support (requires user interaction for video autoplay)
- **Mobile**: Limited support (canvas rendering may be slower)

For production, consider:
- Feature detection for WebCodecs API
- Fallback rendering modes for older browsers
- Progressive enhancement for mobile devices
