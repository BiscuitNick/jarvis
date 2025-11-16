import { MediaUpload, MediaLibrary } from './components/MediaUpload';
import { Timeline } from './components/Timeline/Timeline';
import { useMediaLibrary } from './hooks/useMediaLibrary';
import { usePlayback } from './hooks/usePlayback';
import { useClipEditor } from './hooks/useClipEditor';
import { useExport } from './hooks/useExport';
import { useTimelineStore } from './store/timelineStore';
import { useEditorStore } from './store/editorStore';
import type { MediaItem } from './types';

function App() {
  const { mediaItems, addMedia, removeMedia } = useMediaLibrary({ autoLoad: true });

  // Timeline state
  const tracks = useTimelineStore((state: any) => state.tracks);
  const items = useTimelineStore((state: any) => state.items);
  const updateItem = useTimelineStore((state: any) => state.updateItem);

  // Editor state
  const selectedItemId = useEditorStore((state: any) => state.selectedItemId);
  const setSelectedItemId = useEditorStore((state: any) => state.setSelectedItemId);
  const zoom = useEditorStore((state: any) => state.zoom);
  const setZoom = useEditorStore((state: any) => state.setZoom);

  // Calculate timeline duration
  const timelineDuration = Math.max(
    ...items.map((item: any) => item.startTime + item.duration),
    10
  );

  // Hooks
  const playback = usePlayback(timelineDuration);
  const clipEditor = useClipEditor(
    items,
    (updatedItems: any) => {
      updatedItems.forEach((item: any) => updateItem(item.id, item));
    }
  );
  const exportHook = useExport();

  // Get selected item
  const selectedItem = items.find((item: any) => item.id === selectedItemId);

  // Handle media upload complete
  const handleUploadComplete = (response: any) => {
    const newMediaItem: MediaItem = {
      id: response.id || `media-${Date.now()}`,
      name: response.name || 'Untitled',
      type: response.type || 'video',
      url: response.url || '',
      thumbnailUrl: response.thumbnailUrl,
      duration: response.duration,
      size: response.size || 0,
      uploadedAt: new Date().toISOString(),
    };
    addMedia(newMediaItem);
  };

  // Handle export
  const handleExport = async () => {
    try {
      await exportHook.startExport();
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-700 bg-gray-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Video Editor Timeline
            </h1>
            <div className="flex gap-2">
              <button
                onClick={handleExport}
                disabled={exportHook.exportProgress.isExporting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
              >
                {exportHook.exportProgress.isExporting ? 'Exporting...' : 'Export'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar - Media Library */}
          <div className="lg:col-span-1 space-y-4">
            <MediaUpload
              onUploadComplete={handleUploadComplete}
              onUploadError={(error) => console.error('Upload error:', error)}
            />

            <MediaLibrary
              mediaItems={mediaItems}
              onDelete={removeMedia}
              onMediaDragStart={(media) => console.log('Dragging:', media.name)}
            />
          </div>

          {/* Main Timeline Area */}
          <div className="lg:col-span-3 space-y-4">
            {/* Video Preview */}
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="aspect-video bg-black rounded flex items-center justify-center">
                <p className="text-gray-400">Video preview (playback: {playback.playbackState.isPlaying ? 'playing' : 'paused'})</p>
              </div>

              <div className="mt-4">
                <div className="flex gap-2 items-center">
                  <button
                    onClick={playback.togglePlayPause}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded"
                  >
                    {playback.playbackState.isPlaying ? 'Pause' : 'Play'}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max={timelineDuration}
                    value={playback.playbackState.currentTime}
                    onChange={(e) => playback.seek(parseFloat(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-sm">{playback.playbackState.currentTime.toFixed(1)}s / {timelineDuration.toFixed(1)}s</span>
                </div>
              </div>
            </div>

            {/* Clip Controls (shown when item selected) */}
            {selectedItem && (
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <h3 className="font-semibold mb-2">Selected: {selectedItem.name}</h3>
                <div className="space-y-2">
                  <div>
                    <label className="text-sm">Start: {selectedItem.startTime.toFixed(2)}s</label>
                  </div>
                  <div>
                    <label className="text-sm">Duration: {selectedItem.duration.toFixed(2)}s</label>
                  </div>
                  <button
                    onClick={() => {
                      clipEditor.deleteClip(selectedItem.id);
                      setSelectedItemId(null);
                    }}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="mb-4 flex justify-between items-center">
                <h2 className="text-lg font-semibold">Timeline</h2>
                <div className="flex gap-2">
                  <button onClick={() => setZoom(Math.max(25, zoom - 10))} className="px-2 py-1 bg-gray-700 rounded">-</button>
                  <span className="px-2 py-1">{zoom}%</span>
                  <button onClick={() => setZoom(Math.min(400, zoom + 10))} className="px-2 py-1 bg-gray-700 rounded">+</button>
                </div>
              </div>

              <Timeline />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-700 bg-gray-900/50 backdrop-blur-sm mt-8">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center text-sm text-gray-400">
            <div>
              Tracks: {tracks.length} | Items: {items.length} | Duration: {timelineDuration.toFixed(1)}s
            </div>
            <div>
              {selectedItem ? `Selected: ${selectedItem.name}` : 'No item selected'}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
