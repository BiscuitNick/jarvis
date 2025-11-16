# Multi-Track Timeline System Implementation

## Overview

This is a comprehensive multi-track timeline system for a video editor built with React, TypeScript, @dnd-kit, and Tailwind CSS. The system supports drag-and-drop functionality, timeline item resizing, auto-snapping, and multi-track management.

## Architecture

### Component Structure

```
Timeline/
├── Timeline.tsx          - Main container component with DnD context
├── TimeRuler.tsx        - Time markings and playhead seek
├── TrackList.tsx        - List of tracks with add/remove functionality
├── Track.tsx            - Individual track with drop zone
└── TimelineItem.tsx     - Draggable/resizable timeline items
```

### Hooks

```
hooks/
├── useTimeline.ts       - Timeline state management
├── useDragAndDrop.ts    - Drag and drop state
└── useSnapping.ts       - Auto-snap calculations
```

### Types

```
types/
└── timeline.ts          - TypeScript interfaces and types
```

## Auto-Snap Algorithm

### Overview

The auto-snap system provides magnetic snapping behavior when dragging or resizing timeline items. It snaps items to:
1. **Grid points** - Based on configurable snap interval (e.g., 0.5 seconds)
2. **Item boundaries** - Start and end points of other timeline items

### Algorithm Details

#### 1. Snap Point Generation

**Grid Snap Points:**
```typescript
if (snapToGrid && snapInterval > 0) {
  const gridPoint = Math.round(time / snapInterval) * snapInterval;
  snapPoints.push({ time: gridPoint, type: 'grid' });
}
```

**Item Snap Points:**
```typescript
tracks.forEach(track => {
  track.items.forEach(item => {
    // Snap to item start
    snapPoints.push({
      time: item.startTime,
      type: 'item-start',
      itemId: item.id,
    });
    
    // Snap to item end
    snapPoints.push({
      time: item.startTime + item.duration,
      type: 'item-end',
      itemId: item.id,
    });
  });
});
```

#### 2. Nearest Snap Point Selection

```typescript
let nearestSnapPoint: SnapPoint | null = null;
let minDistance = snapThreshold; // Default: 0.1 seconds (100ms)

for (const point of snapPoints) {
  const distance = Math.abs(point.time - time);
  if (distance < minDistance) {
    minDistance = distance;
    nearestSnapPoint = point;
  }
}

return nearestSnapPoint ? nearestSnapPoint.time : time;
```

#### 3. Key Features

- **Threshold-based**: Only snaps if within threshold distance (default 100ms)
- **Nearest-neighbor**: Selects the closest snap point
- **Exclusion support**: Excludes the currently dragged item from snap calculations
- **Combined snapping**: Works with both grid and item boundaries simultaneously

### Snap Behavior

1. **Dragging Items**:
   - When dragging, the item's start time snaps to the nearest point
   - The item being dragged is excluded from snap calculations
   - Visual feedback shows the snapping behavior

2. **Resizing Items**:
   - **Start handle**: Snaps the new start time while adjusting duration
   - **End handle**: Snaps the new end time (start + duration)
   - Minimum duration of 0.1s is enforced

## Component Details

### Timeline.tsx

Main container component that:
- Provides DnD context using @dnd-kit
- Manages playhead position
- Handles zoom controls
- Coordinates all child components
- Displays drag overlay during drag operations

**Key Features:**
- Scrollable timeline view
- Zoom in/out controls (20-500 pixels per second)
- Snap toggle button
- Add item demo buttons
- Playhead with visual indicator

### TimeRuler.tsx

Displays time markings and handles playhead seeking.

**Features:**
- Responsive time intervals based on zoom level
- Click-to-seek functionality
- Time format: MM:SS
- Adaptive marking density

**Zoom-based Intervals:**
```typescript
let interval = 1; // Default: 1 second
if (zoom < 50) interval = 5;      // Low zoom: 5 second intervals
else if (zoom < 100) interval = 2; // Medium zoom: 2 second intervals
```

### TrackList.tsx

Manages the list of tracks.

**Features:**
- Add new tracks
- Minimum 1 track enforcement
- Sticky header with "Add Track" button
- Passes callbacks to individual tracks

### Track.tsx

Individual track component with drop zone.

**Features:**
- Drop zone for timeline items (using @dnd-kit)
- Visual feedback on hover (changes background)
- Remove track button
- Configurable height (default: 80px)
- Renders all items within the track

### TimelineItem.tsx

Draggable and resizable timeline item.

**Features:**
- **Drag and drop**: Move within and between tracks
- **Resize handles**: Start and end resize with snap support
- **Visual styling**: Color-coded by type (video/image/text/audio)
- **Selection state**: Visual indicator for selected items
- **Duration display**: Shows item duration in seconds
- **Thumbnail support**: Optional thumbnail preview

**Resize Implementation:**
```typescript
// Start handle resize
const newStartTime = onSnapTime(originalStartTime + deltaTime, item.id);
const timeDiff = newStartTime - originalStartTime;
const newDuration = Math.max(0.1, originalDuration - timeDiff);

// End handle resize
const newDuration = Math.max(0.1, originalDuration + deltaTime);
const newEndTime = onSnapTime(originalStartTime + newDuration, item.id);
const snappedDuration = newEndTime - originalStartTime;
```

## State Management

### useTimeline Hook

Centralized state management for the timeline.

**State:**
```typescript
{
  tracks: Track[];
  zoom: number;
  playheadPosition: number;
  selectedItemId: string | null;
  snapToGrid: boolean;
  snapInterval: number;
  totalDuration: number;
}
```

**Actions:**
- `addTrack()` - Add new track
- `removeTrack(id)` - Remove track (min 1 enforced)
- `updateTrack(id, updates)` - Update track properties
- `addItem(trackId, item)` - Add item to track
- `updateItem(id, updates)` - Update item properties
- `removeItem(id)` - Remove item
- `moveItem(id, trackId, time)` - Move item between tracks
- `setPlayheadPosition(time)` - Update playhead
- `zoomIn() / zoomOut()` - Adjust zoom level
- `selectItem(id)` - Select/deselect item
- `toggleSnapToGrid()` - Toggle snap mode

### useDragAndDrop Hook

Manages drag and resize state.

**State:**
- `dragInfo` - Current drag operation info
- `resizeInfo` - Current resize operation info

**Actions:**
- `startDrag() / endDrag()`
- `startResize() / endResize()`

### useSnapping Hook

Handles all snap calculations.

**Methods:**
- `snapTime(time, excludeItemId)` - Snap a time value
- `calculateSnap(time, excludeItemId)` - Get detailed snap info
- `getAllSnapPoints()` - Get all snap points for visualization
- `itemSnapPoints` - Memoized item snap points

## Drag and Drop System

### Using @dnd-kit

The implementation uses `@dnd-kit` for drag and drop:

1. **DndContext**: Wraps the track list
2. **useDraggable**: Applied to TimelineItem
3. **useDroppable**: Applied to Track
4. **DragOverlay**: Shows drag preview

### Drag Flow

1. **onDragStart**: Capture the dragged item
2. **Dragging**: Visual feedback with overlay
3. **onDragEnd**: Calculate new position with snapping
   ```typescript
   const timeDelta = delta.x / zoom;
   const newStartTime = snapTime(
     draggedItem.startTime + timeDelta,
     draggedItem.id
   );
   moveItem(draggedItem.id, targetTrackId, newStartTime);
   ```

### Auto-Placement Logic

When moving clips:
1. Calculate pixel delta from drag event
2. Convert pixel delta to time delta (using zoom factor)
3. Apply snap algorithm to new time
4. Validate new position (>= 0)
5. Update item with new track and time

## Styling

### Tailwind CSS

Custom timeline color palette defined in `tailwind.config.js`:

```javascript
colors: {
  timeline: {
    bg: '#1a1a1a',
    track: '#2a2a2a',
    item: '#3a3a3a',
    hover: '#4a4a4a',
    selected: '#5a5a5a',
    playhead: '#ff4444',
    grid: '#333333',
  }
}
```

### Item Colors

Items are color-coded by type:
- **Video**: Blue (`bg-blue-600`)
- **Image**: Green (`bg-green-600`)
- **Text**: Purple (`bg-purple-600`)
- **Audio**: Yellow (`bg-yellow-600`)

## Usage Example

```typescript
import { Timeline } from './components/Timeline';

function App() {
  return <Timeline />;
}
```

The Timeline component is self-contained with internal state management. Demo buttons are included for testing:
- Add Video Clip
- Add Image
- Add Text

## Key Features Summary

1. **Multi-track support**: Unlimited tracks, minimum 1 track enforced
2. **Drag and drop**: Intuitive item movement within and between tracks
3. **Resizing**: Resize items from start or end with snap support
4. **Auto-snapping**: Smart snapping to grid and item boundaries
5. **Zoom controls**: 20-500 pixels per second range
6. **Playhead**: Visual playhead with click-to-seek
7. **Selection**: Click to select items
8. **Visual feedback**: Hover states, drag overlay, selection indicators
9. **Type safety**: Full TypeScript support
10. **Responsive**: Adapts to zoom level

## Performance Optimizations

1. **useMemo**: Snap points are memoized and only recalculated when tracks change
2. **useCallback**: All callbacks are memoized to prevent unnecessary re-renders
3. **React.memo**: Consider wrapping components for further optimization
4. **Virtual scrolling**: Can be added for large timelines

## Future Enhancements

1. **Keyboard shortcuts**: Cut, copy, paste, delete
2. **Multi-select**: Select and move multiple items
3. **Undo/Redo**: History management
4. **Waveform display**: For audio tracks
5. **Video thumbnails**: Frame-accurate thumbnails for video clips
6. **Transitions**: Crossfades and other transitions between clips
7. **Context menu**: Right-click menu for item actions
8. **Track locking**: Lock tracks to prevent accidental edits
9. **Track hiding**: Show/hide tracks
10. **Export**: Generate video output from timeline

## Dependencies

- React 19.2.0
- @dnd-kit/core
- @dnd-kit/sortable
- @dnd-kit/utilities
- Tailwind CSS
- TypeScript 5.9.3

## File Locations

All files are located in `/home/user/jarvis/video-editor-frontend/src/`:

- Components: `components/Timeline/`
- Hooks: `hooks/`
- Types: `types/timeline.ts`
- Config: `tailwind.config.js` (root)
