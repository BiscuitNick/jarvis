import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { Track as TrackType, TimelineItem as TimelineItemType } from '../../types/timeline';
import { TimelineItem } from './TimelineItem';

interface TrackProps {
  track: TrackType;
  zoom: number;
  totalDuration: number;
  selectedItemId: string | null;
  onSelectItem: (id: string) => void;
  onUpdateItem: (id: string, updates: Partial<TimelineItemType>) => void;
  onSnapTime: (time: number, excludeItemId: string) => number;
  onRemoveTrack: (trackId: string) => void;
}

export const Track: React.FC<TrackProps> = ({
  track,
  zoom,
  totalDuration,
  selectedItemId,
  onSelectItem,
  onUpdateItem,
  onSnapTime,
  onRemoveTrack,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: track.id,
    data: {
      type: 'track',
      trackId: track.id,
    },
  });

  return (
    <div className="flex border-b border-gray-700">
      <div className="w-40 bg-timeline-track border-r border-gray-700 p-2 flex flex-col justify-between">
        <div>
          <input
            type="text"
            value={track.name}
            className="w-full bg-transparent text-white text-sm border-none outline-none"
            readOnly
          />
        </div>
        <button
          onClick={() => onRemoveTrack(track.id)}
          className="text-xs text-red-400 hover:text-red-300"
          title="Remove track"
        >
          Remove
        </button>
      </div>

      <div
        ref={setNodeRef}
        className={'relative bg-timeline-track ' + (isOver ? 'bg-timeline-hover' : '')}
        style={{
          width: totalDuration * zoom + 'px',
          height: track.height + 'px',
        }}
      >
        {track.items.map((item) => (
          <TimelineItem
            key={item.id}
            item={item}
            zoom={zoom}
            isSelected={selectedItemId === item.id}
            onSelect={onSelectItem}
            onUpdate={onUpdateItem}
            onSnapTime={onSnapTime}
          />
        ))}
      </div>
    </div>
  );
};
