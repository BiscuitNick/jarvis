import React, { useRef, useState } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useTimeline } from '../../hooks/useTimeline';
import { useSnapping } from '../../hooks/useSnapping';
import { TimeRuler } from './TimeRuler';
import { TrackList } from './TrackList';
import type { TimelineItem as TimelineItemType } from '../../types/timeline';

export const Timeline: React.FC = () => {
  const timeline = useTimeline();
  const { state } = timeline;
  const [activeItem, setActiveItem] = useState<TimelineItemType | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { snapTime } = useSnapping({
    tracks: state.tracks,
    snapToGrid: state.snapToGrid,
    snapInterval: state.snapInterval,
  });

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    if (active.data.current?.type === 'timeline-item') {
      setActiveItem(active.data.current.item);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || !active.data.current) {
      setActiveItem(null);
      return;
    }

    const draggedItem = active.data.current.item as TimelineItemType;
    
    if (over.data.current?.type === 'track') {
      const targetTrackId = over.data.current.trackId;
      const delta = event.delta;
      const timeDelta = delta.x / state.zoom;
      const newStartTime = snapTime(draggedItem.startTime + timeDelta, draggedItem.id);

      if (newStartTime >= 0) {
        timeline.moveItem(draggedItem.id, targetTrackId, newStartTime);
      }
    }

    setActiveItem(null);
  };

  const handleAddDemoItem = () => {
    if (state.tracks.length === 0) return;
    
    const demoItem: TimelineItemType = {
      id: 'item-' + Date.now(),
      type: 'video',
      trackId: state.tracks[0].id,
      startTime: 0,
      duration: 3,
      name: 'Demo Clip',
    };
    
    timeline.addItem(state.tracks[0].id, demoItem);
  };

  const handleAddImageItem = () => {
    if (state.tracks.length === 0) return;
    
    const imageItem: TimelineItemType = {
      id: 'item-' + Date.now(),
      type: 'image',
      trackId: state.tracks[0].id,
      startTime: 4,
      duration: 2,
      name: 'Image Clip',
    };
    
    timeline.addItem(state.tracks[0].id, imageItem);
  };

  const handleAddTextItem = () => {
    if (state.tracks.length === 0) return;
    
    const textItem: TimelineItemType = {
      id: 'item-' + Date.now(),
      type: 'text',
      trackId: state.tracks[0].id,
      startTime: 7,
      duration: 4,
      name: 'Text Overlay',
    };
    
    timeline.addItem(state.tracks[0].id, textItem);
  };

  return (
    <div className="flex flex-col h-screen bg-timeline-bg text-white">
      <div className="bg-timeline-track border-b border-gray-700 p-4 flex items-center gap-4">
        <h1 className="text-xl font-bold">Video Timeline Editor</h1>
        
        <div className="flex gap-2 ml-auto">
          <button
            onClick={handleAddDemoItem}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-sm rounded transition-colors"
          >
            Add Video Clip
          </button>
          <button
            onClick={handleAddImageItem}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-sm rounded transition-colors"
          >
            Add Image
          </button>
          <button
            onClick={handleAddTextItem}
            className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-sm rounded transition-colors"
          >
            Add Text
          </button>
          
          <div className="border-l border-gray-600 mx-2" />
          
          <button
            onClick={timeline.zoomOut}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-sm rounded transition-colors"
          >
            -
          </button>
          <span className="px-3 py-1 bg-gray-800 text-sm rounded">
            {Math.round(state.zoom)}px/s
          </span>
          <button
            onClick={timeline.zoomIn}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-sm rounded transition-colors"
          >
            +
          </button>
          
          <button
            onClick={timeline.toggleSnapToGrid}
            className={'px-3 py-1 text-sm rounded transition-colors ' + (state.snapToGrid ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-600')}
          >
            Snap: {state.snapToGrid ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      <div className="flex border-b border-gray-700">
        <div className="w-40 bg-timeline-track border-r border-gray-700" />
        <div className="flex-1 overflow-x-auto" ref={scrollContainerRef}>
          <TimeRuler
            zoom={state.zoom}
            totalDuration={state.totalDuration}
            onSeek={timeline.setPlayheadPosition}
          />
        </div>
      </div>

      <DndContext
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto">
            <TrackList
              tracks={state.tracks}
              zoom={state.zoom}
              totalDuration={state.totalDuration}
              selectedItemId={state.selectedItemId}
              onAddTrack={timeline.addTrack}
              onRemoveTrack={timeline.removeTrack}
              onSelectItem={timeline.selectItem}
              onUpdateItem={timeline.updateItem}
              onSnapTime={snapTime}
            />
          </div>
        </div>

        <DragOverlay>
          {activeItem ? (
            <div
              className="bg-blue-600 rounded border-2 border-white opacity-75 p-2 text-xs text-white"
              style={{ width: activeItem.duration * state.zoom + 'px' }}
            >
              {activeItem.name}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div
        className="absolute top-0 w-0.5 bg-timeline-playhead pointer-events-none z-20"
        style={{
          left: 40 + state.playheadPosition * state.zoom + 'px',
          height: '100%',
          boxShadow: '0 0 8px rgba(255, 68, 68, 0.8)',
        }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-timeline-playhead" />
      </div>
    </div>
  );
};
