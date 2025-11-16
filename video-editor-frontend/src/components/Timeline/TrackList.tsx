import React from 'react';
import type { Track as TrackType, TimelineItem as TimelineItemType } from '../../types/timeline';
import { Track } from './Track';

interface TrackListProps {
  tracks: TrackType[];
  zoom: number;
  totalDuration: number;
  selectedItemId: string | null;
  onAddTrack: () => void;
  onRemoveTrack: (trackId: string) => void;
  onSelectItem: (id: string) => void;
  onUpdateItem: (id: string, updates: Partial<TimelineItemType>) => void;
  onSnapTime: (time: number, excludeItemId: string) => number;
}

export const TrackList: React.FC<TrackListProps> = ({
  tracks,
  zoom,
  totalDuration,
  selectedItemId,
  onAddTrack,
  onRemoveTrack,
  onSelectItem,
  onUpdateItem,
  onSnapTime,
}) => {
  return (
    <div className="flex-1 overflow-auto">
      <div className="flex border-b border-gray-700 bg-timeline-bg sticky top-0 z-10">
        <div className="w-40 bg-timeline-track border-r border-gray-700 p-2">
          <button
            onClick={onAddTrack}
            className="w-full px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
          >
            + Add Track
          </button>
        </div>
        <div style={{ width: totalDuration * zoom + 'px' }} />
      </div>

      {tracks.map((track) => (
        <Track
          key={track.id}
          track={track}
          zoom={zoom}
          totalDuration={totalDuration}
          selectedItemId={selectedItemId}
          onSelectItem={onSelectItem}
          onUpdateItem={onUpdateItem}
          onSnapTime={onSnapTime}
          onRemoveTrack={onRemoveTrack}
        />
      ))}
    </div>
  );
};
