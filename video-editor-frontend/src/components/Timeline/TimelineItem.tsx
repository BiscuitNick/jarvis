import React, { useState, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { TimelineItem as TimelineItemType } from '../../types/timeline';

interface TimelineItemProps {
  item: TimelineItemType;
  zoom: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<TimelineItemType>) => void;
  onSnapTime: (time: number, excludeItemId: string) => number;
}

export const TimelineItem: React.FC<TimelineItemProps> = ({
  item,
  zoom,
  isSelected,
  onSelect,
  onUpdate,
  onSnapTime,
}) => {
  const [isResizing, setIsResizing] = useState<'start' | 'end' | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [originalStartTime, setOriginalStartTime] = useState(0);
  const [originalDuration, setOriginalDuration] = useState(0);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: {
      type: 'timeline-item',
      item,
    },
  });

  useEffect(() => {
    if (isResizing) {
      const handleMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - resizeStartX;
        const deltaTime = deltaX / zoom;

        if (isResizing === 'start') {
          const newStartTime = onSnapTime(originalStartTime + deltaTime, item.id);
          const timeDiff = newStartTime - originalStartTime;
          const newDuration = Math.max(0.1, originalDuration - timeDiff);
          
          if (newStartTime >= 0 && newDuration > 0.1) {
            onUpdate(item.id, {
              startTime: newStartTime,
              duration: newDuration,
            });
          }
        } else if (isResizing === 'end') {
          const newDuration = Math.max(0.1, originalDuration + deltaTime);
          const newEndTime = onSnapTime(originalStartTime + newDuration, item.id);
          const snappedDuration = newEndTime - originalStartTime;
          
          if (snappedDuration > 0.1) {
            onUpdate(item.id, {
              duration: snappedDuration,
            });
          }
        }
      };

      const handleMouseUp = () => {
        setIsResizing(null);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, resizeStartX, zoom, originalStartTime, originalDuration, item.id, onUpdate, onSnapTime]);

  const handleResizeStart = (e: React.MouseEvent, handle: 'start' | 'end') => {
    e.stopPropagation();
    setIsResizing(handle);
    setResizeStartX(e.clientX);
    setOriginalStartTime(item.startTime);
    setOriginalDuration(item.duration);
  };

  const width = item.duration * zoom;
  const left = item.startTime * zoom;

  const style: React.CSSProperties = {
    width: width + 'px',
    left: left + 'px',
    transform: transform ? 'translateX(' + transform.x + 'px) translateY(' + transform.y + 'px)' : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  const getItemColor = () => {
    switch (item.type) {
      case 'video':
        return 'bg-blue-600';
      case 'image':
        return 'bg-green-600';
      case 'text':
        return 'bg-purple-600';
      case 'audio':
        return 'bg-yellow-600';
      default:
        return 'bg-gray-600';
    }
  };

  return (
    <div
      ref={setNodeRef}
      className={'absolute top-1 h-16 rounded cursor-move border-2 ' + getItemColor() + ' ' + (isSelected ? 'border-white' : 'border-transparent') + ' hover:border-gray-300 transition-colors overflow-hidden'}
      style={style}
      onClick={() => onSelect(item.id)}
      {...listeners}
      {...attributes}
    >
      <div
        className="absolute left-0 top-0 w-1 h-full bg-white opacity-0 hover:opacity-100 cursor-ew-resize z-10"
        onMouseDown={(e) => handleResizeStart(e, 'start')}
      />

      <div className="px-2 py-1 text-xs text-white truncate pointer-events-none select-none">
        <div className="font-semibold">{item.name}</div>
        <div className="text-gray-200">{item.duration.toFixed(1)}s</div>
      </div>

      {item.thumbnail && (
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <img
            src={item.thumbnail}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div
        className="absolute right-0 top-0 w-1 h-full bg-white opacity-0 hover:opacity-100 cursor-ew-resize z-10"
        onMouseDown={(e) => handleResizeStart(e, 'end')}
      />
    </div>
  );
};
