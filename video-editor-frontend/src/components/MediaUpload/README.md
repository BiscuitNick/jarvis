# Media Upload System

A comprehensive media upload system for the video editor frontend, featuring file uploads, drag-and-drop functionality, URL imports, and a media library with drag-to-timeline support.

## Components

### MediaUpload

The main upload component with multiple input methods:

- **File Picker**: Click to browse and select files
- **Drag-and-Drop Zone**: Drag files directly onto the upload area
- **URL Input**: Import media from external URLs
- **Progress Tracking**: Real-time upload progress indicators
- **Multiple File Support**: Upload multiple files simultaneously

**Usage:**

```tsx
import { MediaUpload } from '@/components/MediaUpload';

<MediaUpload
  onUploadComplete={(media) => console.log('Uploaded:', media)}
  onUploadError={(error) => console.error('Error:', error)}
  maxFileSize={100 * 1024 * 1024} // 100MB
  allowedTypes={['video/*', 'image/*']}
/>
```

### MediaLibrary

A comprehensive media library component with:

- **Grid/List View**: Toggle between grid and list layouts
- **Search**: Search media by name
- **Type Filtering**: Filter by video, image, or audio
- **Drag-to-Timeline**: Drag media items to the timeline
- **Delete Functionality**: Remove media items
- **Metadata Display**: Show duration, dimensions, and file size

**Usage:**

```tsx
import { MediaLibrary } from '@/components/MediaUpload';
import { useMediaLibrary } from '@/hooks/useMediaLibrary';

const { mediaItems, removeMedia } = useMediaLibrary();

<MediaLibrary
  mediaItems={mediaItems}
  onDelete={removeMedia}
  onMediaDragStart={(media) => console.log('Dragging:', media)}
/>
```

### MediaPreview

A lazy-loading preview component for media items:

- **Lazy Loading**: Only loads images when they enter the viewport
- **Video Thumbnails**: Displays thumbnails for video files
- **Duration Display**: Shows video/audio duration
- **Loading States**: Smooth loading transitions

**Usage:**

```tsx
import { MediaPreview } from '@/components/MediaUpload';

<MediaPreview
  media={mediaItem}
  showDuration={true}
  showDimensions={false}
  lazy={true}
/>
```

## Hooks

### useFileUpload

Manages file upload logic and state:

```tsx
import { useFileUpload } from '@/hooks/useFileUpload';

const {
  uploads,
  isUploading,
  uploadFile,
  uploadFiles,
  uploadFromUrl,
  clearUploads,
} = useFileUpload({
  onSuccess: (media) => console.log('Success:', media),
  onError: (error) => console.error('Error:', error),
  maxFileSize: 100 * 1024 * 1024,
  allowedTypes: ['video/*', 'image/*'],
});
```

### useMediaLibrary

Manages media library state and operations:

```tsx
import { useMediaLibrary } from '@/hooks/useMediaLibrary';

const {
  mediaItems,
  isLoading,
  error,
  loadMedia,
  addMedia,
  removeMedia,
  updateMedia,
  searchMedia,
  filterByType,
} = useMediaLibrary({ autoLoad: true });
```

## Drag-and-Drop Implementation

### How It Works

The drag-and-drop system uses the HTML5 Drag and Drop API with two main parts:

#### 1. Drag Source (MediaLibrary)

When a user starts dragging a media item from the library:

```tsx
const handleDragStart = (e: React.DragEvent, media: MediaItem) => {
  // Set the drag effect to "copy" (shows a copy cursor)
  e.dataTransfer.effectAllowed = 'copy';
  
  // Transfer the media data in multiple formats
  e.dataTransfer.setData('application/json', JSON.stringify(media));
  e.dataTransfer.setData('text/plain', media.id);
  
  // Optional: Notify parent component
  onMediaDragStart?.(media);
};
```

**Key Points:**
- `effectAllowed: 'copy'` - Indicates the drag operation will copy (not move) the item
- `setData('application/json', ...)` - Stores the full media object as JSON
- `setData('text/plain', ...)` - Stores just the ID as fallback
- Multiple formats ensure compatibility with different drop targets

#### 2. Drop Target (Timeline or other components)

To accept dropped media items, implement these handlers:

```tsx
const handleDragOver = (e: React.DragEvent) => {
  e.preventDefault(); // Required to allow dropping
  e.dataTransfer.dropEffect = 'copy'; // Show copy cursor
};

const handleDrop = (e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();

  try {
    // Retrieve the media data
    const mediaJson = e.dataTransfer.getData('application/json');
    if (mediaJson) {
      const media: MediaItem = JSON.parse(mediaJson);
      
      // Calculate drop position (e.g., timeline position)
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = calculateTimeFromPosition(x);
      
      // Add media to timeline
      addMediaToTimeline(media, time);
    }
  } catch (error) {
    console.error('Failed to handle drop:', error);
  }
};
```

**Example Timeline Implementation:**

```tsx
<div
  className="timeline-track"
  onDragOver={handleDragOver}
  onDrop={handleDrop}
>
  {/* Timeline content */}
</div>
```

### Visual Feedback

The MediaLibrary provides visual feedback during dragging:

1. **Hover Effect**: Items show a shadow and scale slightly on hover
2. **Cursor**: Changes to a move cursor when hovering over draggable items
3. **Drag Ghost**: The browser creates a drag image automatically

You can customize the drag image:

```tsx
const handleDragStart = (e: React.DragEvent, media: MediaItem) => {
  // Create custom drag image
  const dragImage = document.createElement('div');
  dragImage.className = 'drag-preview';
  dragImage.textContent = media.name;
  document.body.appendChild(dragImage);
  
  e.dataTransfer.setDragImage(dragImage, 0, 0);
  
  // Clean up after drag
  setTimeout(() => document.body.removeChild(dragImage), 0);
};
```

### File Upload Drag-and-Drop

The MediaUpload component also supports dragging files from the desktop:

```tsx
const handleDragEnter = (e: React.DragEvent) => {
  e.preventDefault();
  setIsDragging(true); // Show visual feedback
};

const handleDragLeave = (e: React.DragEvent) => {
  e.preventDefault();
  setIsDragging(false);
};

const handleDragOver = (e: React.DragEvent) => {
  e.preventDefault(); // Required to enable drop
};

const handleDrop = (e: React.DragEvent) => {
  e.preventDefault();
  setIsDragging(false);
  
  const files = e.dataTransfer.files;
  uploadFiles(Array.from(files));
};
```

## TypeScript Interfaces

All media-related types are defined in `/src/types/index.ts`:

```typescript
interface MediaItem {
  id: string;
  name: string;
  type: 'video' | 'image' | 'audio';
  url: string;
  thumbnailUrl?: string;
  duration?: number;
  width?: number;
  height?: number;
  size: number;
  uploadedAt: string;
  metadata?: Record<string, any>;
}

interface MediaUploadProgress {
  fileId: string;
  fileName: string;
  progress: number; // 0-100
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
  error?: string;
}
```

## Styling

Components use Tailwind CSS and shadcn/ui for styling. Customize by:

1. **Tailwind Config**: Modify `/tailwind.config.js` for theme changes
2. **CSS Variables**: Update in `/src/index.css` for color schemes
3. **Component Props**: Pass `className` for component-specific styling

Example:

```tsx
<MediaLibrary
  mediaItems={items}
  className="max-w-4xl mx-auto"
/>
```

## API Integration

The components expect the following API endpoints:

### Upload File
```
POST /api/media/upload
Content-Type: multipart/form-data

Response:
{
  "success": true,
  "data": {
    "id": "media_123",
    "url": "https://...",
    "thumbnailUrl": "https://...",
    "name": "video.mp4",
    "type": "video",
    "duration": 120,
    "width": 1920,
    "height": 1080,
    "size": 10485760
  }
}
```

### Upload from URL
```
POST /api/media/upload-url
Content-Type: application/json

Body:
{
  "url": "https://example.com/video.mp4"
}

Response: Same as upload file
```

### List Media
```
GET /api/media

Response:
{
  "success": true,
  "data": [MediaItem, ...]
}
```

### Delete Media
```
DELETE /api/media/:id

Response:
{
  "success": true
}
```

## Complete Example

See `MediaUploadExample.tsx` for a complete working example that combines all components and hooks.

## Performance Considerations

1. **Lazy Loading**: MediaPreview uses Intersection Observer for lazy loading
2. **Memoization**: Consider wrapping callbacks with `useCallback`
3. **Virtual Scrolling**: For large libraries (>100 items), implement virtual scrolling
4. **Debounced Search**: Search is immediate but could be debounced for large datasets

## Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Requires HTML5 Drag and Drop API support
- File API support for uploads
- IntersectionObserver for lazy loading (polyfill available)
