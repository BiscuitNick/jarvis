# Video Editor Timeline - Quick Start Guide

## Overview

A professional multi-track timeline system for video editing with drag-and-drop, resizing, and auto-snap functionality.

## Features

- **Multi-track editing**: Add/remove tracks (minimum 1 track)
- **Drag and drop**: Move clips within and between tracks
- **Resize clips**: Drag start/end handles to trim clips
- **Auto-snap**: Magnetic snapping to grid and item boundaries
- **Zoom controls**: Adjust timeline scale (20-500 px/s)
- **Click-to-seek**: Click timeline ruler to move playhead
- **Visual feedback**: Color-coded clips, selection states, hover effects

## Installation

Dependencies are already installed:
```bash
npm install  # Already done
```

## Running the Application

```bash
npm run dev
```

The timeline will be accessible at `http://localhost:5173`

## Basic Usage

### Adding Items

Use the demo buttons in the top toolbar:
- **Add Video Clip**: Creates a blue video clip
- **Add Image**: Creates a green image clip
- **Add Text**: Creates a purple text clip

### Managing Tracks

- **Add Track**: Click the "+ Add Track" button in the track list
- **Remove Track**: Click "Remove" on any track (minimum 1 track required)

### Manipulating Items

1. **Move Items**:
   - Click and drag any item
   - Drop on same track to reorder
   - Drop on different track to move between tracks
   - Auto-snaps to nearby items and grid

2. **Resize Items**:
   - Hover over left edge → drag to adjust start time
   - Hover over right edge → drag to adjust duration
   - Resizing respects snap points

3. **Select Items**:
   - Click any item to select it
   - Selected items show a white border

### Timeline Controls

- **Zoom In**: Click "+" button or use mouse wheel
- **Zoom Out**: Click "-" button or use mouse wheel
- **Toggle Snap**: Click "Snap: ON/OFF" to enable/disable snapping
- **Seek**: Click anywhere on the time ruler to move playhead

## Auto-Snap Algorithm

### How It Works

The auto-snap system uses a **threshold-based nearest-neighbor algorithm**:

1. **Generate Snap Points**:
   - Grid points every 0.5 seconds (configurable)
   - Start point of every item
   - End point of every item

2. **Find Nearest Point**:
   - When dragging/resizing, calculate distance to all snap points
   - Exclude the currently dragged item
   - If any point is within 100ms threshold, snap to it

3. **Apply Snap**:
   - Update item position to snapped time
   - Provide visual feedback during drag

### Example

```typescript
// Dragging an item to time 3.47s with snap enabled
const snapPoints = [
  { time: 3.0, type: 'grid' },      // Grid point at 3.0s
  { time: 3.5, type: 'grid' },      // Grid point at 3.5s
  { time: 3.45, type: 'item-end' }, // Another item ends here
];

// Nearest point is 3.45s (20ms away)
// Snap to 3.45s because it's within 100ms threshold
```

## File Structure

```
src/
├── components/
│   └── Timeline/
│       ├── Timeline.tsx       - Main component
│       ├── TimeRuler.tsx      - Time markers
│       ├── TrackList.tsx      - Track container
│       ├── Track.tsx          - Individual track
│       └── TimelineItem.tsx   - Draggable item
├── hooks/
│   ├── useTimeline.ts         - State management
│   ├── useDragAndDrop.ts      - Drag state
│   └── useSnapping.ts         - Snap calculations
└── types/
    └── timeline.ts            - TypeScript types
```

## Customization

### Changing Snap Interval

Edit the constant in `src/hooks/useTimeline.ts`:

```typescript
const SNAP_INTERVAL = 0.5; // Change to desired interval in seconds
```

### Adjusting Snap Threshold

Modify the default threshold in `src/hooks/useSnapping.ts`:

```typescript
snapThreshold = 0.1 // Change to desired threshold in seconds
```

### Changing Item Colors

Edit the `getItemColor()` function in `src/components/Timeline/TimelineItem.tsx`:

```typescript
const getItemColor = () => {
  switch (item.type) {
    case 'video': return 'bg-blue-600';   // Change colors here
    case 'image': return 'bg-green-600';
    case 'text': return 'bg-purple-600';
    case 'audio': return 'bg-yellow-600';
  }
};
```

### Timeline Colors

Modify `tailwind.config.js`:

```javascript
timeline: {
  bg: '#1a1a1a',        // Timeline background
  track: '#2a2a2a',     // Track background
  playhead: '#ff4444',  // Playhead color
  // ... other colors
}
```

## Advanced Usage

### Programmatic Item Creation

```typescript
const newItem: TimelineItem = {
  id: 'item-' + Date.now(),
  type: 'video',
  trackId: 'track-1',
  startTime: 5.0,      // Start at 5 seconds
  duration: 3.5,        // 3.5 seconds long
  name: 'My Clip',
  thumbnail: 'url/to/thumbnail.jpg', // Optional
};

timeline.addItem('track-1', newItem);
```

### Accessing Timeline State

The Timeline component uses the `useTimeline` hook internally. To access state from outside:

```typescript
import { useTimeline } from './hooks/useTimeline';

function MyComponent() {
  const { state, addItem, moveItem } = useTimeline();
  
  console.log(state.tracks);
  console.log(state.playheadPosition);
  console.log(state.zoom);
}
```

## Keyboard Shortcuts (Future)

Planned shortcuts:
- `Space`: Play/pause
- `Delete`: Remove selected item
- `Cmd/Ctrl + Z`: Undo
- `Cmd/Ctrl + Shift + Z`: Redo
- `Cmd/Ctrl + C`: Copy
- `Cmd/Ctrl + V`: Paste

## Performance Tips

1. **Limit Items**: For optimal performance, keep items under 100 per track
2. **Disable Snap**: Turn off snapping when working with many items
3. **Reduce Zoom**: Lower zoom levels reduce rendering overhead
4. **Virtual Scrolling**: Consider implementing for timelines with 1000+ items

## Troubleshooting

### Items Not Snapping

- Check if "Snap: ON" is displayed in the toolbar
- Verify snap interval is not too small
- Ensure threshold is reasonable (default: 0.1s)

### Drag Not Working

- Verify @dnd-kit packages are installed
- Check browser console for errors
- Ensure DndContext wraps the timeline

### Performance Issues

- Reduce number of timeline items
- Disable thumbnails for better performance
- Lower zoom level
- Use React DevTools Profiler to identify bottlenecks

## API Reference

### useTimeline Hook

```typescript
const {
  state,           // Timeline state object
  addTrack,        // () => void
  removeTrack,     // (id: string) => void
  addItem,         // (trackId: string, item: TimelineItem) => void
  updateItem,      // (id: string, updates: Partial<TimelineItem>) => void
  removeItem,      // (id: string) => void
  moveItem,        // (id: string, trackId: string, time: number) => void
  setPlayheadPosition, // (time: number) => void
  zoomIn,          // () => void
  zoomOut,         // () => void
  selectItem,      // (id: string | null) => void
  toggleSnapToGrid, // () => void
} = useTimeline();
```

### useSnapping Hook

```typescript
const {
  snapTime,         // (time: number, excludeId?: string) => number
  calculateSnap,    // (time: number, excludeId?: string) => SnapResult
  getAllSnapPoints, // () => SnapPoint[]
} = useSnapping({
  tracks,
  snapToGrid: true,
  snapInterval: 0.5,
  snapThreshold: 0.1,
});
```

## License

This timeline system is part of the video editor frontend project.

## Support

For issues or questions, refer to the main project documentation.
