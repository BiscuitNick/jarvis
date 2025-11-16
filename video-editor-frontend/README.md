# Video Editor Timeline - React 19 Application

A modern, feature-rich video editor timeline built with React 19, TypeScript, Tailwind CSS, and shadcn/ui components. Developed using 5 parallel AI agents for rapid implementation.

## 🎯 Features

### Media Upload System
- **Multiple upload methods**: File picker, drag-and-drop from desktop, URL input
- Real-time upload progress tracking
- Media library with grid/list views
- Search and filter functionality
- Drag media from library to timeline

### Multi-Track Timeline
- Unlimited tracks (minimum 1 enforced)
- Drag-and-drop clips within and between tracks
- Resizable clips for precise trimming
- **Auto-snap system**: Grid snapping (0.5s intervals) + item boundary snapping
- Color-coded by media type (video/image/text/audio)
- Zoom controls (25%-400%)
- Click-to-seek time ruler

### Playback Controls
- Play/pause with real-time synchronization
- Timeline scrubber for seeking
- Loop mode and volume control

### Clip Editing
- Trim controls (start/end times)
- Speed adjustment (0.25x - 4x) with automatic duration recalculation
- Duration control for images (0.1s increments)
- Delete clips

### Export System
- Multiple formats (MP4, WebM, MOV)
- Resolution options (360p to 4K)
- Quality presets and frame rate selection
- Progress tracking

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## 📁 Project Structure

```
src/
├── components/
│   ├── MediaUpload/      # File upload & media library
│   ├── Timeline/         # Multi-track timeline system
│   ├── Controls/         # Playback & editing controls
│   └── ui/              # shadcn/ui components
├── hooks/               # Custom React hooks
├── store/              # Zustand state management
├── lib/                # Utilities & API clients
└── types/              # TypeScript definitions
```

## 🎨 Technologies

- React 19 + Vite + TypeScript
- Tailwind CSS + shadcn/ui
- @dnd-kit (drag-and-drop)
- Zustand (state management)
- Axios (HTTP client)

## 📖 Documentation

- `TIMELINE_IMPLEMENTATION.md` - Timeline details
- `STATE_MANAGEMENT.md` - State architecture
- `CONTROLS_IMPLEMENTATION.md` - Playback controls
- `src/components/MediaUpload/README.md` - Upload docs
- `src/components/Controls/README.md` - Controls docs

## ⚙️ Environment Configuration

See `.env.example` for required environment variables:
- `VITE_API_BASE_URL` - Backend API endpoint
- `VITE_NANO_BANANA_API_URL` - AI image generation API
- Various upload and timeline settings

Built with ⚡ by 5 parallel AI agents
