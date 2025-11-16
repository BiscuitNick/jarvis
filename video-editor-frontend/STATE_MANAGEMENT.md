# Video Editor Frontend - State Management & Backend Integration

## Overview

This document describes the state management architecture and backend integration approach for the video editor frontend application.

## Architecture

The application uses **Zustand** for state management, organized into three main stores:

1. **Timeline Store** - Manages timeline data (tracks, items, playhead)
2. **Media Store** - Manages media library and uploads
3. **Editor Store** - Manages UI state (selection, zoom, settings)

## Directory Structure

```
src/
├── store/                    # Zustand state stores
│   ├── timelineStore.ts     # Timeline state management
│   ├── mediaStore.ts        # Media library management
│   ├── editorStore.ts       # Editor UI state
│   └── index.ts             # Barrel export
│
├── lib/                     # Utilities and services
│   ├── api/                 # API clients
│   │   ├── client.ts       # Base Axios client
│   │   ├── mediaApi.ts     # Media upload endpoints
│   │   ├── nanoBananaApi.ts # Nano-Banana integration
│   │   ├── exportApi.ts    # Export/render endpoints
│   │   └── index.ts        # Barrel export
│   │
│   ├── timeline/           # Timeline utilities
│   │   ├── calculations.ts # Time/position calculations
│   │   ├── validation.ts   # State validation
│   │   ├── export.ts       # Export formatting (EDL, XML)
│   │   └── index.ts        # Barrel export
│   │
│   ├── config.ts           # App configuration
│   └── storage.ts          # LocalStorage persistence
│
├── hooks/                   # Custom React hooks
│   ├── useMediaUpload.ts   # Media upload with progress
│   ├── useNanoBanana.ts    # AI image generation
│   ├── useTimelineExport.ts # Timeline export/render
│   └── index.ts            # Barrel export
│
└── types/                   # TypeScript definitions
    └── index.ts            # All type definitions
```

## State Stores

### 1. Timeline Store (`timelineStore.ts`)

**Purpose:** Manages the timeline data structure including tracks, items, and playhead position.

**Key State:**
```typescript
interface TimelineState {
  tracks: Track[];           // Video/audio/text tracks
  items: TimelineItem[];     // Timeline items (clips)
  playheadPosition: number;  // Current playhead time (seconds)
  duration: number;          // Total timeline duration
  zoom: number;              // Zoom level (pixels per second)
  selectedItemIds: string[]; // Selected items
}
```

**Key Actions:**
- `addTrack()` - Add new track
- `addItem()` - Add item to timeline
- `updateItem()` - Update item properties
- `moveItem()` - Move item to different track/time
- `setPlayheadPosition()` - Update playhead
- `setZoom()` - Adjust zoom level

**Persistence:** Automatically saves to localStorage via Zustand persist middleware

**Usage Example:**
```typescript
import { useTimelineStore } from '@/store';

function Timeline() {
  const { items, addItem, setPlayheadPosition } = useTimelineStore();

  const handleAddClip = () => {
    addItem({
      trackId: 'track-1',
      type: 'video',
      startTime: 0,
      duration: 5,
      mediaUrl: 'https://...',
      name: 'My Video'
    });
  };
}
```

### 2. Media Store (`mediaStore.ts`)

**Purpose:** Manages the media library and file uploads.

**Key State:**
```typescript
interface MediaStore {
  mediaItems: MediaItem[];            // All uploaded media
  uploads: Map<string, MediaUploadProgress>; // Active uploads
  searchQuery: string;                // Search filter
  filterType: 'all' | 'video' | 'image' | 'audio';
  sortBy: 'name' | 'date' | 'size' | 'type';
}
```

**Key Actions:**
- `addMediaItem()` - Add media to library
- `removeMediaItem()` - Delete media
- `addUpload()` - Track upload progress
- `setSearchQuery()` - Filter media
- `getFilteredMedia()` - Get filtered/sorted media

**Persistence:** Media items saved to localStorage

**Usage Example:**
```typescript
import { useMediaStore } from '@/store';

function MediaLibrary() {
  const { mediaItems, searchQuery, setSearchQuery } = useMediaStore();
  const filteredMedia = useMediaStore(s => s.getFilteredMedia());

  return (
    <div>
      <input
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
      />
      {filteredMedia.map(item => <MediaCard key={item.id} media={item} />)}
    </div>
  );
}
```

### 3. Editor Store (`editorStore.ts`)

**Purpose:** Manages UI state and editor settings.

**Key State:**
```typescript
interface EditorState {
  selectedItemIds: string[];  // Selected timeline items
  selectedTrackId: string | null;
  zoom: number;               // Current zoom level
  snapEnabled: boolean;       // Snap to grid enabled
  snapInterval: number;       // Snap interval (seconds)
  playing: boolean;           // Playback state
  gridVisible: boolean;       // Show grid
  rulerVisible: boolean;      // Show ruler
}
```

**Key Actions:**
- `setSelectedItemIds()` - Update selection
- `setZoom()` / `zoomIn()` / `zoomOut()` - Zoom controls
- `toggleSnap()` - Toggle snap to grid
- `setPlaying()` - Control playback
- `toggleGrid()` / `toggleRuler()` - Toggle UI elements

**No Persistence:** UI state is ephemeral (resets on reload)

**Usage Example:**
```typescript
import { useEditorStore } from '@/store';

function TimelineControls() {
  const { zoom, zoomIn, zoomOut, snapEnabled, toggleSnap } = useEditorStore();

  return (
    <div>
      <button onClick={zoomOut}>-</button>
      <span>{zoom}px/s</span>
      <button onClick={zoomIn}>+</button>
      <button onClick={toggleSnap}>
        Snap: {snapEnabled ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}
```

## API Integration

### Base API Client (`lib/api/client.ts`)

**Setup:** Axios-based client with interceptors

**Features:**
- Automatic auth token injection
- Request/response interceptors
- Error handling
- Progress tracking for uploads

**Configuration:**
```typescript
// Reads from environment variables
VITE_API_BASE_URL=http://localhost:3000/api
```

**Usage:**
```typescript
import { api } from '@/lib/api';

// GET request
const response = await api.get<User[]>('/users');

// POST with data
const response = await api.post<User>('/users', { name: 'John' });

// File upload with progress
const response = await api.upload<MediaItem>(
  '/media/upload',
  formData,
  (progress) => console.log(`${progress}%`)
);
```

### Media API (`lib/api/mediaApi.ts`)

**Endpoints:**
- `uploadMedia()` - Upload single file with progress
- `uploadMultipleMedia()` - Upload multiple files
- `getMediaItems()` - Get all media
- `deleteMediaItem()` - Delete media
- `generateThumbnail()` - Generate video thumbnail

**Example:**
```typescript
import { uploadMedia } from '@/lib/api';

const result = await uploadMedia({
  file: selectedFile,
  onProgress: (progress) => {
    console.log(`Upload: ${progress}%`);
  }
});

if (result.success) {
  console.log('Media URL:', result.data.url);
}
```

### Nano-Banana API (`lib/api/nanoBananaApi.ts`)

**Purpose:** Integration with Nano-Banana AI image generation model

**Endpoints:**
- `generateImage()` - Generate from prompt and optional image
- `generateImageFromFile()` - Generate from File object
- `generateImageFromUrl()` - Generate from URL
- `generateVariations()` - Generate multiple variations

**Request Format:**
```typescript
interface NanoBananaRequest {
  prompt: string;              // Text prompt
  image_input?: string;        // Base64 or URL
  num_inference_steps?: number; // Default: 4
  guidance_scale?: number;     // Default: 0
  seed?: number;               // Random if not provided
}
```

**Response Format:**
```typescript
interface NanoBananaResponse {
  image_url: string;    // Generated image URL
  s3_url: string;       // S3 storage URL
  seed: number;         // Seed used
  generation_time: number;
}
```

**Example:**
```typescript
import { generateImageFromFile } from '@/lib/api';

const result = await generateImageFromFile(
  'A beautiful sunset over mountains',
  referenceImage,
  { num_inference_steps: 4 }
);

if (result.success) {
  console.log('Generated image:', result.data.s3_url);
}
```

### Export API (`lib/api/exportApi.ts`)

**Purpose:** Timeline export and video rendering

**Endpoints:**
- `exportTimeline()` - Start export job
- `getExportStatus()` - Check job status
- `pollExportStatus()` - Poll until complete
- `cancelExportJob()` - Cancel export

**Export Presets:**
- YouTube 1080p / 4K
- Instagram Feed / Story
- TikTok
- Twitter
- Custom

**Example:**
```typescript
import { exportTimeline } from '@/lib/api';

const result = await exportTimeline({
  timeline: {
    tracks: timelineStore.tracks,
    items: timelineStore.items,
    duration: timelineStore.duration
  },
  settings: {
    width: 1920,
    height: 1080,
    framerate: 30,
    format: 'mp4',
    quality: 'high'
  }
});

if (result.success) {
  console.log('Export job ID:', result.data.jobId);
}
```

## Custom Hooks

### `useMediaUpload()`

**Purpose:** Handle file uploads with progress tracking

**Returns:**
```typescript
{
  uploading: boolean;
  uploadProgress: Map<string, number>;
  uploadFile: (file: File) => Promise<MediaItem | null>;
  uploadFiles: (files: File[]) => Promise<MediaItem[]>;
  cancelUpload: (fileId: string) => void;
}
```

**Features:**
- Automatic progress tracking
- Metadata extraction (duration, dimensions)
- Integration with media store
- Error handling

**Example:**
```typescript
import { useMediaUpload } from '@/hooks';

function UploadButton() {
  const { uploadFile, uploading, uploadProgress } = useMediaUpload();

  const handleUpload = async (file: File) => {
    const media = await uploadFile(file);
    if (media) {
      console.log('Uploaded:', media.url);
    }
  };

  return <FileInput onFile={handleUpload} disabled={uploading} />;
}
```

### `useNanoBanana()`

**Purpose:** AI image generation with Nano-Banana

**Returns:**
```typescript
{
  generating: boolean;
  error: string | null;
  result: NanoBananaResponse | null;
  generate: (request: NanoBananaRequest) => Promise<NanoBananaResponse | null>;
  generateFromFile: (prompt, file, options) => Promise<NanoBananaResponse | null>;
  generateFromUrl: (prompt, url, options) => Promise<NanoBananaResponse | null>;
  checkHealth: () => Promise<boolean>;
  reset: () => void;
}
```

**Example:**
```typescript
import { useNanoBanana } from '@/hooks';

function ImageGenerator() {
  const { generate, generating, result, error } = useNanoBanana();

  const handleGenerate = async () => {
    const image = await generate({
      prompt: 'A futuristic city at sunset',
      num_inference_steps: 4
    });

    if (image) {
      console.log('Generated:', image.s3_url);
    }
  };

  return (
    <div>
      <button onClick={handleGenerate} disabled={generating}>
        Generate Image
      </button>
      {result && <img src={result.image_url} />}
      {error && <p>Error: {error}</p>}
    </div>
  );
}
```

### `useTimelineExport()`

**Purpose:** Export timeline to video with progress tracking

**Returns:**
```typescript
{
  exporting: boolean;
  progress: number;
  error: string | null;
  jobId: string | null;
  status: ExportJobStatus | null;
  startExportWithProgress: (request) => Promise<ExportJobStatus | null>;
  checkStatus: (jobId: string) => Promise<ExportJobStatus | null>;
  cancel: (jobId: string) => Promise<boolean>;
  download: (url: string, filename?: string) => void;
  presets: ExportPreset[];
}
```

**Example:**
```typescript
import { useTimelineExport } from '@/hooks';
import { useTimelineStore } from '@/store';

function ExportButton() {
  const { startExportWithProgress, exporting, progress } = useTimelineExport();
  const timeline = useTimelineStore();

  const handleExport = async () => {
    const result = await startExportWithProgress({
      timeline: {
        tracks: timeline.tracks,
        items: timeline.items,
        duration: timeline.duration
      },
      settings: {
        width: 1920,
        height: 1080,
        framerate: 30,
        format: 'mp4',
        quality: 'high'
      }
    });

    if (result?.status === 'completed') {
      console.log('Export complete:', result.outputUrl);
    }
  };

  return (
    <button onClick={handleExport} disabled={exporting}>
      {exporting ? `Exporting... ${progress}%` : 'Export'}
    </button>
  );
}
```

## Timeline Utilities

### Calculations (`lib/timeline/calculations.ts`)

**Purpose:** Time/position calculations for timeline

**Key Functions:**
- `pixelsToSeconds()` / `secondsToPixels()` - Coordinate conversion
- `snapToGrid()` - Snap time to grid interval
- `calculateItemPosition()` - Get item pixel position
- `calculateTimeFromMousePosition()` - Convert mouse to time
- `findItemsAtTime()` - Find items at playhead
- `findGaps()` - Find gaps between items

**Example:**
```typescript
import { secondsToPixels, snapToGrid } from '@/lib/timeline';

const pixelPosition = secondsToPixels(5, 50); // 5 seconds at 50px/s = 250px
const snappedTime = snapToGrid(4.23, 0.1, true); // 4.2 seconds
```

### Validation (`lib/timeline/validation.ts`)

**Purpose:** Validate timeline state and detect issues

**Key Functions:**
- `validateTimeline()` - Validate entire state
- `validateItem()` - Validate single item
- `checkOverlaps()` - Detect overlapping items
- `canPlaceItem()` - Check if placement is valid
- `sanitizeTimeline()` - Fix common issues

**Example:**
```typescript
import { validateTimeline, sanitizeTimeline } from '@/lib/timeline';

const errors = validateTimeline(timelineState);
if (errors.length > 0) {
  console.warn('Timeline issues:', errors);
  const fixed = sanitizeTimeline(timelineState);
}
```

### Export (`lib/timeline/export.ts`)

**Purpose:** Export timeline to various formats

**Supported Formats:**
- JSON (native format)
- EDL (Edit Decision List)
- FCP XML (Final Cut Pro)
- Resolve XML (DaVinci Resolve)

**Key Functions:**
- `timelineToJSON()` - Export as JSON
- `timelineToEDL()` - Export as EDL
- `timelineToFCPXML()` - Export as FCP XML
- `timelineToResolveXML()` - Export as Resolve XML
- `exportFunctions.*` - Auto-download exports

**Example:**
```typescript
import { exportFunctions } from '@/lib/timeline';

// Export and download as EDL
exportFunctions.exportAsEDL(timeline, 'my-project.edl', 30);

// Export as JSON
const json = timelineToJSON(timeline);
```

## Persistence

### LocalStorage (`lib/storage.ts`)

**Purpose:** Persist state between sessions

**Modules:**

1. **ProjectStorage** - Save/load projects
   - `saveProject()` - Save current project
   - `loadCurrentProject()` - Load last project
   - `getProjectsList()` - Get all projects
   - `exportProject()` - Export as JSON file
   - `importProject()` - Import from JSON file

2. **AutoSaveStorage** - Auto-save functionality
   - `save()` - Save current state
   - `load()` - Load auto-saved state
   - `clear()` - Clear auto-save

3. **SettingsStorage** - User preferences
   - `save()` - Save settings
   - `load()` - Load settings
   - `reset()` - Reset to defaults

**Auto-Save Example:**
```typescript
import { AutoSave, AutoSaveStorage } from '@/lib/storage';
import { useTimelineStore, useMediaStore } from '@/store';

// Create auto-save instance
const autoSave = new AutoSave(() => {
  const timeline = useTimelineStore.getState();
  const media = useMediaStore.getState();
  AutoSaveStorage.save(timeline, media.mediaItems);
});

// Trigger on changes
timeline.subscribe(() => autoSave.trigger());

// Force save
autoSave.flush();
```

## Configuration

### Environment Variables (`.env`)

```bash
# API Configuration
VITE_API_BASE_URL=http://localhost:3000/api
VITE_NANO_BANANA_API_URL=https://api.nanobanana.io

# Upload Settings
VITE_MAX_UPLOAD_SIZE=524288000  # 500MB

# Supported Formats
VITE_SUPPORTED_VIDEO_FORMATS=mp4,webm,mov,avi,mkv
VITE_SUPPORTED_IMAGE_FORMATS=jpg,jpeg,png,gif,webp,svg
VITE_SUPPORTED_AUDIO_FORMATS=mp3,wav,ogg,aac,m4a

# Timeline Defaults
VITE_SNAP_INTERVAL=0.1
VITE_DEFAULT_IMAGE_DURATION=5
VITE_DEFAULT_ZOOM=50
```

### Config Access (`lib/config.ts`)

```typescript
import { config } from '@/lib/config';

console.log(config.apiBaseUrl);
console.log(config.maxUploadSize);
console.log(config.supportedVideoFormats);
```

## Type Safety

All types are defined in `src/types/index.ts`:

**Core Types:**
- `TimelineItem` - Timeline clip/item
- `Track` - Timeline track
- `TimelineState` - Complete timeline state
- `MediaItem` - Media library item
- `EditorState` - Editor UI state

**API Types:**
- `ApiResponse<T>` - Generic API response
- `NanoBananaRequest/Response` - AI generation
- `ExportTimelineRequest/Response` - Export
- `UploadMediaRequest/Response` - Media upload

## Best Practices

1. **Use Selectors** - Only subscribe to needed state
   ```typescript
   const items = useTimelineStore(s => s.items);
   ```

2. **Batch Updates** - Use store methods that batch related changes
   ```typescript
   updateItems([
     { id: '1', changes: { startTime: 5 } },
     { id: '2', changes: { startTime: 10 } }
   ]);
   ```

3. **Error Handling** - Always check API responses
   ```typescript
   const result = await uploadMedia({ file });
   if (!result.success) {
     console.error(result.error);
   }
   ```

4. **Progress Tracking** - Use hooks for operations with progress
   ```typescript
   const { uploadFile, uploadProgress } = useMediaUpload();
   ```

5. **Validation** - Validate before mutations
   ```typescript
   const canPlace = canPlaceItem(item, time, trackId, items);
   if (!canPlace.valid) return;
   ```

## Dependencies

```json
{
  "zustand": "^4.4.7",        // State management
  "axios": "^1.6.2",          // HTTP client
  "uuid": "^9.0.1"            // ID generation
}
```

## Next Steps

1. **Implement UI Components** - Build timeline, media library, and export UI
2. **Add Undo/Redo** - Implement history tracking in stores
3. **Real-time Collaboration** - Add WebSocket for multi-user editing
4. **Offline Support** - Add service worker for offline editing
5. **Performance** - Add virtualization for large timelines
